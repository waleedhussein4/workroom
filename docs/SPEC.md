# Workroom — Product & Engineering Spec

> **Status:** Approved. Source of truth for the build. No code written yet — M0 (§8) is the next step.
> **Last updated:** 2026-08-24
> **Note:** All library versions in §3 were verified against npm and official docs on 2026-08-24. Re-verify before starting a milestone that hasn't begun — several of these move fast, and §3.1 exists because stale assumptions are the main risk here.

---

## 1. Context

### Why this project exists

This is a **portfolio/resume project**, not a startup. Its job is to make a reader conclude "this person can ship production software" in under two minutes. That goal, not feature count, drives every decision below.

The strategy is to pick one problem that is *genuinely* hard — **real-time collaborative editing with defined conflict-resolution semantics** — and solve it properly, then wrap it in enough product polish that it reads as a real app rather than a demo. Everything that does not serve that goal is cut.

### What it is

**Workroom** is a real-time collaborative workspace for small teams of makers — indie hackers, small dev/design teams, student project groups. Two surfaces in one place:

- **Boards** — Kanban planning. Structured, queryable, permission-checked.
- **Docs** — freeform collaborative rich text. Unstructured, character-level merge.

That pairing is deliberate: it forces two *different* conflict-resolution strategies in one codebase, which is exactly what makes the engineering interesting and the interview conversation good.

### The single technical claim this project makes

> Concurrent edits never corrupt state, and I can prove it — with unit tests, a two-browser E2E test, and a 20-client load harness that asserts convergence.

Two mechanisms, chosen because they are the right tool for each shape of data:

| Surface | Data shape | Mechanism | Source of truth |
|---|---|---|---|
| **Board card order** | Short ordered list, needs SQL queries + row-level authz | **Fractional indexing**, server-assigned keys, `(position, id)` total order | Postgres |
| **Doc body** | Character sequence, needs true concurrent typing | **Yjs CRDT** (`Y.XmlFragment`) | Yjs, snapshotted to Postgres |

The interesting part is not that both exist — it's knowing *why each one is wrong for the other surface*, which is documented in §6.4.

### Non-goals

No AI features. No billing. No native mobile. No admin backoffice. No multi-region. These are stated up front so scope creep has to argue against a written decision.

---

## 2. Product surfaces (MVP)

MVP is the whole of this section, fully polished. Anything not here is Phase 2 (§13).

### 2.1 Workspace
Top-level container. Users can belong to several. Has members with roles.

| Role | Boards | Cards | Docs | Comments | Members | Settings |
|---|---|---|---|---|---|---|
| **owner** | CRUD | CRUD | CRUD | CRUD | invite/remove/change role | edit, delete workspace |
| **admin** | CRUD | CRUD | CRUD | CRUD | invite/remove (not owners) | edit |
| **member** | create, read, update | CRUD | CRUD | create/edit own | read | read |
| **viewer** | read | read | read | read | read | read |

Enforced **server-side on every mutation**. UI hiding is cosmetic only.

### 2.2 Boards
Kanban board → columns → cards. Cards have title, description, assignee, labels, due date, comment thread.

**Drag-and-drop reorders sync live across all viewers.** Two people dragging different cards at the same moment must never produce divergent column order on any client. This is the acceptance bar, and it is tested three ways (§10).

### 2.3 Docs
Rich text: headings (h1–h3), bullet/ordered lists, task checkboxes, code blocks, blockquotes, links, horizontal rules. Attached to a board or standalone in the workspace.

**Multiple people type simultaneously with character-level merge and live labelled cursors.** Not last-write-wins.

### 2.4 Presence
- Live cursors with name + colour in docs
- Avatar stack on boards showing who's viewing
- "X is dragging this card" ghost indicator
- Online / idle status (idle after 60s without input)

### 2.5 Comments
Flat threads on cards. Author, body, timestamps, edit/delete own. Live-updating.

### 2.6 Cross-cutting polish
Every data surface has a designed **empty**, **loading (skeleton, not spinner)**, and **error (with retry)** state. Light + dark mode. No blank screens, ever.

---

## 3. Stack

Every version below was verified against npm / official docs on **2026-08-24**. Items marked ⚠️ are places where a mid-2025 assumption is now wrong — these are the traps.

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js (App Router) | `16.3.3`+ ⚠️ |
| Runtime | React | `19.2` |
| Language | TypeScript | `5.9`+ |
| Styling | Tailwind CSS | `4.3.3` ⚠️ |
| Components | shadcn/ui (Base UI) | CLI `4.19.0` ⚠️ |
| Animation | `motion` | `13.1.1` ⚠️ |
| Drag & drop | `@dnd-kit/react` | `0.5.0` (pinned exact) ⚠️ |
| Ordering | `fractional-indexing` + `jittered-fractional-indexing` | `4.0.0` / `1.0.1` |
| Auth | Better Auth + organization plugin | `1.7.1` ⚠️ |
| ORM | Drizzle ORM / drizzle-kit | `0.45.2` / `0.31.10` |
| Database | Neon Postgres (free) | PG 17 |
| CRDT | `yjs` | `13.6.32` ⚠️ |
| Editor | Tiptap + `@tiptap/y-tiptap` | `3.30.x` / `3.0.9` ⚠️ |
| Sync server | Hocuspocus | `4.6.0` ⚠️ |
| Unit tests | Vitest + fast-check | `4.1.x` ⚠️ |
| E2E | Playwright | `1.62.1` ⚠️ |
| Local DB tests | PGlite | `0.5.7` |
| Monitoring | `@sentry/nextjs` | `10.70.x` ⚠️ |
| Package manager | npm workspaces | npm 11.6.2 |
| Node | 24 LTS | 24.13.0 (installed) |

### 3.1 The traps, explicitly

These cost days if discovered late.

