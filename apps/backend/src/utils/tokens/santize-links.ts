export function sanitizeSocialLink(value?: string): string | undefined {
	if (!value || typeof value !== "string") return undefined;
	return value.startsWith("https://") ? value : `https://${value}`;
}