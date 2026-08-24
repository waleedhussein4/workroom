import { relations } from 'drizzle-orm'
import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { organization, user } from './auth.js'
import { bytea, orderKey } from './columns.js'

export const board = pgTable(
  'board',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('board_org_idx').on(t.orgId, t.createdAt.desc())],
)

export const boardColumn = pgTable(
  'board_column',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => board.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: orderKey('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // The ordering index. Every read sorts by (position, id), and the id is part
  // of the index so ties resolve without a separate sort step.
  (t) => [index('board_column_order_idx').on(t.boardId, t.position, t.id)],
)

export const card = pgTable(
  'card',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => board.id, { onDelete: 'cascade' }),
    columnId: uuid('column_id')
      .notNull()
      .references(() => boardColumn.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    assigneeId: text('assignee_id').references(() => user.id, { onDelete: 'set null' }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    position: orderKey('position').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Deliberately no unique constraint on (column_id, position). Two clients
  // dropping into the same gap can legitimately produce the same key; the
  // (position, id) sort makes that harmless. A unique constraint would turn it
  // into a failed write and a card visibly snapping back instead.
  (t) => [
    index('card_order_idx').on(t.columnId, t.position, t.id),
    index('card_board_idx').on(t.boardId),
    index('card_assignee_idx').on(t.assigneeId),
  ],
)

export const label = pgTable(
  'label',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('label_org_idx').on(t.orgId)],
)

export const cardLabel = pgTable(
  'card_label',
  {
    cardId: uuid('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => label.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.labelId] }),
    index('card_label_label_idx').on(t.labelId),
  ],
)

export const comment = pgTable(
  'comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => card.id, { onDelete: 'cascade' }),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('comment_card_idx').on(t.cardId, t.createdAt)],
)

export const document = pgTable(
  'document',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    boardId: uuid('board_id').references(() => board.id, { onDelete: 'set null' }),
    title: text('title').notNull().default('Untitled'),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('document_org_idx').on(t.orgId, t.updatedAt.desc())],
)

/**
 * Yjs state, one row per document.
 *
 * A full snapshot rather than an append-only update log. Snapshots rewrite the
 * whole value on every save, which is the wrong shape for very large
 * documents but entirely fine at the size a page of notes reaches, and it
 * keeps loading to a single read with no compaction job to run.
 */
export const documentState = pgTable('document_state', {
  documentId: uuid('document_id')
    .primaryKey()
    .references(() => document.id, { onDelete: 'cascade' }),
  state: bytea('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const boardRelations = relations(board, ({ many, one }) => ({
  columns: many(boardColumn),
  cards: many(card),
  documents: many(document),
  organization: one(organization, { fields: [board.orgId], references: [organization.id] }),
}))

export const boardColumnRelations = relations(boardColumn, ({ many, one }) => ({
  board: one(board, { fields: [boardColumn.boardId], references: [board.id] }),
  cards: many(card),
}))

export const cardRelations = relations(card, ({ many, one }) => ({
  board: one(board, { fields: [card.boardId], references: [board.id] }),
  column: one(boardColumn, { fields: [card.columnId], references: [boardColumn.id] }),
  assignee: one(user, { fields: [card.assigneeId], references: [user.id] }),
  comments: many(comment),
  labels: many(cardLabel),
}))

export const cardLabelRelations = relations(cardLabel, ({ one }) => ({
  card: one(card, { fields: [cardLabel.cardId], references: [card.id] }),
  label: one(label, { fields: [cardLabel.labelId], references: [label.id] }),
}))

export const commentRelations = relations(comment, ({ one }) => ({
  card: one(card, { fields: [comment.cardId], references: [card.id] }),
  author: one(user, { fields: [comment.authorId], references: [user.id] }),
}))

export const documentRelations = relations(document, ({ one }) => ({
  board: one(board, { fields: [document.boardId], references: [board.id] }),
  organization: one(organization, { fields: [document.orgId], references: [organization.id] }),
  state: one(documentState, {
    fields: [document.id],
    references: [documentState.documentId],
  }),
}))

export type Board = typeof board.$inferSelect
export type BoardColumn = typeof boardColumn.$inferSelect
export type Card = typeof card.$inferSelect
export type Label = typeof label.$inferSelect
export type Comment = typeof comment.$inferSelect
export type Document = typeof document.$inferSelect