1. **⚠️ `middleware.ts` is deprecated in Next 16 → `proxy.ts`**, and it runs on the Node runtime now. Do not put authorization in it regardless (CVE-2025-29927 let attackers skip middleware entirely with a header). Auth goes in a DAL called from each action/page.
2. **⚠️ Do NOT enable `cacheComponents`.** It's opt-in in 16.3. Enabling it forces `<Suspense>` around anything reading request data and makes Next keep previous routes mounted via `<Activity>` — which re-runs WebSocket effects on back-navigation. Not worth the complexity here. Everything stays dynamic by default, which is correct for a live app anyway.
3. **⚠️ `next lint` was removed.** Use the ESLint CLI directly; `next build` no longer lints.
4. **⚠️ Yjs v14 dropped the `Y.Array` move operation** (May 2026) and the Yjs team's own recommended replacement is *fractional indexing*. Stay on `yjs@13.6.32` — v14 is RC, lives under a new `@y/*` npm scope, and has inconsistent dist-tags.
5. **⚠️ `y-websocket` v3 deleted its bundled server.** `y-websocket/bin/server` no longer exists. Hocuspocus is the maintained self-hosted backend.
6. **⚠️ Tiptap renamed the cursor extension.** `@tiptap/extension-collaboration-cursor` is frozen at v2. Use `@tiptap/extension-collaboration-caret`. CSS classes changed `.collaboration-cursor__*` → `.collaboration-carets__*`.
7. **⚠️ Tiptap collab extensions now depend on `@tiptap/y-tiptap`, not `y-prosemirror`.** Installing `y-prosemirror` out of habit puts two ProseMirror↔Yjs bindings in the bundle.
8. **⚠️ Tiptap's install docs funnel you to `@tiptap-pro/provider` (paid, $59/mo).** It is a sales funnel, not a licensing requirement. `@tiptap/extension-collaboration`, `-caret`, `@tiptap/y-tiptap`, and Hocuspocus are all **MIT and free**. Swap in `@hocuspocus/provider`.
9. **⚠️ `next-auth` `latest` is still v4; v5 is `5.0.0-beta.32` after ~3 years of beta.** More importantly its Credentials provider **forces `strategy: 'jwt'`** — you cannot have database sessions with password login. That alone disqualifies it here.
10. **⚠️ Tailwind v4 has no `tailwind.config.js`.** Config is CSS (`@theme`), dark mode is `@custom-variant`, and the PostCSS plugin moved to `@tailwindcss/postcss`. Also silent renames: `shadow-sm`→`shadow-xs`, `ring`→`ring-3`, default border colour is `currentColor`.
11. **⚠️ shadcn/ui defaults to Base UI, not Radix** (July 2026). Theming is OKLCH + `@theme inline`; `tailwindcss-animate` → `tw-animate-css`; no `forwardRef`.
12. **⚠️ There is no dnd-kit v7.** The maintained line restarted at `0.x` (`@dnd-kit/react`). The old `@dnd-kit/core` v6 is labelled "Legacy" on the docs site.
13. **⚠️ GitHub Actions: `checkout@v6`, `setup-node@v6`** — not v4.
14. **⚠️ Vitest 4: `workspace` → `projects`**, `maxThreads` → `maxWorkers`, and `vi.restoreAllMocks()` no longer resets `vi.fn()`.
15. **⚠️ Sentry: `sentry.client.config.ts` is gone** → `instrumentation-client.ts`.
16. **⚠️ Supabase pauses free projects after 1 week of inactivity** and requires a manual dashboard restore. Disqualifying for a link on a résumé. Neon auto-resumes.
17. **⚠️ Vercel Hobby prohibits commercial use** — including asking for donations. Fine for a personal portfolio piece; do not monetise it without moving to Pro.
18. **Postgres collation:** fractional-index keys are case-sensitive and must compare by byte order. `position` columns **must** be `text COLLATE "C"`. Default locale collation sorts `'A'` and `'a'` by locale rules and silently disagrees with the client. This is the single most likely production footgun in the project.

### 3.2 Decisions and their rationale

**Better Auth over Auth.js and Clerk.** The brief requires email/password + OAuth + workspace roles enforced server-side. Auth.js can't give database sessions alongside password login. Clerk hosts identity elsewhere (webhook-mirrored, eventually consistent) and its free tier fixes sessions at 7 days with Clerk branding. Better Auth ships email/password with scrypt hashing, verification, reset, and email-enumeration defence built in; sessions live in *our* Postgres; and its `organization()` plugin + `createAccessControl` model maps directly onto owner/admin/member/viewer as **pure data**, which is what makes §10.1's permission tests trivial.
*Risk:* young library, actively patching real security bugs. *Mitigation:* pin the exact version, watch the advisory feed, re-check before each deploy.

**Drizzle over Prisma 7.** Prisma 7 is genuinely good now (Rust-free, ~90% smaller) but it's ESM-only with a mandatory codegen step at a custom output path. Drizzle's schema is plain TypeScript values with no codegen, so permission and ordering helpers import straight into Vitest with zero test-pipeline setup. `drizzle-kit generate` also emits readable SQL you can review in a PR — which matters when the indexes and collation *are* the correctness argument.

**Tiptap over BlockNote.** BlockNote is faster to Notion-parity (collab and multi-cursor built in) but its `@blocknote/xl-*` packages are GPL-3.0/commercial, and "I installed BlockNote" is a weaker story than "I wired ProseMirror to a CRDT." Tiptap is MIT throughout with a first-party Yjs binding.

**Self-hosted Hocuspocus over Liveblocks.** Liveblocks is the better *product* decision and the worse *résumé* decision — with it, the architecture section reads "I configured a provider." Its free tier is also capped at 3,000 collaboration-minutes/month, which is ~150 minutes with 20 concurrent editors; one demo day and the app **pauses**. Self-hosting costs ~$3/mo and buys real talking points: JWT auth in `onAuthenticate`, read-only downgrade, snapshot persistence with debounce, awareness fan-out.

