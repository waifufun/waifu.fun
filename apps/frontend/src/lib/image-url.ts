/**
 * Resolve user-supplied image references to a fetchable URL.
 *
 * Pass http(s) and data: URIs through unchanged. Rewrite `ipfs://<cid>` and
 * bare CIDs (CIDv0 `Qm…`, CIDv1 `bafy…`) through the public IPFS gateway so
 * they don't resolve as relative paths against the current host.
 *
 * Mirrors the fallback logic in `apps/api/src/routes/v2/agent-launches.ts`.
 * The api uses `ipfs.io` as the fallback gateway when a bare CID lands in
 * the DB; the team's primary gateway is `flap.mypinata.cloud/ipfs` (see
 * `packages/flap/src/constants.ts:FLAP_IPFS_GATEWAY_URL` +
 * `resolveFlapIpfsUrl`). Consolidating both sides on a single shared helper
 * is tracked for a follow-up — this matches the api's existing behavior.
 *
 * Returns `null` when no usable URL can be produced; callers can chain
 * `?? fallbackPath` to substitute a static brand image at the render site.
 */
export function resolveImageUrl(raw: string | null | undefined): string | null {
	if (!raw) return null;
	const s = raw.trim();
	if (!s) return null;
	if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("data:")) return s;
	if (s.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${s.slice("ipfs://".length)}`;
	if (s.startsWith("bafy") || s.startsWith("Qm")) return `https://ipfs.io/ipfs/${s}`;
	return null;
}
