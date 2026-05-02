# Drizzle migrations

This package points `drizzle.config.ts` at `dist/schema/index.js` instead of `src/`.

Why:
- the package is ESM-first
- local schema files use `.js` import specifiers for TypeScript/NodeNext compatibility
- `drizzle-kit` resolves the built output more reliably than the raw TS source in this setup

Practical effect (from repo root):
- `bun run --filter @waifufun/db db:generate`
- `bun run --filter @waifufun/db db:migrate`
- `bun run --filter @waifufun/db db:push`
- `bun run --filter @waifufun/db db:studio`

all build first before running Drizzle.

Rule of thumb:
- use `db:generate` when you want a committed SQL migration under `packages/db/drizzle/`
- use `db:migrate` to apply committed migrations to a database
- use `db:push` for fast local schema syncing when you do not need to generate migration files yet
