export type TwitterStats = {
	handle: string;
	followers: number | null;
	following: number | null;
	tweets: number | null;
	source: "twitter-api" | "nitter" | "cached";
	fetchedAt: string;
};

function serverApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") {
		return "http://localhost:3100";
	}
	return "https://api.waifu.fun";
}

function isTwitterStats(value: unknown): value is TwitterStats {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.handle === "string" &&
		(record.followers === null || typeof record.followers === "number") &&
		(record.following === null || typeof record.following === "number") &&
		(record.tweets === null || typeof record.tweets === "number") &&
		(record.source === "twitter-api" || record.source === "nitter" || record.source === "cached") &&
		typeof record.fetchedAt === "string"
	);
}

export async function fetchAgentTwitterStats(address: string): Promise<TwitterStats | null> {
	const base = serverApiBase();
	try {
		const res = await fetch(`${base}/v2/agents/${encodeURIComponent(address)}/twitter-stats`, {
			next: { revalidate: 600 },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as unknown;
		const data = json && typeof json === "object" && "data" in json ? (json as { data?: unknown }).data : json;
		return isTwitterStats(data) ? data : null;
	} catch {
		return null;
	}
}
