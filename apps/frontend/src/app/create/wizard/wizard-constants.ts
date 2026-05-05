// Pure-TS constants shared between wizard-client (tsx) and tests.
// Lives in its own .ts file so vitest can import without dragging in
// the full JSX tree (vite without jsx plugin can't transform tsx).

// Wizard waits up to 5 min for the backend provision response. The
// orchestrator's bsc receipt timeout is up to 180s, so this gives
// generous headroom while still bounding "did the request actually
// die" detection.
export const PROVISION_RESPONSE_TIMEOUT_MS = 300_000;
