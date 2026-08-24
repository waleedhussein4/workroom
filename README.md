# Workroom

[![CI](https://github.com/waleedhussein4/workroom/actions/workflows/ci.yml/badge.svg)](https://github.com/waleedhussein4/workroom/actions/workflows/ci.yml)

A real-time collaborative workspace for small teams — Kanban boards for planning and live documents for thinking, in one place. Multiple people work in the same workspace simultaneously with live cursors, presence, and instant sync.

> **Status: in development.** The foundation and CI are in place; product surfaces are being built milestone by milestone. See [docs/SPEC.md](docs/SPEC.md).

## Why it's interesting

The two surfaces need genuinely different conflict-resolution strategies, and using the wrong one for either is a real bug rather than a style choice:

| Surface          | Mechanism                                                                        | Source of truth              |
| ---------------- | -------------------------------------------------------------------------------- | ---------------------------- |
| Board card order | Fractional indexing with server-assigned keys and a `(position, id)` total order | Postgres                     |
| Document body    | Yjs CRDT (`Y.XmlFragment`)                                                       | Yjs, snapshotted to Postgres |

Fractional indexing on document text would interleave concurrent insertions into word salad. A CRDT for card order cannot be queried with SQL or authorized per row — and Yjs dropped its array-move operation in v14, recommending fractional indexing in its place.

The full reasoning, including the three-layer defence against divergent column order, is in [docs/SPEC.md § 6](docs/SPEC.md).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Better Auth · Drizzle · Neon Postgres · Yjs + Hocuspocus · Tiptap · dnd-kit · Vitest · Playwright

## Repository layout

```
apps/web        Next.js application (planned)
apps/sync       Hocuspocus WebSocket server (planned)
packages/core   Pure domain logic — ordering, permissions. No framework, no I/O.
packages/db     Drizzle schema and migrations (planned)
docs/SPEC.md    Product and engineering specification
```

`packages/core` is deliberately dependency-free so the correctness argument can be tested in milliseconds with no infrastructure.

## Getting started

Requires Node 24+ (see `.nvmrc`).

```bash
npm install
npm test            # unit tests
npm run lint
npm run typecheck
npm run format:check
```

Copy `.env.example` and fill it in before running the app.

## License

MIT
