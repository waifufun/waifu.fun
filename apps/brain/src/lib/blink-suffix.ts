/**
 * Compose a tweet body with an optional Blink URL appended on a new line.
 *
 * The Blink URL is appended only when (a) `blinkBaseUrl` is provided and
 * (b) the full composed text fits within `maxLength` (default 280, matching
 * X's tweet limit). If appending would overflow, the original `baseText` is
 * returned untouched. This avoids ever shipping a truncated Blink URL — the
 * naive approach (append, then `slice(0, 280)`) cuts at a fixed character
 * regardless of whether that lands inside the URL, breaking the link.
 *
 * `blinkBaseUrl` is the API origin (e.g. `https://api.waifu.fun`). The full
 * Blink URL is constructed as `${base}/v2/agents/${tokenAddress}/blink`.
 *
 * Pure function — no env reads, no I/O. Callers (the brain handlers) pass
 * `process.env.WAIFU_BLINKS_BASE_URL` so the env gate is observable from a
 * single point and the helper itself is trivially testable.
 */
export interface ComposeWithBlinkOptions {
	/** API origin. When undefined or empty, no Blink URL is appended. */
	blinkBaseUrl?: string | undefined;
	/** Hard upper bound on the composed text length. Defaults to 280 (X tweet limit). */
	maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 280;

export function composePostWithBlink(
	baseText: string,
	tokenAddress: string,
	options: ComposeWithBlinkOptions = {},
): string {
	const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
	const blinkBase = options.blinkBaseUrl?.trim();
	if (!blinkBase) return baseText;

	const trimmedBase = blinkBase.replace(/\/+$/, "");
	const blinkUrl = `${trimmedBase}/v2/agents/${tokenAddress}/blink`;
	const candidate = `${baseText}\n${blinkUrl}`;

	return candidate.length <= maxLength ? candidate : baseText;
}