**`@dnd-kit/react` 0.5.0 over Pragmatic DnD.** Its `move` helper, `OptimisticSortingPlugin`, and multi-list guide are purpose-built for exactly this problem, and keyboard drag is built in (Pragmatic uses native HTML5 DnD, which is not keyboard-accessible — you'd hand-build a "Move to…" menu).
*Risk:* pre-1.0, npm dist-tag `beta`, one maintainer, and I could not verify keyboard-drag parity on the new API. *Mitigations:* pin `0.5.0` exactly (0.x minors are breaking); put **every** dnd-kit import behind one `<BoardDnd>` wrapper exposing `onCardMoved({cardId, toColumnId, beforeId, afterId})`, so ordering logic and tests never touch the library; and **spike keyboard drag on day one** (§11, M3) — if it's missing, fall back to legacy `@dnd-kit/core` 6.3.1, which is a one-file change.

---

## 4. Architecture

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
│ Next.js 16 @ Vercel  │            │ Hocuspocus @ Fly.io  │ │
│  • Better Auth       │  ticket    │  • onAuthenticate    │ │
│  • DAL / guards      │───JWT────▶ │    (verifies JWT)    │ │
│  • Server Actions    │            │  • doc:<id> rooms    │ │
│  • /api/realtime/    │  broadcast │  • board:<id> rooms  │ │
│    ticket            │───HTTP───▶ │  • /internal/publish │ │
└──────────┬───────────┘  (secret)  └──────────┬───────────┘ │
           │                                   │             │
           │        ┌──────────────────┐       │             │
           └───────▶│  Neon Postgres   │◀──────┘             │
                    │  app tables      │  Y.Doc snapshots    │
                    └──────────────────┘                     │
                                                             │
  Yjs updates ─────────────────────────────────────────────┘
```

### 4.1 Two realtime channels, one connection

The sync server hosts two kinds of room over the same WebSocket:

- **`doc:<documentId>`** — a real `Y.Doc`. Body content lives in a `Y.XmlFragment`; Tiptap binds to it; awareness carries cursor + selection. Persisted as a snapshot to Postgres.
- **`board:<boardId>`** — awareness **only** (who's viewing, who's dragging what) plus server-published mutation events. **No board data lives in a Y.Doc.** The room is a fan-out pipe.

### 4.2 Board mutation flow — server-authoritative

This is the important one. Postgres is the sole source of truth for card order.

1. User drags a card. Client optimistically reorders locally and computes a provisional key (instant feedback, no network wait).
2. Client calls the `moveCard` Server Action with **neighbour IDs, not a key**: `{ cardId, toColumnId, beforeId, afterId }`.
3. Server action: session → workspace membership → `can(role, 'card:update')`. Rejects otherwise.
4. Inside one transaction: re-read the two neighbours' current keys, compute a **jittered** key between them, `UPDATE` the single card row.
5. Server calls `POST /internal/publish` on the sync server (shared secret) with the event `{ type: 'card.moved', boardId, cardId, toColumnId, position, actorId }`.
6. Sync server `broadcastStateless` to room `board:<boardId>`.
7. Other clients patch their local cache and re-sort by `(position, id)`. The acting client reconciles its provisional key against the authoritative one.

**Why neighbour IDs and not a client-computed key?** Because the server re-reading neighbours inside the transaction is what makes concurrent inserts into the same gap safe — this is Figma's "server assigns a unique position" guarantee. The client's optimistic key is a UI convenience that gets reconciled away.

**Why publish from the server and not the client?** Only the server knows a write actually committed and passed authorization. A client-published event could announce a mutation that never happened.

**Reconnect behaviour:** on WebSocket reconnect the client refetches the board. This covers any events missed while disconnected without needing a revision-gap protocol in MVP.

### 4.3 Doc flow

1. Client requests a ticket, connects to `doc:<id>`.
2. Hocuspocus `onLoadDocument` reads `document_state.state` (bytea) → `Y.applyUpdate`.
3. Tiptap edits produce Yjs updates; the server relays them and (debounced 2s, max 10s) `onStoreDocument` writes `Y.encodeStateAsUpdate(doc)` back to the same row.
4. Awareness carries `{ user: { id, name, color } }` and cursor position; never persisted.

**Persistence rule, non-negotiable:** `onLoadDocument` must return the **exact bytes** that were stored. Never reconstruct a `Y.Doc` from editor JSON/HTML on the server — that generates fresh client IDs and merging it duplicates the entire document. Store bytes, return bytes.

### 4.4 WebSocket authentication

Browsers cannot set headers on `new WebSocket()`, so a short-lived signed ticket is used:

```
POST /api/realtime/ticket  { room: "doc:abc" | "board:xyz" }
  → session (Better Auth) → resolve room to its workspace
  → assert membership + can(role, 'doc:read' | 'board:read')
  → sign JWT { sub, room, canWrite, exp: now + 60s }  [REALTIME_JWT_SECRET]

wss://sync.workroom.app/doc:abc?token=<jwt>
  → Hocuspocus onAuthenticate:
      verify signature + exp
      assert payload.room === documentName       ← prevents room-hopping
      connection.readOnly = !payload.canWrite    ← viewers get read-only
      return { userId, role }                    ← becomes ctx in later hooks
```

The `payload.room === documentName` check is what stops a member of workspace A from taking a valid ticket and connecting to workspace B's document.

### 4.5 Repo layout — npm workspaces monorepo

```
workroom/
├── apps/
│   ├── web/                    Next.js 16 app
│   │   ├── app/
│   │   │   ├── (marketing)/            landing, sign-in, sign-up
│   │   │   ├── (app)/[workspace]/      boards, docs, settings
│   │   │   └── api/
│   │   │       ├── auth/[...all]/      Better Auth handler
│   │   │       └── realtime/ticket/    WS ticket minting
│   │   ├── components/
│   │   │   ├── ui/                     shadcn primitives
│   │   │   ├── board/                  BoardDnd wrapper, Column, Card
│   │   │   ├── doc/                    Editor (ssr:false), CursorLayer
│   │   │   └── presence/               AvatarStack, PresenceProvider
│   │   ├── server/
│   │   │   ├── auth.ts                 Better Auth instance
│   │   │   ├── guard.ts                requireWorkspaceRole() — the DAL
│   │   │   ├── actions/                Server Actions
│   │   │   └── publish.ts              → sync server /internal/publish
│   │   └── instrumentation*.ts         Sentry
│   └── sync/                   Hocuspocus server
│       ├── src/index.ts                Server config + hooks
│       ├── src/persistence.ts          Database extension → Postgres
│       ├── src/publish.ts              /internal/publish HTTP endpoint
│       └── Dockerfile
├── packages/
│   ├── db/                     Drizzle schema + migrations (shared)
│   └── core/                   PURE logic — no React, no DB, no next/*
│       ├── ordering.ts                 fractional indexing helpers
│       ├── permissions.ts              can(role, action)
│       └── *.test.ts                   the highest-value tests in the repo
├── e2e/                        Playwright
├── scripts/loadtest/           N-client Yjs convergence harness
├── docs/
│   ├── SPEC.md                 this document
│   ├── ARCHITECTURE.md         diagram + conflict-resolution writeup
│   └── demo.gif
└── .github/workflows/ci.yml
```

`packages/core` being pure and dependency-free is a deliberate structural choice: it is what lets the correctness argument be tested in milliseconds with no infrastructure.

---

## 5. Data model

Drizzle schema in `packages/db/src/schema.ts`. Real migrations via `drizzle-kit generate` + `migrate` — never `push` outside local dev.

### 5.1 Auth tables (Better Auth managed)
`user`, `session`, `account`, `verification`, and from the organization plugin: `organization`, `member`, `invitation`.

**A workspace *is* a Better Auth organization.** No parallel table. `member.role` holds `owner | admin | member | viewer`.

### 5.2 Application tables

```sql
-- BOARDS ---------------------------------------------------------------
board (
  id            uuid PK,
  org_id        text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name          text NOT NULL,
  created_by    text NOT NULL REFERENCES "user"(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
)
INDEX board_org_idx ON board (org_id, created_at DESC)

board_column (
  id            uuid PK,
  board_id      uuid NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  name          text NOT NULL,
  position      text COLLATE "C" NOT NULL,        -- fractional index
  created_at    timestamptz NOT NULL DEFAULT now()
)
INDEX board_column_order_idx ON board_column (board_id, position, id)

card (
  id            uuid PK,
  board_id      uuid NOT NULL REFERENCES board(id) ON DELETE CASCADE,
  column_id     uuid NOT NULL REFERENCES board_column(id) ON DELETE CASCADE,
  title         text NOT NULL,
  description   text,
  assignee_id   text REFERENCES "user"(id) ON DELETE SET NULL,
  due_date      timestamptz,
  position      text COLLATE "C" NOT NULL,        -- fractional index
  created_by    text NOT NULL REFERENCES "user"(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
)
INDEX card_order_idx  ON card (column_id, position, id)   -- the ordering index
INDEX card_board_idx  ON card (board_id)
-- Deliberately NO unique constraint on (column_id, position). See §6.2.

label (
  id uuid PK, org_id text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name text NOT NULL, color text NOT NULL
)
card_label ( card_id uuid, label_id uuid, PRIMARY KEY (card_id, label_id) )

-- COMMENTS -------------------------------------------------------------
comment (
  id uuid PK,
  card_id   uuid NOT NULL REFERENCES card(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  body      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
INDEX comment_card_idx ON comment (card_id, created_at)

-- DOCS -----------------------------------------------------------------
document (
  id uuid PK,
  org_id     text NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  board_id   uuid REFERENCES board(id) ON DELETE SET NULL,   -- nullable
  title      text NOT NULL DEFAULT 'Untitled',
  created_by text NOT NULL REFERENCES "user"(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
)
INDEX document_org_idx ON document (org_id, updated_at DESC)

document_state (
  document_id uuid PK REFERENCES document(id) ON DELETE CASCADE,
  state       bytea NOT NULL,           -- Y.encodeStateAsUpdate(doc)
  updated_at  timestamptz NOT NULL DEFAULT now()
)
```

Two notes that are easy to get wrong:

- **`COLLATE "C"` on both `position` columns is mandatory.** Without it Postgres sorts by locale and disagrees with the client's byte-order comparison.
- **`bytea` needs a Drizzle custom type.** Verify a round-trip (`Uint8Array` → DB → `Uint8Array`) in a test on day one — any ORM layer that base64-encodes asymmetrically will silently corrupt documents.

---

## 6. Conflict resolution — the technical core

This section is the one an interviewer will actually read. It also becomes `docs/ARCHITECTURE.md`.

### 6.1 Board order: fractional indexing

Each card holds an opaque string `position` that sorts lexicographically. To place a card between two neighbours, compute a key strictly between theirs. **One row written per move** — the smallest possible surface for two writers to collide on.

```
generateKeyBetween(null, null)  → "a0"    first card
generateKeyBetween("a0", null)  → "a1"    append
generateKeyBetween("a0", "a1")  → "a0V"   insert between
generateKeyBetween(null, "a0")  → "Zz"    prepend
```

Strings rather than floats because doubles run out of mantissa after ~52 bisections and adjacent items become numerically equal.

### 6.2 The failure mode, and the three-layer defence

`generateKeyBetween` is **deterministic**. If two clients both look at the gap `("a0", "a1")`, both compute `"a0V"`. This is not a probability — it is a certainty whenever two people drop cards into the same gap concurrently.

What breaks: `ORDER BY position` alone is **not a total order** when keys tie. Postgres may return the tied rows in either order, and *differently to different sessions*. Client A sees `[X, Y]`, client B sees `[Y, X]`. Nothing is "wrong" in the data — the sort is just underdetermined. That is precisely the corruption the acceptance bar names.

Three layers, in order of importance:

1. **Total-order tiebreak — this is the actual fix.** Every read path sorts by `(position, id)`: SQL, client cache, optimistic reducer, test fixtures. Now tied keys are *harmless* — every client independently computes the same order and boards converge. A test asserts this and a second test asserts that removing the tiebreak breaks it, so nobody deletes it later.
2. **Server-assigned keys.** The mutation API takes neighbour IDs; the server re-reads them inside the transaction and generates the key. Eliminates the race at the source.
3. **Jitter.** `jittered-fractional-indexing` with `jitterBits: 30` makes identical keys rare rather than certain (~1 in 47,000 for concurrent actors), at the cost of ~3 extra characters. `getRandomBit` is injected so tests are deterministic. Jitter alone is *not* sufficient — it lowers probability, it does not create a total order. Layers 1 and 3 are both required.

Plus a safety valve: if any column's max key length exceeds 64 characters, rebalance that column with `generateNKeysBetween(null, null, n)` in one transaction. Never rebalance while a drag is in flight on that column. (Jira's LexoRank has elaborate bucket machinery for exactly this — it exists because Jira rebalances hundreds of millions of rows online. Our rebalance unit is one column: a single transaction. Take the idea, skip the buckets.)

### 6.3 Optimistic drag vs. incoming remote reorder

The "don't yank the card out from under the user" pattern:

- `isDraggingRef` gates remote application. While a drag is active, **buffer** incoming order events for the affected columns.
- **Still apply** orthogonal remote updates during a drag — title/label/assignee changes, other columns, presence. Freezing the whole board is worse UX than briefly freezing one column's order.
- On drag end (or cancel), flush the buffer, then re-derive order from `(position, id)` and diff against optimistic state.
- Check `event.canceled` first in `onDragEnd` and restore the drag-start snapshot if true.
- Send exactly what was optimistically written, so there is no reconciliation step and no out-of-order response hazard.
- On rejection, animate the card back to origin with a toast — never leave it visually placed but unsaved.
- Broadcast "user X is dragging card Y" over awareness and render a ghost on other clients. It doesn't prevent conflict but it removes most of the *perceived* conflict.

One dnd-kit-specific gotcha: `OptimisticSortingPlugin` reorders DOM nodes directly during a drag, so `event.operation.source` and `.target` refer to the same element. Read `index` / `initialIndex` / `group` / `initialGroup` off the source instead of comparing IDs.

### 6.4 Docs: Yjs CRDT — and why not fractional indexing

Doc bodies use `Y.XmlFragment`, a real sequence CRDT. Concurrent character insertions merge correctly.

**Fractional indexing would be wrong here.** It has a known *interleaving* failure: if two peers each insert a run of items at the same location, the runs interleave (`A1 B1 A2 B2` instead of `A1 A2 B1 B2`). For photos in an album that's cosmetic. For characters in a sentence it's word salad.

**And a CRDT would be wrong for the board.** A `Y.Doc` is an opaque binary update log — you cannot `SELECT` against it ("show me all cards assigned to me, in order" becomes "materialise every board doc in Node"), authorization is document-granular rather than row-level, and ordering doesn't exist until the doc materialises, so first paint has no order. Yjs also **dropped its `Y.Array` move operation in v14** because reorder-as-delete+insert can duplicate or drop the moved element under concurrency — and the Yjs team's recommended replacement is fractional indexing.

Right tool, right shape of data, both ways. That symmetry is the writeup.

---

## 7. Design system

Not default component-library styling. Opinionated, consistent, and dark-mode-first-class.

### 7.1 Tokens (Tailwind v4 CSS-first, OKLCH)

```css
@import "tailwindcss";
@import "tw-animate-css";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* type scale — 1.2 ratio, tabular for counts */
  --text-2xs: 0.6875rem;  /* 11 — metadata, timestamps */
  --text-xs:  0.75rem;    /* 12 — labels, badges       */
  --text-sm:  0.8125rem;  /* 13 — UI default           */
  --text-base:0.9375rem;  /* 15 — body / card titles   */
  --text-lg:  1.125rem;   /* 18 — section headings     */
  --text-xl:  1.5rem;     /* 24 — page titles          */
  --text-2xl: 2rem;       /* 32 — display              */

  /* spacing: 4px base — 1,2,3,4,6,8,12 */
  --radius-sm: 0.375rem;  /* 6  */
  --radius-md: 0.625rem;  /* 10 */
  --radius-lg: 0.875rem;  /* 14 */

  /* motion */
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);
  --duration-micro: 120ms;   /* hover, press           */
  --duration-base:  180ms;   /* enter/exit, popovers   */
  --duration-layout:240ms;   /* reflow after remote op */
}

