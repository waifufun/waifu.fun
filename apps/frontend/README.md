This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
bun run --filter @waifufun/frontend dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to load and optimize web fonts.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

## Deploy

The frontend is a static export deployed to Cloudflare Pages.

- `bun run build` runs `scripts/static-export-build.mjs` and produces `out/`.
- `bun run pages:deploy` ships `out/` to Cloudflare Pages via wrangler.
- CI: `.github/workflows/deploy-frontend.yml` deploys on pushes to `main`.

Set `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_HOST`, and any other `NEXT_PUBLIC_*`
flags on the Cloudflare Pages project, not in this repo.
