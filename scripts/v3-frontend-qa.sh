#!/usr/bin/env bash
set -euo pipefail

bun run --filter @waifufun/frontend test
bun run --filter @waifufun/frontend exec tsc --noEmit
bun run lint