:root {
  --bg:        oklch(0.99 0.002 265);
  --surface:   oklch(1    0     0);
  --surface-2: oklch(0.975 0.003 265);
  --border:    oklch(0.92 0.004 265);
  --fg:        oklch(0.21 0.012 265);
  --fg-muted:  oklch(0.52 0.010 265);
  --accent:    oklch(0.55 0.19  277);   /* indigo-violet */
  --accent-fg: oklch(0.99 0.005 277);
  --success:   oklch(0.62 0.15  152);
  --warning:   oklch(0.72 0.15   75);
  --danger:    oklch(0.58 0.20   25);
}

.dark {
  --bg:        oklch(0.17 0.011 265);
  --surface:   oklch(0.21 0.013 265);
  --surface-2: oklch(0.25 0.014 265);
  --border:    oklch(0.30 0.014 265);
  --fg:        oklch(0.96 0.004 265);
  --fg-muted:  oklch(0.68 0.011 265);
  --accent:    oklch(0.68 0.17  277);
  --accent-fg: oklch(0.17 0.011 277);
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-border: var(--border);
  --color-fg: var(--fg);
  --color-accent: var(--accent);
  /* …etc */
}
```

**Presence palette** — 8 fixed OKLCH hues at fixed lightness/chroma so they read on both themes, assigned by `hash(userId) % 8`. Used for cursors, carets, and avatar rings.

**Fonts** — Inter Variable for UI, JetBrains Mono for code blocks, both via `next/font` (self-hosted, no layout shift).

### 7.2 Motion rules

- Card drag lift: scale `1.02`, shadow up, `120ms`.
- Column reflow after a **remote** move: `240ms` ease-out-quint, so remote changes read as "something happened" rather than teleporting.
- Presence avatars: enter/exit fade+scale `180ms`.
- Cursors: `transform` transition `80ms linear` — short enough to feel live, long enough to hide jitter.
- Respect `prefers-reduced-motion`: all of the above collapse to opacity-only.

**One owner for during-drag movement:** dnd-kit owns it. Motion is used only for enter/exit and remote-update reflow. Both libraries transforming the same nodes is a guaranteed fight.

### 7.3 Required states

A shared `<StateView>` component with `empty | loading | error` variants. **Every** data surface uses it — board list, board, card list, comment thread, doc list, doc, member list. Loading is a **skeleton matching the real layout**, never a centred spinner. Errors carry a message and a retry button. Empty states carry an illustration, one sentence, and a primary action.

---

## 8. Milestones

Each milestone ends green on CI and deployable. Real commit history is a deliverable, so commits stay small and conventional (`feat:`, `fix:`, `test:`, `chore:`).

### M0 — Foundation
Monorepo (npm workspaces), Next 16 + TS strict + Tailwind v4 + shadcn (Base UI), design tokens, dark mode toggle, `packages/core` and `packages/db` skeletons, ESLint + Prettier, Vitest configured with `logic`/`ui` projects, GitHub Actions running lint + typecheck + test, deployed to Vercel with a green CI badge.
**Done when:** an empty themed shell is live at a URL and CI is green.

### M1 — Auth & workspaces
Better Auth with email/password + GitHub OAuth, Drizzle adapter, `organization()` plugin with the four roles via `createAccessControl`. Neon project + migrations. Sign-up/sign-in/verify/reset flows. Workspace creation, invite by email, member list, role changes. The `requireWorkspaceRole()` DAL. **`can()` unit tests — the full role × action table.**
**Done when:** two accounts exist, one invites the other, and a member of workspace A gets a 403 from a Server Action targeting workspace B.

### M2 — Ordering core (pure, no UI)
`packages/core/ordering.ts`: `computeNeighbors`, `computeNewPosition(before, after, rng)`, `sortCards`, `needsRebalance`, `rebalance`. Injected RNG. Branded `OrderKey` type. **All 17 ordering tests from §10.1 written and passing before any board UI exists.**
**Done when:** the conflict-resolution guarantee is proven in ~50ms with no infrastructure.

### M3 — Board (single-user)
Board CRUD, columns, cards, card detail panel (title/description/assignee/labels/due date). `<BoardDnd>` wrapper over `@dnd-kit/react`. `moveCard` Server Action wired to M2's logic. Optimistic updates. Skeletons, empty and error states.
**⚠️ Day-one spike:** verify keyboard drag (Space → arrows → Space, Escape to cancel) and screen-reader announcements on `@dnd-kit/react` 0.5.0. If absent, fall back to `@dnd-kit/core` 6.3.1 — a one-file change inside the wrapper.
**Done when:** one person can fully manage a board and reload to find it intact.

### M4 — Sync server & board realtime
`apps/sync`: Hocuspocus 4.6 on Node 24, `onAuthenticate` verifying the room-scoped JWT, read-only downgrade for viewers, `/internal/publish` behind a shared secret. Ticket endpoint in Next. Board room fan-out. Presence: avatar stack, drag ghosts, idle detection. Deployed to Fly.io (`fly scale count 1`).
**Done when:** two browser windows show the same board and a drag in one appears in the other within ~150ms.

### M5 — Live docs
`document` + `document_state` tables. Hocuspocus Database extension → Postgres bytea, 2s/10s debounce. Tiptap 3 with StarterKit + TaskList + CodeBlock + Link, `Collaboration` + `CollaborationCaret`, `@hocuspocus/provider`. `immediatelyRender: false`, editor behind `next/dynamic({ssr:false})` inside a client wrapper, `Y.Doc` created in `useState(() => new Y.Doc())` and destroyed on unmount. Styled carets with name labels. Doc list, create, rename, delete.
**Done when:** two windows type in the same paragraph simultaneously and both converge with no lost characters, and a reload restores the content.

### M6 — Comments
Flat threads on cards, live via the board room. Author, body, timestamps, edit/delete own. Optimistic append.

### M7 — Prove it
Playwright: auth setup project + `alice`/`bob` two-context fixture; critical flows (sign up → workspace → board → card); realtime sync test; **the deliberate-conflict test** (both drag different cards into the same gap via `Promise.all`, assert *convergence*, not a specific order). Load harness in `scripts/loadtest/`: N headless Yjs clients, measure p50/p95 sync latency, assert byte-identical `Y.Doc` state across all clients at the end. CI extended with a Postgres service container and Playwright sharding.
**Done when:** `npm test` runs everything green and the load harness reports p95 < 200ms with 20 clients converging.

### M8 — Ship
Sentry wired (`instrumentation-client.ts`, `onRequestError`, `beforeSend` filtering WebSocket reconnect noise from day one — the free tier is only 5,000 errors/month and a reconnect storm will eat it in an afternoon). Landing page. Seeded demo workspace so a first-time visitor sees a populated board, not an empty state. README with architecture diagram, the conflict-resolution writeup, green CI badge, and a 30–60s demo GIF of two windows editing live.
**Done when:** a stranger can sign up and be looking at a live collaborative board in under a minute.

---

## 9. Deployment & cost

| Component | Where | Cost |
|---|---|---|
| Next.js app | Vercel Hobby (root dir `apps/web`) | $0 |
| Postgres | Neon free — 0.5 GB, 100 CU-h/mo, pooled endpoint, 10 branches | $0 |
| Sync server | Fly.io, 1× `shared-cpu-1x` 256 MB, single machine | ~$2–3/mo |
| Monitoring | Sentry Developer | $0 |
| CI | GitHub Actions (public repo) | $0 |
| **Total** | | **~$3/mo** |

**Why Fly.io and not free.** Render's free tier spins down after 15 minutes with a ~60s cold start; Koyeb's is 1 hour. For a link on a résumé, the sync server being asleep when someone clicks is the difference between a working demo and a broken one. $3/mo removes the risk entirely. `fly scale count 1` also means one instance owns every room, so no Redis and no sticky-session routing are needed at this scale — a single small VM handles 20 concurrent editors with a very large margin (Hocuspocus's maintainer reports >25k connections on single instances).

**Preview environments:** Vercel preview deploys per PR, each pointed at a Neon branch created from `main`. Cheap, and it makes migration changes reviewable.

**Secrets:** `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID/SECRET`, `REALTIME_JWT_SECRET`, `SYNC_INTERNAL_SECRET`, `NEXT_PUBLIC_SYNC_URL`, `SENTRY_*`. `REALTIME_JWT_SECRET` and `SYNC_INTERNAL_SECRET` must be set identically on Vercel and Fly.

---

## 10. Verification

### 10.1 Unit tests — `packages/core`, node env, no DOM, no DB

**Ordering invariants (property-based, `fast-check`, 1000 cases each):**
1. `generateKeyBetween(a, b)` is strictly `> a` and `< b`.
2. Random-insertion round-trip: array sorted by key equals intended order.
3. `generateKeyBetween(a, a)` and reversed bounds both throw — and `moveCard` never constructs such a call.
4. `generateNKeysBetween(a, b, n)` returns n strictly-increasing in-range keys, shorter than n successive single calls.
5. Keys are canonical (no trailing `0` in the fractional part).
6. **Collation guard:** default JS sort (code-unit order) equals byte-compare order, and `'A' < 'a'` holds — i.e. `localeCompare` is never used.

**Conflict-resolution simulation** — a tiny in-memory `applyMove(state, move) → state` plus `sortCards` on `(position, id)`:

7. **The anti-corruption test.** Two clients, different cards, same gap, deterministic generator → identical keys. Apply `[m1, m2]` → S1; apply `[m2, m1]` → S2. Assert `sortCards(S1) === sortCards(S2)`.
8. **Guard test.** Same scenario with the `id` tiebreak removed → assert it *fails*, so nobody deletes the tiebreak later.
9. Convergence across **all permutations** of k=3..5 concurrent moves.
10. Two clients into the same gap **with jitter**, seeded `getRandomBit` → distinct keys, stable order.
11. Self-move no-op: neighbour computation excludes the moving card (otherwise you drift or throw).
12. Cross-column move: source column order unchanged, target correct.
13. Move to head / tail / into an empty column (`null` bounds).
14. **Concurrent delete + move:** client 1 moves X after Y; client 2 deletes Y. Move still lands validly; order stays total.
15. Concurrent move of the *same* card by two users → LWW by `updated_at`, tie broken by client id, deterministic.
16. `rebalance()` is exactly order-preserving.
17. Rebalance vs. concurrent move: a move computed against pre-rebalance neighbours applied post-rebalance yields a total order, or a clean retriable conflict error.
18. Key-length watchdog fires at threshold.

**Permissions:** table-test `can(role, action)` across the full 4 roles × ~15 actions matrix. Pure function, no HTTP layer.

### 10.2 Integration — PGlite + one real-Postgres test
PGlite for repository/query tests and migration smoke tests (no Docker needed — the dev machine has none). Round-trip test for the `bytea` custom type on day one.

**One test must run against real Postgres:** two `moveCard` calls in genuinely concurrent transactions on the same gap → no deadlock, no constraint error, total order afterwards. PGlite is single-connection and would give a false pass here. Locally this runs against a Neon dev branch; in CI against the `services: postgres` container.

### 10.3 E2E — Playwright, two contexts

Auth setup project writes `alice.json` / `bob.json` storage states; a fixture exposes `{ alice, bob }` pages so every collaboration test is three lines.

- Sign up → create workspace → create board → create card.
- Invite flow: alice invites bob, bob accepts, bob sees the board.
- **Realtime board sync:** alice drags, bob's column order updates — asserted with `toHaveText([...])`, which checks content *and* order in one auto-retrying call.
- **Realtime doc sync:** alice types, bob sees it; bob's caret appears in alice's view.
- **The deliberate-conflict test:** `Promise.all([alice.drag(A→gap), bob.drag(B→gap)])`, then assert both pages show the *identical* order. Assert convergence, never a specific order.
- Authorization: bob (not a member of workspace A) gets 403/404 on its board URL.

Discipline: no `waitForTimeout` anywhere; synchronise before acting (assert bob's board fully rendered and presence shows 2 users before alice acts); scoped `expect.configure({ timeout: 15_000 })` for realtime propagation rather than raising the global timeout; unique board per test so tests parallelise; use the new `retries: 'isolated'` strategy so genuine concurrency bugs aren't hidden behind blind retries.

### 10.4 Load — `scripts/loadtest/`
A ~150-line Node harness driving N headless Yjs clients against one doc and one board. Each client mutates on a timer with a sequence number and records when it observes every peer's op.

Captured: sync latency p50/p95/p99 (target **p95 < 200ms** same-region at 20 clients), time-to-convergence after a burst, sync-server CPU and RSS, **RSS after all clients disconnect** (doc-eviction leaks are the #1 production failure of Yjs servers), and message/byte fan-out.

**Asserted, not just measured:** at the end of every run all N clients' `Y.Doc` states must hash byte-identical and all N board orders must match. A load test that also proves convergence is worth ten that only measure throughput.

Scenarios: steady state (20 clients, 1 op/s, 10 min); thundering herd (all 20 join within 2s); burst (all 20 drag within 1s — §6.2's conflict test under load); partition (kill half the sockets 30s, restore, assert convergence).

### 10.5 CI — `.github/workflows/ci.yml`
`actions/checkout@v6`, `actions/setup-node@v6` with `cache: npm`, Node 24. Jobs: **lint** (ESLint CLI — `next lint` is gone), **typecheck**, **unit** (Vitest, both projects), **e2e** (Postgres service container with `pg_isready` health check, `npx playwright install --with-deps`, sharded 4× with blob reports merged). Auto-deploy on merge to `main`. Green badge in the README.

### 10.6 Manual acceptance
Open two browser windows side by side. Drag a card in one — it moves in the other with a visible reflow animation. Type in a doc in both — characters interleave correctly, both carets are labelled and coloured. Kill the sync server; the UI shows a "reconnecting" state rather than dying; restart it; both windows resync without a refresh. Toggle dark mode. Load a board with no cards, a doc that fails to fetch, and a board with 200 cards.

---

## 11. Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `@dnd-kit/react` 0.5.0 lacks keyboard-drag parity | Medium | Day-one spike in M3. All imports behind `<BoardDnd>`; fallback to `@dnd-kit/core` 6.3.1 is a one-file change. |
| `@dnd-kit/react` breaking change on a 0.x minor | Medium | Pin exact `0.5.0`. Wrapper caps blast radius. |
| Better Auth security patch / breaking minor | Medium | Pin exact `1.7.1`. Watch the advisory feed; re-check before each deploy. |
| Postgres collation misconfigured → order disagrees with client | Medium-High | `COLLATE "C"` in the migration + test #6 asserts byte-order equivalence. |
| `bytea` round-trip corrupts Y.Doc | Medium | Explicit round-trip test on day one of M5. |
| Doc corruption from reconstructing `Y.Doc` server-side | Low-High impact | Written rule in §4.3; `onLoadDocument` returns stored bytes only, never a rebuilt doc. |
| Sentry free tier exhausted by reconnect storms | Medium | `beforeSend` filters network/WS noise from the first commit. |
| Next.js 16.3.3 security release (2026-08-26) | Certain | Start on 16.3.3+; do not pin below it. |
| Neon free tier compute exhausted by a always-open pool | Low-Medium | Sync server uses a small pool with idle timeout; monitor CU-hours. |
| Scope creep into Phase 2 | High | §13 is a written "not now" list. MVP ships first. |

---

## 12. Definition of done

- [ ] Live URL; a stranger signs up and is on a live collaborative board in under a minute
- [ ] Two browser windows demonstrably sync board drags and doc typing
- [ ] `README.md`: architecture diagram, conflict-resolution writeup, green CI badge, 30–60s demo GIF
- [ ] Real commit history — dozens of small conventional commits, not one dump
- [ ] All tests green in CI: unit, integration, E2E
- [ ] Load harness output in the README: p95 latency at 20 concurrent, with convergence asserted
- [ ] Sentry receiving events; no unhandled errors in a full manual pass
- [ ] Every data surface has designed empty, loading, and error states
- [ ] Light and dark mode both deliberate
- [ ] Keyboard-accessible drag (or a documented, working alternative)

---

## 13. Phase 2 — after MVP is genuinely solid

Ordered by impact-per-hour. **None of these start before §12 is fully checked.**

1. **Cmd+K command palette** — cheap, disproportionately impressive.
2. **Activity feed** — makes the app feel alive; the `board:` room already carries the events.
3. **@mentions + notifications** in comments and docs.
4. **Public read-only share links** for boards and docs.
5. **Doc version history** — Yjs snapshots make time-travel feasible.
6. **Mobile-responsive layout** — Tailwind v4 container queries suit Kanban columns well.
7. **Redis extension + multi-instance sync** — purely to demonstrate horizontal scaling; unnecessary at this load.

**Permanently out of scope:** AI features, billing, native mobile, admin backoffice.

---

## Appendix — verified reference points

- Fractional indexing: [Greenspan, *Implementing Fractional Indexing*](https://observablehq.com/@dgreensp/implementing-fractional-indexing) · [Figma, *Realtime Editing of Ordered Sequences*](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/) · [rocicorp/fractional-indexing](https://github.com/rocicorp/fractional-indexing)
- Yjs dropping move → fractional indexing: [Sypytkowski, May 2026](https://www.bartoszsypytkowski.com/replacing-yjs-move-feature/)
- Optimistic-update races: [Chan, *Drag, drop, and the optimistic update race*](https://alexmchan.com/blog/2026-06-29-concurrent-optimistic-updates)
- dnd-kit sortable state: [Managing Sortable State](https://dndkit.com/react/guides/sortable-state-management/)
- Hocuspocus hooks & scaling: [tiptap.dev/docs/hocuspocus](https://tiptap.dev/docs/hocuspocus/server/hooks)
- Better Auth organization plugin: [better-auth.com/docs/plugins/organization](https://better-auth.com/docs/plugins/organization)
- Next 16 changes: [nextjs.org/blog/next-16](https://nextjs.org/blog/next-16)
- Playwright multi-context: [playwright.dev/docs/browser-contexts](https://playwright.dev/docs/browser-contexts)
