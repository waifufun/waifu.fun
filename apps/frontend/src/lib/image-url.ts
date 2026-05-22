/**
 * Resolve user-supplied image references to a fetchable URL.
 *
 * Pass http(s) and data: URIs through unchanged. Rewrite `ipfs://<cid>` and
 * bare CIDs (CIDv0 `Qm…`, CIDv1 `bafy…`) through the public IPFS gateway so
 * they don't resolve as relative paths against the current host.
 *
 * Mirrors the fallback logic in `apps/api/src/routes/v2/agent-launches.ts`.
 *
 * Returns `null` when no usable URL can be produced — callers should render
 * a placeholder rather than passing `null` to an `<img>` src.
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

/**
 * Same as `resolveImageUrl` but returns a fallback path when no usable URL
 * is found. Useful at render sites that want a static brand image instead
 * of a broken `<img>`.
 */
export function resolveImageUrlOr(raw: string | null | undefined, fallback: string): string {
	return resolveImageUrl(raw) ?? fallback;
}
