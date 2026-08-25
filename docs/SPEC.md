# Workroom

Workroom is a collaborative workspace for small teams. It combines Kanban boards for planning with live documents for writing, and everything in it syncs in real time.

This document covers the product surfaces, the data model, and the design decisions that aren't obvious from reading the code. The ordering section is the important one.

## Who it's for

Small teams of builders: indie hackers, two-to-five person dev and design teams, student project groups. The kind of team that currently runs a Trello board, a shared Google Doc, and a Discord channel, and would rather have one thing.

Two surfaces, because planning and thinking need different tools:

- **Boards.** Structured work. Columns, cards, assignees, due dates. Queryable.
- **Docs.** Freeform writing. Rich text, checklists, code blocks.

## Product surfaces

### Workspaces

The top-level container. A user can belong to several. Members have one of four roles:

| Role   | Boards               | Cards | Docs | Comments        | Members                     | Settings               |
| ------ | -------------------- | ----- | ---- | --------------- | --------------------------- | ---------------------- |
| owner  | full                 | full  | full | full            | invite, remove, set roles   | edit, delete workspace |
| admin  | full                 | full  | full | full            | invite, remove (not owners) | edit                   |
| member | create, read, update | full  | full | create/edit own | read                        | read                   |
| viewer | read                 | read  | read | read            | read                        | read                   |

Every mutation checks the caller's role server-side. Hiding a button in the UI is a convenience, not a control.

There is no email confirmation step. Confirming an address proves the person signing up can read that inbox, and nothing here acts on that: an account reaches only the workspaces it creates or is invited to, and an invitation is addressed to a mailbox somebody already controls. The check would buy no access control while costing every visitor a round trip through their inbox. It also cannot be made to work on a shared sending address, which only delivers to the account that owns it, so requiring confirmation would hand every other address an account it could never sign in to. Password resets and invitations still send mail, because both are addressed to somebody already reachable.

### Boards

Board, columns, cards. Cards carry a title, description, assignee, labels, due date, and a comment thread.

Drag-and-drop reordering syncs to everyone viewing the board. The bar is that two people dragging different cards at the same moment must not end up seeing different column orders. How that's guaranteed is in [Ordering](#ordering).

### Docs

Rich text: headings, bullet and ordered lists, task checkboxes, code blocks, blockquotes, links. A doc can hang off a board or stand alone in the workspace.

Several people can type in the same paragraph at once. Merging happens per character, not per save.

### Presence

- Labelled cursors in docs
- Avatar stack on boards showing who's looking
- A ghost on a card somebody else is dragging
- Online/idle, where idle is 60 seconds without input

### Comments

Flat threads on cards. Author, body, timestamps. You can edit and delete your own. They appear live.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Browser                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Board UI     │  │ Doc editor   │  │ Presence         │  │
│  │ dnd-kit      │  │ Tiptap       │  │ awareness        │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
└─────────┼─────────────────┼───────────────────┼────────────┘
          │ Server Actions  │  WebSocket (Yjs + awareness)
          │ (HTTPS)         └───────────────────┼────────────┐
          ▼                                     ▼            │
┌──────────────────────┐            ┌──────────────────────┐ │
│ Next.js @ Vercel     │            │ Hocuspocus @ Fly.io  │ │
│  • Better Auth       │  ticket    │  • onAuthenticate    │ │
│  • guards            │───JWT────▶ │  • doc:<id> rooms    │ │
│  • Server Actions    │  publish   │  • board:<id> rooms  │ │
│  • ticket endpoint   │───HTTP───▶ │  • /internal/publish │ │
└──────────┬───────────┘  (secret)  └──────────┬───────────┘ │
           │                                   │             │
           │        ┌──────────────────┐       │             │
           └───────▶│  Neon Postgres   │◀──────┘             │
                    │  app tables      │  Y.Doc snapshots    │
                    └──────────────────┘                     │
                                                             │
  Yjs updates ─────────────────────────────────────────────┘
