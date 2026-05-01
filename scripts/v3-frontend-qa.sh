#!/usr/bin/env bash
set -euo pipefail

pnpm --filter @waifufun/frontend test
pnpm --filter @waifufun/frontend exec tsc --noEmit
pnpm lint
