# Workroom

[![CI](https://github.com/waleedhussein4/workroom/actions/workflows/ci.yml/badge.svg)](https://github.com/waleedhussein4/workroom/actions/workflows/ci.yml)

A collaborative workspace for small teams. Kanban boards for planning, live documents for writing, and everything syncs in real time: cursors, presence, edits, comments.

**[workroom-web.vercel.app](https://workroom-web.vercel.app)**

![Two panes side by side showing the same board. A card dragged in the left pane moves in the right one, then both panes type into the same paragraph of a document and the characters interleave.](docs/demo.gif)

Two panes, two independent WebSocket connections, one board. The card moves in the pane that did not drag it, and when both start typing into the same paragraph neither side's keystrokes are lost. Recorded by `npm run demo`, which drives the real application rather than a mockup.

## How it syncs

Boards and documents get different conflict-resolution strategies, because using one mechanism for both would be a bug rather than a preference.

| Surface          | Mechanism                                                               | Source of truth              |
| ---------------- | ----------------------------------------------------------------------- | ---------------------------- |
| Board card order | Fractional indexing, server-assigned keys, `(position, id)` total order | Postgres                     |
| Document body    | Yjs CRDT (`Y.XmlFragment`)                                              | Yjs, snapshotted to Postgres |

Fractional indexing on document text interleaves concurrent insertions into nonsense. A CRDT for card order can't be queried with SQL or authorized per row, and Yjs itself dropped its array-move operation in v14 and now points people at fractional indexing.

The reasoning, including why duplicate keys are harmless and what happens when two people drag into the same gap at once, is in [docs/SPEC.md](docs/SPEC.md#ordering).

### The guarantees, and how they are checked

Concurrent editing is easy to claim and easy to get subtly wrong, so each claim has something that fails when it stops being true.

**Two people dragging at once end up seeing the same board.** An end-to-end test drives two browser contexts, drags a different card into the same gap in each at the same moment, and asserts the two windows agree afterwards. It does not assert which order won: either is correct, disagreeing is not.

**Duplicate order keys are harmless.** Key generation is deterministic, so two clients looking at the same gap compute the same key. A unit test proves that case converges, and a second test asserts it _stops_ converging when the `id` tiebreak is removed, so the reason that tiebreak exists survives future refactors.

**Two transactions racing for the same gap do not deadlock.** Pure functions say nothing about row locking, so this one runs against a real Postgres. Two transactions are opened and confirmed live before either takes a lock, both move a card into the same gap, and the test asserts that both commit, that the neighbours do not move, and that no two rows tie on `(position, id)`.

**Byte order, not locale order.** Order keys compare byte by byte, which is why the position columns are `text COLLATE "C"`. The databases used for testing are deliberately created with a locale collation, so the per-column override is exercised rather than accidentally correct:

```
byte order  (COLLATE "C"):  A0 < Zz < a0 < a0V < z0
locale order (db default):  a0 < A0 < a0V < z0 < Zz
```

Removing the override turns the first line into the second, and an integration test fails.

**Twenty people editing at once stay in sync.** `npm run loadtest -- --doc <id>` drives N clients against one document and measures the delay from an edit being written to it being seen by everyone else. Both ends run in one process, so the figure is genuinely end to end:

```
observations : 7220
p50          : 14 ms
p95          : 29 ms
p99          : 36 ms
converged    : YES
```

Convergence matters more than the latency, because a server that drops half the updates is extremely fast.

**Two people can type in the same paragraph.** `scripts/probe-doc-sync.mjs` runs two clients against the sync server, inserts into one paragraph from both, and checks convergence and persistence:

```
converged  : YES        two clients, same document
both edits : PRESENT    neither side dropped
same-para  : BOTH KEPT  concurrent insert into one paragraph
persisted  : MATCHES    fresh client after everyone disconnected
```

**A ticket for one room cannot open another.** `scripts/probe-realtime-auth.mjs` checks the sync server's authentication:

```
matching room    : AUTHENTICATED
mismatched room  : REJECTED
garbage ticket   : REJECTED
expired ticket   : REJECTED
forged signature : REJECTED
```

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Better Auth, Drizzle, Postgres, Yjs with Hocuspocus, Tiptap, dnd-kit, Vitest, Playwright.

## Layout

```
apps/web        Next.js application
apps/sync       Hocuspocus WebSocket server
packages/core   Ordering and permissions. No framework, no I/O.
packages/db     Drizzle schema and migrations
e2e             Playwright specs
scripts         Load harness, realtime probes, demo recorder
docs/SPEC.md    Architecture and product notes
```

`packages/core` depends on nothing else in the repo, which is what lets the ordering and permission tests run in milliseconds with nothing to set up.

## Running it

Needs Node 24 (see `.nvmrc`) and a Postgres instance.

```bash
npm install
cp .env.example .env.local        # then fill in DATABASE_URL and the secrets
npm run db:migrate

npm run dev:web                   # http://localhost:3000
npm run dev:sync                  # ws://localhost:1234
```

Without a sync server the app still works: boards fall back to ordinary navigation and documents open read-only-ish, with the board showing "Offline" instead of "Live".

Signing up sends no email and asks for no confirmation, so email is never on the path between a visitor and the application. Password resets and invitations do send mail, and with no provider configured they print to the server console instead, which is enough to exercise both locally.

```bash
npm test                          # unit tests, no infrastructure needed
npm run test:integration          # needs DATABASE_URL, skips without it
npm run test:e2e                  # playwright, starts its own servers
npm run lint
npm run typecheck
npm run format:check

npm run loadtest -- --doc <id>    # N concurrent editors, needs the sync server
npm run demo                      # re-record docs/demo.gif
```

CI runs all of those as separate jobs, and nothing deploys unless all seven pass.

## Deploying

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

MIT. See [LICENSE](LICENSE).