```

Two services. The Next.js app owns HTTP, auth, and all writes to Postgres. A separate Node process runs Hocuspocus and owns WebSocket connections. They share a database and two secrets.

Splitting them isn't architectural purity, it's a constraint. Serverless functions cap connection lifetime, and a document sync that drops every few minutes and has to resync is not a real-time system.

### Two kinds of room

The sync server serves two room types over the same socket.

`doc:<documentId>` holds an actual `Y.Doc`. Body content lives in a `Y.XmlFragment`, Tiptap binds to it, and awareness carries cursor and selection. It's snapshotted to Postgres.

`board:<boardId>` holds no document at all. It carries awareness (who's viewing, who's dragging) plus mutation events published by the server. It's a fan-out pipe, nothing more. No board data lives in a CRDT.

### Moving a card

Postgres is the only source of truth for card order.

1. The user drags. The client reorders locally and computes a provisional key so there's no wait.
2. The client calls the `moveCard` action with **neighbour ids, not a key**: `{ cardId, toColumnId, beforeId, afterId }`.
3. The action resolves the session, the workspace membership, and the role. It rejects if the role can't update cards.
4. In one transaction: re-read both neighbours' current keys, generate a jittered key between them, update the one card row.
5. The action posts the event to the sync server's `/internal/publish` endpoint behind a shared secret.
6. The sync server broadcasts it to `board:<boardId>`.
7. Other clients patch their cache and re-sort. The mover reconciles its provisional key with the real one.

Sending neighbour ids rather than a key is what makes concurrent drops into the same gap safe. The server reads the neighbours inside the transaction, so it's working from committed state rather than whatever the client saw a moment ago. The client's optimistic key exists only so the card moves under the cursor immediately.

Publishing from the server rather than the client is deliberate too. Only the server knows a write actually committed and passed authorization.

On reconnect the client refetches the board, which covers anything missed while the socket was down.

### Editing a doc

The client asks for a ticket, connects to `doc:<id>`, and Hocuspocus loads the stored state into a `Y.Doc`. Edits produce Yjs updates that the server relays and, debounced at 2 seconds with a 10 second ceiling, writes back as a snapshot. Both numbers are set explicitly on the extension rather than inherited, so this paragraph stays true if the library changes its defaults.

One rule with no exceptions: **the load hook returns the exact bytes that were stored.** Never rebuild a `Y.Doc` from editor JSON or HTML on the server. A rebuilt document has fresh client ids, and merging it into a live one duplicates the entire contents.

Awareness state is never persisted.

### WebSocket auth

Browsers can't set headers on `new WebSocket()`, so the client trades a session for a short-lived ticket.

```
POST /api/realtime/ticket  { room: "doc:abc" }
  session -> resolve the room to its workspace -> check membership and role
  -> sign a JWT { sub, room, canWrite, exp: +60s }

wss://sync.../doc:abc?token=<jwt>
  onAuthenticate:
    verify signature and expiry
    assert payload.room === documentName
    connection.readOnly = !payload.canWrite
