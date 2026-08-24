# Workroom

[![CI](https://github.com/waleedhussein4/workroom/actions/workflows/ci.yml/badge.svg)](https://github.com/waleedhussein4/workroom/actions/workflows/ci.yml)

A collaborative workspace for small teams. Kanban boards for planning, live documents for writing, and everything syncs in real time: cursors, presence, edits, comments.

Work in progress. The foundation and CI are up; product surfaces are landing milestone by milestone.

## How it syncs

Boards and documents get different conflict-resolution strategies, because using one mechanism for both would be a bug rather than a preference.

| Surface          | Mechanism                                                               | Source of truth              |
| ---------------- | ----------------------------------------------------------------------- | ---------------------------- |
| Board card order | Fractional indexing, server-assigned keys, `(position, id)` total order | Postgres                     |
| Document body    | Yjs CRDT (`Y.XmlFragment`)                                              | Yjs, snapshotted to Postgres |

Fractional indexing on document text interleaves concurrent insertions into nonsense. A CRDT for card order can't be queried with SQL or authorized per row, and Yjs itself dropped its array-move operation in v14 and now points people at fractional indexing.

The reasoning, including why duplicate keys are harmless and what happens when two people drag into the same gap at once, is in [docs/SPEC.md](docs/SPEC.md#ordering).

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Better Auth, Drizzle, Postgres, Yjs with Hocuspocus, Tiptap, dnd-kit, Vitest, Playwright.

## Layout

```
apps/web        Next.js application
apps/sync       Hocuspocus WebSocket server (planned)
packages/core   Ordering and permissions. No framework, no I/O.
packages/db     Drizzle schema and migrations (planned)
docs/SPEC.md    Architecture and product notes
```

`packages/core` has no dependencies on anything else in the repo, which is what lets the ordering tests run in milliseconds with nothing to set up.

## Running it

Node 24 or newer, see `.nvmrc`.

```bash
npm install
npm run dev

npm test
npm run lint
npm run typecheck
npm run format:check
```

Copy `.env.example` to `.env.local` and fill it in before starting the app.

## License

MIT
