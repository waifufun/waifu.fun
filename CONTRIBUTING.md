# contributing

contributions welcome. open an issue first for anything non-trivial.

## setup

see [README.md](./README.md).

## branches

- `main` — production
- `wf/*` — feature branches

## code style

- TypeScript strict
- Biome for lint + format (`pnpm lint`, `pnpm format`)
- no em dashes
- lowercase energy in user-facing copy

## commits

conventional commits preferred: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`. keep messages short and specific.

## PRs

- link the issue if one exists
- include screenshots for UI changes
- run `pnpm check` before pushing
- small PRs > mega PRs

## local env

copy `.env.example` to `.env.local` and fill in values. never commit real secrets.

## questions

open a discussion or issue. no DM-only support.
