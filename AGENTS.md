# AGENTS.md — contributor & worker context

**Design ground truth:** Every UI worker MUST read [`.impeccable.md`](./.impeccable.md) before touching frontend code.

This file is for AI coding agents (Claude, Codex, etc.) and human contributors working on the waifu.fun monorepo.

## Quick links

- **Design system & anti-slop rules:** [`.impeccable.md`](./.impeccable.md)
- **Public agent launch spec** (different doc, for agents launching tokens via the API): [`AGENT.md`](./AGENT.md)
- **Frontend primitives:** `apps/frontend/src/components/agent-home/wave-t/_primitives.tsx`
- **Contributing:** [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Rules for UI / frontend work

1. Read `.impeccable.md` end-to-end before opening any frontend file.
2. Model: must run on `anthropic-proxy/claude-opus-4-7`. Shadow's rule.
3. Use only the wave-t primitives. No bespoke borders, no custom panel chrome.
4. Walk the Anti-Slop Checklist in `.impeccable.md` as a self-review before opening the PR.
5. Attach screenshots at 1440 and 768 to every visual PR.
