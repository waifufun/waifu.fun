const MAX_AUTH_RETURN_TO_LENGTH = 200;
const SAME_ORIGIN_BASE = "https://waifu.fun";

function hasControlOrSpace(value: string): boolean {
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (code <= 0x20 || code === 0x7f) return true;
	}
	return false;
}

/**
 * Path-only post-auth redirect validation.
 *
 * Allows same-origin relative paths and rejects absolute URLs,
 * protocol-relative URLs, slash/backslash tricks, and encoded leading
 * slash/backslash variants that browsers can normalize into external URLs.
 */
export function sanitizeAuthReturnTo(raw: string | null | undefined): string | null {
	if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_AUTH_RETURN_TO_LENGTH) return null;
	if (raw !== raw.trim() || hasControlOrSpace(raw)) return null;
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.includes("\\")) return null;

	const lowerAfterSlash = raw.slice(1).toLowerCase();
	if (lowerAfterSlash.startsWith("%2f") || lowerAfterSlash.startsWith("%5c")) return null;

	try {
		const parsed = new URL(raw, SAME_ORIGIN_BASE);
		if (parsed.origin !== SAME_ORIGIN_BASE) return null;
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return null;
	}
}
