# Contributing

## Branch flow

- Open normal feature and fix PRs against `develop`.
- `develop` is the integration/staging branch. When CI is green, automation opens and auto-merges a sync PR from `develop` to `main`.
- `main` is production. Cloudflare Pages and the production Railway deploy run from `main`.
- Use `main` directly only for emergency hotfixes that must deploy immediately. The back-sync workflow will then open `main` → `develop` automatically.

## Local checks

Before opening a PR, run:

```bash
bun run lint
```

Biome lint regressions should be caught before merge; the `Lint` workflow is a required branch-protection check on both `develop` and `main`.
