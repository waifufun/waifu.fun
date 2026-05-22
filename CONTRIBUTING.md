# Contributing

## Branch model

`main` is the only long-lived branch for this repository. Cloudflare Pages deploys the frontend from `main`, and Railway pulls the backend Docker images published from `main` (`:latest`).

- Open every PR against `main`.
- Use short-lived feature branches for one PR, then delete them after merge.
- Run `bun run lint` before opening or updating a PR. The CI lint job is required by branch protection, but running it locally catches Biome formatting issues before they block review.
- For a broader local gate, run `bun run check` before asking for review.

Do not target or recreate `develop`; it was retired to prevent production/deploy drift.