```

The `payload.room === documentName` check is the important line. Without it a valid ticket for one room would open any room.

## Ordering

Board order is stored per row as a fractional index: an opaque string that sorts lexicographically. To drop a card between two others you generate a key strictly between theirs. Moving a card writes exactly one row.

```
generateKeyBetween(null, null)  -> "a0"    first card
generateKeyBetween("a0", null)  -> "a1"    append
generateKeyBetween("a0", "a1")  -> "a0V"   insert between
generateKeyBetween(null, "a0")  -> "Zz"    prepend
```

Strings rather than floats because doubles run out of mantissa after about 52 bisections, at which point two adjacent items become numerically equal.

### The failure mode

`generateKeyBetween` is deterministic. Two clients looking at the same gap compute the same key. That's not a probability, it's a certainty whenever two people drop cards into the same place at once.

The consequence is subtle. Nothing in the database is corrupt. But `ORDER BY position` alone is not a total order once keys tie, so Postgres is free to return the tied rows in either order, and it can return a different order to different sessions. One person sees `[X, Y]`, the other sees `[Y, X]`, and both are looking at identical data.

### Three layers

**A total order.** Every read path sorts by `(position, id)`. SQL, the client cache, the optimistic reducer, test fixtures. Ties become harmless because every client independently computes the same sequence. This is the actual fix, and everything else is insurance on top of it.

There's a test that asserts a tie converges, and a second test asserting that it _stops_ converging if the `id` tiebreak is removed. The second one exists so that whoever eventually decides `comparePositioned` looks over-complicated finds out immediately.

**Server-assigned keys.** The move API takes neighbour ids and the server generates the key inside the transaction, so it can't be working from a stale view of the gap.

**Jitter.** Bisecting the remaining range 30 times, choosing a side at random each time, makes identical keys rare instead of certain. Costs a few characters per key.

Jitter is implemented directly in `packages/core/src/ordering.ts` rather than pulled from `jittered-fractional-indexing`, which pins `fractional-indexing@^3.2.0`. Two copies of the key generator in one dependency tree is a bad trade for the one module everything else depends on being correct. The technique is ten lines and the bit source is injectable, which also makes the tests deterministic.

There's a safety valve: any column whose longest key passes 64 characters gets rebalanced with evenly spaced keys in a single transaction. Reaching that requires pathological repeated insertion into one gap, but the watchdog means it degrades instead of growing forever. Don't rebalance a column while a drag is in flight on it, since it rewrites every row.

### Dragging against live updates

While a drag is in progress, order events for the affected columns are buffered rather than applied. Everything else still applies: title changes, label changes, other columns, presence. Freezing the whole board during a drag is worse than briefly freezing one column.

On drop, the buffer flushes and the order is re-derived and diffed against the optimistic state. If the write was rejected, the card animates back with a toast rather than sitting somewhere it wasn't saved.

The board also broadcasts who's dragging what. It doesn't prevent conflicts but it removes most of the perceived ones.

### Why not one mechanism for both surfaces

Fractional indexing on document text would be wrong. It interleaves: two people each inserting a run of items at the same spot produce `A1 B1 A2 B2`. For cards in a column that's cosmetic. For characters in a sentence it's unreadable.

A CRDT for card order would also be wrong. A `Y.Doc` is an opaque binary log, so "every card assigned to me, in order" means materialising every board in Node. Authorization is per-document rather than per-row. And order doesn't exist until the document loads, so first paint has nothing to sort by.

Yjs removed the `Y.Array` move operation in v14 for related reasons, since reorder-as-delete-plus-insert can duplicate or drop the moved element under concurrency. Their suggested replacement is fractional indexing.

## Data model

Drizzle schema in `packages/db`. Migrations are generated and reviewed as SQL; `push` is for local scratch work only.

A workspace **is** a Better Auth organization. There's no parallel table, and `member.role` holds the four roles.

```sql
board (
  id uuid PK,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
INDEX board_org_idx ON board (org_id, created_at DESC)

board_column (
  id uuid PK,
  board_id uuid NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  name text NOT NULL,
  position text COLLATE "C" NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)
INDEX board_column_order_idx ON board_column (board_id, position, id)

card (
  id uuid PK,
  board_id uuid NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES board_column(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assignee_id text REFERENCES "user"(id) ON DELETE SET NULL,
  due_date timestamptz,
  position text COLLATE "C" NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
INDEX card_order_idx ON card (column_id, position, id)
INDEX card_board_idx ON card (board_id)

label (id uuid PK, org_id text NOT NULL, name text NOT NULL, color text NOT NULL)
card_label (card_id uuid, label_id uuid, PRIMARY KEY (card_id, label_id))

comment (
  id uuid PK,
  card_id uuid NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
INDEX comment_card_idx ON comment (card_id, created_at)

document (
  id uuid PK,
  org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  board_id uuid REFERENCES board(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled',
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
INDEX document_org_idx ON document (org_id, updated_at DESC)

document_state (
  document_id uuid PK REFERENCES document(id) ON DELETE CASCADE,
  state bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)
```

Two things here are load-bearing and easy to miss.

**`COLLATE "C"` on the position columns is not optional.** Fractional index keys are case-sensitive and compare by byte. Under a default locale collation Postgres sorts `'A'` and `'a'` by locale rules, which disagrees with the client's comparison, and you get an ordering bug that looks exactly like the concurrency bug this whole design exists to prevent.

**There is no unique constraint on `(column_id, position)`.** Adding one would turn a harmless tie into a failed write and a card visibly snapping back. The tie is already handled by the sort.

## Design

Tokens live in `apps/web/app/globals.css`. Tailwind v4 is CSS-first: no `tailwind.config.js`, theme values in `@theme`, dark mode as a `@custom-variant`.

Colours are OKLCH so lightness is perceptually uniform and the dark palette can be derived by moving L rather than hand-picking a second set of hexes.

- **Type scale**: 11 / 12 / 13 / 15 / 18 / 24 / 32, tighter than Tailwind's default because this is a dense product UI
- **Radius**: 6 / 10 / 14
- **Motion**: 120ms for hover and press, 180ms for enter and exit, 240ms for reflow caused by somebody else's edit
- **Presence**: eight fixed hues at fixed lightness and chroma, assigned by hashing a user id, so a person keeps their colour and stays legible on both themes

Remote changes animate more slowly than local ones on purpose. A card that teleports because someone else moved it reads as a glitch; a card that slides reads as an event.

dnd-kit owns movement during a drag, and nothing else animates the same nodes. Everything else is a CSS transition against the duration tokens above; there is no animation library, because a second thing transforming the elements dnd-kit is already transforming is a fight nobody wins.

Every surface that loads data has a designed empty, loading, and error state. Loading is a skeleton shaped like the real content, not a centred spinner.

## Stack

| Layer       | Choice                            |
| ----------- | --------------------------------- |
| Framework   | Next.js 16, App Router            |
| UI          | React 19, Tailwind 4, shadcn/ui   |
| Drag & drop | @dnd-kit/react                    |
| Auth        | Better Auth + organization plugin |
| Database    | Postgres (Neon) via Drizzle       |
| CRDT        | Yjs 13 + Hocuspocus 4             |
| Editor      | Tiptap 3                          |
| Tests       | Vitest, fast-check, Playwright    |

### Notes on the choices

**Better Auth over Auth.js.** Auth.js can't give database sessions alongside password login. Its credentials provider forces `strategy: 'jwt'`, which means either giving up server-side session revocation or reimplementing sessions by hand. Better Auth ships email/password with scrypt, verification, reset, and enumeration defence, keeps sessions in our Postgres, and its organization plugin models the four roles as plain data that's trivial to unit test.

**Drizzle over Prisma.** Prisma 7 is much better than its reputation, but it's ESM-only with a mandatory codegen step at a custom output path. Drizzle's schema is plain TypeScript values, so permission and ordering helpers import straight into Vitest with nothing to generate first. Generated migrations are readable SQL, which matters when the indexes and the collation _are_ the correctness argument.

**Self-hosted Hocuspocus over Liveblocks.** Liveblocks would be faster to build on. Its free tier is metered at 3,000 collaboration-minutes per month, which is about 150 minutes with 20 people in a room, and the app pauses when it runs out. Running a small Node process costs a few dollars a month and doesn't have a cliff.

**Tiptap over BlockNote.** BlockNote gets to Notion-like faster and has collaboration built in, but its `xl-` packages are GPL or commercial. Tiptap is MIT throughout with a first-party Yjs binding.

**@dnd-kit/react over Pragmatic drag-and-drop.** dnd-kit's `move` helper and optimistic sorting plugin are built for exactly this multi-column problem, and keyboard dragging works out of the box. Pragmatic is built on the native HTML5 drag API, which isn't keyboard-accessible, so you'd hand-build that path.

The tradeoff is that `@dnd-kit/react` is pre-1.0 and its npm dist-tag is `beta`. It's pinned to an exact version, and every import of it lives behind a single `BoardDnd` wrapper that exposes `onCardMoved({ cardId, toColumnId, beforeId, afterId })`. Ordering logic and its tests never see the library, so swapping it is one file.

### Version gotchas

Things that cost time if you find them late.

- Next 16 renamed `middleware.ts` to `proxy.ts`. Don't put authorization in either one; CVE-2025-29927 let attackers skip middleware entirely with a header. Auth checks belong in the actions and pages themselves.
- `cacheComponents` is deliberately off. It forces `<Suspense>` around anything reading request data and keeps previous routes mounted, which re-runs WebSocket effects on back-navigation.
- `next lint` was removed. ESLint runs from its own CLI.
- Stay on `yjs` 13. v14 is RC, lives under a new npm scope, and has inconsistent dist-tags.
- `y-websocket` v3 deleted its bundled server.
- Tiptap's collaboration cursor package is now `@tiptap/extension-collaboration-caret`, and its collab extensions depend on `@tiptap/y-tiptap` rather than `y-prosemirror`. Installing `y-prosemirror` out of habit puts two ProseMirror bindings in the bundle.
- Tiptap's docs push you toward `@tiptap-pro/provider`, which is paid. The collaboration extensions themselves are MIT and work fine with `@hocuspocus/provider`.
- Tailwind 4 renamed several utilities silently: `shadow-sm` is now `shadow-xs`, `ring` is `ring-3`, and the default border colour is `currentColor`.
- shadcn/ui defaults to Base UI rather than Radix as of July 2026.

## Testing

The ordering and permission logic lives in `packages/core` with no React, no database, and no framework imports. That's not tidiness, it's so the correctness argument runs in milliseconds with nothing to set up.

**Unit.** Property-based tests over key generation: results land strictly between their bounds, random insertion sequences round-trip through a sort, bulk generation is shorter than repeated single generation. Then the concurrency simulation: two clients into one gap converge, all permutations of concurrent moves converge, rebalance preserves order exactly. Permissions are a table test over roles by actions.

There's also a collation guard asserting that a plain JS sort matches byte order, so nobody reaches for `localeCompare`.

**Integration.** Three tests against a real Postgres, skipped when `DATABASE_URL` is unset so a fresh clone still runs `npm test` green. They cover the things a pure function cannot reach.

Two transactions are opened and confirmed live before either takes a lock, then both move a card into the same gap. That asserts the `SELECT ... FOR UPDATE` on the neighbours does not deadlock, that both commit, and that no two rows end up tied on `(position, id)`.

Jitter is then pinned off so two moves produce byte-identical keys, which is the case the schema deliberately leaves unconstrained, and Postgres and the client are asserted to agree on the sequence anyway.

The third asserts positions sort by byte order. The databases used for testing are created with a locale collation on purpose, so the per-column `COLLATE "C"` is what is under test rather than an accident of how the database was made.

An in-process Postgres such as PGlite would be the obvious way to avoid needing a server, and it is the wrong tool for the first of those: it is single-connection, so two concurrent transactions would pass for the wrong reason.

**End to end.** Playwright with two browser contexts and separate stored sessions, exposed as a fixture so a collaboration test is three lines. Ordering is asserted with `toHaveText([...])`, which checks content and order in one auto-retrying call.

The one that matters: both users drag different cards into the same gap simultaneously, then both pages are asserted to show the _same_ order. Not a specific order. Convergence.

No `waitForTimeout` anywhere. Synchronise before acting by asserting the second user's board has rendered and presence shows two people.

**Load.** A Node harness driving N headless Yjs clients, measuring observed sync latency and asserting that every client's document hashes identically at the end. Watch memory after all clients disconnect; documents that never get evicted are the usual way a Yjs server dies.

## Deployment

| Component   | Where                  |
| ----------- | ---------------------- |
| Web app     | Vercel                 |
| Database    | Neon                   |
| Sync server | Fly.io, single machine |
| CI/CD       | GitHub Actions         |
| Monitoring  | Sentry                 |

Deploys run from GitHub Actions rather than Vercel's Git integration, because Actions can gate them on the test jobs passing and the Git integration can't.

One sync machine means one instance owns every room, so there's no Redis and no sticky-session routing to think about. That's plenty: Yjs update messages are often under 50 bytes, and 20 people typing in one document is a few hundred kilobytes a minute.

Secrets: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `REALTIME_JWT_SECRET`, `SYNC_INTERNAL_SECRET`, `NEXT_PUBLIC_SYNC_URL`, and the Sentry set. `REALTIME_JWT_SECRET` and `SYNC_INTERNAL_SECRET` have to match between the web app and the sync server.

Sentry's `beforeSend` filters WebSocket reconnect noise from the start. A reconnect storm will otherwise eat a month of quota in an afternoon.

## Later

Not now, roughly in order of value:

- Command palette
- Activity feed, which the board rooms already carry the events for
- Mentions and notifications
- Public read-only share links
- Document version history, which Yjs snapshots make cheap

Deliberately not doing: AI features, billing, a native mobile app.
