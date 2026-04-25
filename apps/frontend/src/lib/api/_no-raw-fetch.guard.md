# No raw fetch() in `lib/api/*`

After W9.3, every fetcher under `apps/frontend/src/lib/api/*.ts` must route
through the canonical `apiFetch` wrapper in `_fetcher.ts` so the Steward JWT
travels on every patron-facing request.

## CI guard

```bash
# Should print 0. If non-zero, you've reintroduced a raw fetch() and the
# Steward JWT will not be sent on that call.
grep -rn --include='*.ts' 'await fetch(' apps/frontend/src/lib/api \
  | grep -v _fetcher.ts \
  | grep -v _fetcher.fixture.ts \
  | wc -l
```

## What's exempt

- `apps/frontend/src/lib/api.ts` (legacy fetcher) intentionally still uses
  raw `fetch()` and pulls the JWT itself via `getApiToken()`. It is already
  correctly auth'd. Migrating it onto `apiFetch` is a follow-up cleanup.
- `_fetcher.ts` itself is the wrapper.
- `_fetcher.fixture.ts` installs a `globalThis.fetch` mock for testing.

## Why

Audit F-4 (Opus 4.7, 2026-04-25): per-feature fetchers under `lib/api/*`
were using `fetch(url, { credentials: "include" })` only, so the Steward
JWT held by `@stwd/react` never traveled on patron mutations. After the
W9.1 + W9.2 backend changes flip `requirePatron()` on, those calls would
401 every time. `apiFetch` closes that gap.
