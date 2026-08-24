/**
 * Better Auth tables.
 *
 * Column names are camelCase because that is what Better Auth's adapter
 * expects by default. Renaming them would mean maintaining a field mapping for
 * every table and plugin, which is a lot of surface to get subtly wrong for a
 * cosmetic gain. The application tables use snake_case as normal.
 *
 * A workspace is an `organization`. There is no parallel workspace table, and
 * `member.role` holds owner, admin, member or viewer.
 *
 * This mirrors the output of the Better Auth schema generator. If a Better
 * Auth upgrade adds a column, sign-in starts failing with a missing-column
 * error rather than anything subtle, so it is worth re-checking after a bump.
 */

import { relations } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
})

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Added by the organization plugin: which workspace this session is
    // currently acting in.
    activeOrganizationId: text('activeOrganizationId'),
  },
  (t) => [index('session_userId_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: timestamp('accessTokenExpiresAt', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt', { withTimezone: true }),
    scope: text('scope'),
    // Scrypt hash for email/password accounts. Null for OAuth accounts.
    password: text('password'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('account_userId_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
)

export const organization = pgTable(
  'organization',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    logo: text('logo'),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    metadata: text('metadata'),
  },
  (t) => [uniqueIndex('organization_slug_uidx').on(t.slug)],
)

export const member = pgTable(
  'member',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('member_organizationId_idx').on(t.organizationId),
    index('member_userId_idx').on(t.userId),
    // One membership per person per workspace. Better Auth does not add this
    // itself, and without it a double-accepted invitation silently creates two
    // rows with potentially different roles.
    uniqueIndex('member_org_user_uidx').on(t.organizationId, t.userId),
  ],
)

export const invitation = pgTable(
  'invitation',
  {
    id: text('id').primaryKey(),
    organizationId: text('organizationId')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role'),
    status: text('status').notNull(),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true }).notNull().defaultNow(),
    inviterId: text('inviterId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('invitation_organizationId_idx').on(t.organizationId),
    index('invitation_email_idx').on(t.email),
  ],
)

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  memberships: many(member),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}))

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}))

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}))

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, { fields: [member.userId], references: [user.id] }),
}))

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  inviter: one(user, { fields: [invitation.inviterId], references: [user.id] }),
}))

export type User = typeof user.$inferSelect
export type Session = typeof session.$inferSelect
export type Organization = typeof organization.$inferSelect
export type Member = typeof member.$inferSelect
export type Invitation = typeof invitation.$inferSelect
