# waifufun

Getting Started – the Autofun Monorepo
This guide helps you set up and run the Autofun monorepo locally.

1. Install Dependencies (package manager is pinned in `package.json`):
`bun install`

2. Start the Development Environment
`bun run dev`

This will automatically configure and start the Docker containers.


Optional: Using sharp on Linux x64 flavors:
```sudo apt-get update && sudo apt-get install -y libvips-dev build-essential pkg-config libjpeg-dev libpng-dev libtiff-dev libwebp-dev```


MacOS Users – Mongoose / Docker Connection Fix:
If you're on MacOS and get a ECONNREFUSED error when connecting to MongoDB (via Mongoose), do the following:

- Enable Host Networking in Docker:
1: Open Docker Desktop
2: Go to ```Settings > Resources > Network```
3: Enable ```Allow host networking```
4: Restart Docker

- Add a host alias to prevent mongoose replica error:
1: open your teminal
2: Edit the hosts file by running ```sudo nano /etc/hosts```
3: Add the following line ```127.0.0.1 host.docker.internal```
4: Exit, and reboot

-add NEXT_PUBLIC_HOST

docker build -t waifufun-frontend -f apps/frontend/Dockerfile.frontend .

## Supabase control-plane foundation

A new shared package and migration set now live in this repo for control-plane data that should move to Supabase/Postgres instead of Mongo:

- Shared helpers: `packages/control-plane`
- SQL migration: `supabase/migrations/202603070001_control_plane_foundation.sql`
- Setup notes: `supabase/README.md`

Required server-side env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

No anon/browser key is needed for this initial foundation.

## Waifu-core backend (`@waifufun/*`)

Backend services (`apps/api`, `apps/worker`, `apps/evm-indexer`, `apps/brain`, `apps/mcp`) and shared `@waifufun/*` workspace packages live in this repo (merged from legacy `waifu-core`).

- **Compose (Postgres + Redis only):** `docker/docker-compose.waifu-core.deps.yml`
- **Full compose (API + worker + indexer in dev containers):** `docker/docker-compose.dev.yml`
- **Local monorepo infra (Mongo, Dragonfly, MinIO):** `docker/docker-compose.local.yml`
- **Indexer Postgres:** `docker/docker-compose.indexer.yml`
- **Multi-service Dockerfile:** `docker/Dockerfile.waifu-core`
- **CI entry points:** `.github/workflows/ci.yml`, `build-push.yml`, `deploy*.yml`, `db-migrate.yml`, `reusable-*.yml`
- **Scripts:** root `bun run waifu-core:*` (see `package.json`)
