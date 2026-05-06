# syntax=docker/dockerfile:1.7
# Waifu-core images: build stage `runner` with SERVICE_NAME=api|worker|evm-indexer|brain.
# Dev compose mounts the repo and uses stage `base` as the Bun toolchain shell.

FROM oven/bun:1-alpine AS base

# Native build deps for transitive packages (notably 'usb' via
# @trezor/transport, which is pulled in by Solana wallet adapters
# and needs node-gyp + python3 + a C++ toolchain at install time).
# Without these, `bun install --frozen-lockfile` fails with
# 'install script from "usb" exited with 1'.
RUN apk add --no-cache python3 make g++ libusb-dev linux-headers eudev-dev

WORKDIR /app

FROM base AS deps

COPY package.json bun.lock turbo.json tsconfig.shared.json tsconfig.node.base.json biome.json ./
# patches/ holds bun patches required by the lockfile (e.g. @stwd/react@0.7.2).
# Without this COPY, `bun install --frozen-lockfile` fails with
# 'Couldn't find patch file'.
COPY patches ./patches
COPY apps ./apps
COPY packages ./packages

RUN bun install --frozen-lockfile

FROM deps AS builder

COPY . .

RUN bunx turbo run build \
	--filter=@waifufun/api \
	--filter=@waifufun/worker \
	--filter=@waifufun/evm-indexer \
	--filter=@waifufun/brain \
	--filter=@waifufun/mcp \
	--filter=@waifufun/agent-actions

FROM oven/bun:1-alpine AS runner

RUN apk add --no-cache curl

WORKDIR /app

COPY --from=builder /app /app

ARG SERVICE_NAME
ENV NODE_ENV=production \
	SERVICE_NAME=${SERVICE_NAME}

ENV API_HOST=0.0.0.0

EXPOSE 3100

CMD ["sh", "-lc", "exec bun run --filter @waifufun/${SERVICE_NAME} start"]
