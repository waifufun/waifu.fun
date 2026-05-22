// Fetch an agent's recent tweets from the waifu.fun API at request time.
//
// The API resolves the agent's twitter handle from `agentPersonas` and falls
// back through Twitter v2 -> Nitter -> in-memory cache. Build-time fetching is
// wrong for live activity data, so this is a runtime/ISR fetch with a 5 minute
// cache window (matching the API's `Cache-Control: max-age=300`).

export type Tweet = {
	id: string;
	text: string;
	createdAt: string; // iso
	url: string;
	likes: number;
	replies: number;
	impressions: number;
};

export type TweetsSource = "twitter-api" | "nitter" | "cached" | "fallback";

export type TweetsResult = {
	handle: string | null;
	tweets: Tweet[];
	source: TweetsSource;
};

const REVALIDATE_SECONDS = 300;
const DEFAULT_LIMIT = 5;

function serverApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
		return configured.replace(/\/+$/, "");
	}
	if (process.env.NODE_ENV !== "production") return "http://localhost:3100";
	return "https://api.waifu.fun";
}

function isTweet(value: unknown): value is Tweet {
	if (!value || typeof value !== "object") return false;
	const t = value as Record<string, unknown>;
	return (
		typeof t.id === "string" &&
		typeof t.text === "string" &&
		typeof t.createdAt === "string" &&
		typeof t.url === "string" &&
		typeof t.likes === "number" &&
		typeof t.replies === "number" &&
		typeof t.impressions === "number"
	);
}

function isTweetsSource(value: unknown): value is TweetsSource {
	return value === "twitter-api" || value === "nitter" || value === "cached" || value === "fallback";
}

export async function fetchTweetsForAgent(address: string, limit: number = DEFAULT_LIMIT): Promise<TweetsResult> {
	const base = serverApiBase();
	const url = `${base}/v2/agents/${encodeURIComponent(address)}/tweets?limit=${encodeURIComponent(String(limit))}`;
	try {
		const res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
		if (!res.ok) return { handle: null, tweets: [], source: "fallback" };
		const json = (await res.json()) as unknown;
		if (!json || typeof json !== "object") return { handle: null, tweets: [], source: "fallback" };
		const data = (json as { data?: unknown }).data;
		if (!data || typeof data !== "object") return { handle: null, tweets: [], source: "fallback" };
		const record = data as Record<string, unknown>;
		const handle = typeof record.handle === "string" ? record.handle : null;
		const tweetsRaw = Array.isArray(record.tweets) ? record.tweets : [];
		const tweets = tweetsRaw.filter(isTweet);
		const source = isTweetsSource(record.source) ? record.source : "fallback";
		return { handle, tweets, source };
	} catch {
		return { handle: null, tweets: [], source: "fallback" };
	}
}

/**
 * Legacy convenience for the Sol agent page. Returns just the tweets array so
 * `buildActivity({ prs, tweets })` keeps its current shape.
 */
export async function fetchTweets(address: string, limit: number = DEFAULT_LIMIT): Promise<Tweet[]> {
	const result = await fetchTweetsForAgent(address, limit);
	return result.tweets;
}
