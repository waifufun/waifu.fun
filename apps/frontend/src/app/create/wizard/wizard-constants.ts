// Pure-TS constants shared between wizard-client (tsx) and tests.
// Lives in its own .ts file so vitest can import without dragging in
// the full JSX tree (vite without jsx plugin can't transform tsx).

// Wizard waits up to 5 min for the backend provision response. The
// orchestrator's bsc receipt timeout is up to 180s, so this gives
// generous headroom while still bounding "did the request actually
// die" detection. This bounds the INITIAL POST /v2/agents/provision —
// which now returns 202 after token-launch + invite-confirm, before
// Eliza Cloud provisioning (that is async, polled separately below).
export const PROVISION_RESPONSE_TIMEOUT_MS = 300_000;

// After a 202 the wizard polls GET /v2/agents/:id for the hosted runtime
// to come up. Eliza Cloud provisioning is async (queued worker job) and
// can take anywhere from ~10s to a couple minutes under backlog, so we
// give it a generous 10-min ceiling. On timeout we DON'T fail the launch
// (the token is minted, the invite is spent) — we route to the patron
// page with an honest "provisioning in progress" banner.
export const ASYNC_PROVISIONING_TIMEOUT_MS = 600_000;

// How often the wizard polls the agent detail endpoint for status while
// provisioning. 3s keeps query load sane (see PR-1 risks) while feeling live.
export const ASYNC_PROVISIONING_POLL_INTERVAL_MS = 3_000;
