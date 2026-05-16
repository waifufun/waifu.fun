const DEFAULT_REDIRECT_PATH = "/patron";
const MAX_REDIRECT_LENGTH = 200;
const MAX_EXTERNAL_URL_LENGTH = 2048;
const CONTROL_OR_SPACE = /[\u0000-\u001f\u007f\s]/;

export function sanitizeRedirectPath(raw: string | null | undefined, fallback = DEFAULT_REDIRECT_PATH): string {
	if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_REDIRECT_LENGTH) return fallback;
	if (raw !== raw.trim() || CONTROL_OR_SPACE.test(raw)) return fallback;
	if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.includes("\\")) {
		return fallback;
	}

	const lowerAfterSlash = raw.slice(1).toLowerCase();
	if (lowerAfterSlash.startsWith("%2f") || lowerAfterSlash.startsWith("%5c")) return fallback;

	try {
		const parsed = new URL(raw, "https://waifu.fun");
		if (parsed.origin !== "https://waifu.fun") return fallback;
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	} catch {
		return fallback;
	}
}

export function sanitizeExternalUrl(raw: string | null | undefined): string | null {
	if (typeof raw !== "string") return null;
	const value = raw.trim();
	if (!value || value.length > MAX_EXTERNAL_URL_LENGTH || CONTROL_OR_SPACE.test(value)) return null;

	try {
		const parsed = new URL(value);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
		return parsed.href;
	} catch {
		return null;
	}
}

export type SocialLinks = Partial<Record<"twitter" | "telegram" | "discord" | "website", string>>;

export function sanitizeSocialLinks<T extends SocialLinks>(links: T | null | undefined): SocialLinks {
	if (!links) return {};
	const sanitized: SocialLinks = {};
	const twitter = sanitizeExternalUrl(links.twitter);
	const telegram = sanitizeExternalUrl(links.telegram);
	const discord = sanitizeExternalUrl(links.discord);
	const website = sanitizeExternalUrl(links.website);
	if (twitter) sanitized.twitter = twitter;
	if (telegram) sanitized.telegram = telegram;
	if (discord) sanitized.discord = discord;
	if (website) sanitized.website = website;
	return sanitized;
}
