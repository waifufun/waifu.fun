// Fetch recent tweets for a handle. Priority: Twitter v2 API -> Nitter HTML
// scrape -> in-memory cache -> null. Cache is process-local, 5 minute TTL.
//
// Returning null lets the route surface an empty list to the frontend without
// baking a stale hardcoded snapshot into the API.

import { normalizeTwitterHandle } from "./follower-count.js";

export type Tweet = {
	id: string;
	text: string;
	createdAt: string;
	url: string;
	likes: number;
	replies: number;
	impressions: number;
};

export type TweetsResult = {
	handle: string;
	tweets: Tweet[];
	source: "twitter-api" | "nitter" | "cached";
	fetchedAt: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const USER_ID_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 25;
const NITTER_INSTANCES = [
	"https://nitter.poast.org",
	"https://nitter.privacydev.net",
	"https://nitter.1d4.us",
] as const;

type TweetsCacheEntry = { value: TweetsResult; expiresAt: number };
type UserIdCacheEntry = { value: string; expiresAt: number };

const tweetsCache = new Map<string, TweetsCacheEntry>();
const userIdCache = new Map<string, UserIdCacheEntry>();

function cacheKey(handle: string, limit: number): string {
	return `${handle}:${limit}`;
}

function readTweetsCache(handle: string, limit: number): TweetsResult | null {
	const entry = tweetsCache.get(cacheKey(handle, limit));
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		tweetsCache.delete(cacheKey(handle, limit));
		return null;
	}
	return entry.value;
}

function writeTweetsCache(handle: string, limit: number, value: TweetsResult): void {
	tweetsCache.set(cacheKey(handle, limit), { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function resolveUserId(handle: string, token: string): Promise<string | null> {
	const cached = userIdCache.get(handle);
	if (cached && Date.now() < cached.expiresAt) return cached.value;

	const res = await fetch(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}`, {
		headers: { authorization: `Bearer ${token}` },
	});
	if (!res.ok) return null;
	const json = (await res.json()) as { data?: { id?: string } };
	const id = json.data?.id;
	if (!id) return null;
	userIdCache.set(handle, { value: id, expiresAt: Date.now() + USER_ID_TTL_MS });
	return id;
}

type ApiTweet = {
	id: string;
	text: string;
	created_at: string;
	public_metrics?: {
		like_count?: number;
		reply_count?: number;
		impression_count?: number;
	};
};

async function fetchFromTwitterApi(handle: string, limit: number): Promise<Tweet[] | null> {
	const token = process.env.TWITTER_BEARER_TOKEN?.trim();
	if (!token) return null;

	const userId = await resolveUserId(handle, token);
	if (!userId) return null;

	const requestSize = Math.min(Math.max(limit, 5), 100);
	const url = `https://api.twitter.com/2/users/${userId}/tweets?max_results=${requestSize}&tweet.fields=created_at,public_metrics,text&exclude=retweets,replies`;
	const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
	if (!res.ok) return null;
	const json = (await res.json()) as { data?: ApiTweet[] };
	const raw = json.data ?? [];
	const out: Tweet[] = raw.slice(0, limit).map((t) => ({
		id: t.id,
		text: t.text,
		createdAt: t.created_at,
		url: `https://x.com/${handle}/status/${t.id}`,
		likes: t.public_metrics?.like_count ?? 0,
		replies: t.public_metrics?.reply_count ?? 0,
		impressions: t.public_metrics?.impression_count ?? 0,
	}));
	return out.length > 0 ? out : null;
}

function decodeHtmlEntities(value: string): string {
	return value
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, " ");
}

function stripTags(html: string): string {
	return decodeHtmlEntities(html.replace(/<[^>]+>/g, ""))
		.replace(/\s+/g, " ")
		.trim();
}

function parseNitterMetric(block: string, label: string): number {
	const re = new RegExp(`class=["'][^"']*icon-${label}[^"']*["'][^<]*</span>([\\s\\S]*?)</div>`, "i");
	const m = block.match(re);
	if (!m) return 0;
	const cleaned = stripTags(m[1] ?? "").replace(/,/g, "");
	const n = Number.parseInt(cleaned, 10);
	return Number.isFinite(n) ? n : 0;
}

export function parseNitterTimeline(html: string, handle: string, limit: number): Tweet[] {
	const tweets: Tweet[] = [];
	const timelineItemRe = /<div class="timeline-item[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/gi;
	for (const match of html.matchAll(timelineItemRe)) {
		const block = match[0];
		// skip retweets and pinned/replies for parity with Twitter API filtering
		if (/class=["'][^"']*retweet-header[^"']*["']/i.test(block)) continue;
		if (/class=["'][^"']*replying-to[^"']*["']/i.test(block)) continue;

		const linkMatch = block.match(/<a class="tweet-link"\s+href="\/[^/]+\/status\/(\d+)/i);
		if (!linkMatch) continue;
		const id = linkMatch[1];
		if (!id) continue;

		const contentMatch = block.match(/<div class="tweet-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
		const text = contentMatch ? stripTags(contentMatch[1] ?? "") : "";

		const dateMatch = block.match(/<span class="tweet-date"><a[^>]*title="([^"]+)"/i);
		const createdAt = dateMatch ? new Date(dateMatch[1] ?? "").toISOString() : new Date().toISOString();

		tweets.push({
			id,
			text,
			createdAt,
			url: `https://x.com/${handle}/status/${id}`,
			likes: parseNitterMetric(block, "heart"),
			replies: parseNitterMetric(block, "comment"),
			impressions: 0,
		});
		if (tweets.length >= limit) break;
	}
	return tweets;
}

async function fetchFromNitter(handle: string, limit: number): Promise<Tweet[] | null> {
	for (const instance of NITTER_INSTANCES) {
		try {
			const res = await fetch(`${instance}/${encodeURIComponent(handle)}`, {
				headers: { "user-agent": "waifu.fun tweets fetcher" },
			});
			if (!res.ok) continue;
			const html = await res.text();
			const parsed = parseNitterTimeline(html, handle, limit);
			if (parsed.length > 0) return parsed;
		} catch {
			// Try the next mirror.
		}
	}
	return null;
}

export async function fetchRecentTweets(rawHandle: string, requestedLimit?: number): Promise<TweetsResult | null> {
	const handle = normalizeTwitterHandle(rawHandle);
	if (!handle) return null;
	const limit = Math.min(Math.max(requestedLimit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

	let apiTweets: Tweet[] | null = null;
	try {
		apiTweets = await fetchFromTwitterApi(handle, limit);
	} catch {
		apiTweets = null;
	}
	if (apiTweets) {
		const value: TweetsResult = {
			handle,
			tweets: apiTweets,
			source: "twitter-api",
			fetchedAt: new Date().toISOString(),
		};
		writeTweetsCache(handle, limit, value);
		return value;
	}

	let nitterTweets: Tweet[] | null = null;
	try {
		nitterTweets = await fetchFromNitter(handle, limit);
	} catch {
		nitterTweets = null;
	}
	if (nitterTweets) {
		const value: TweetsResult = {
			handle,
			tweets: nitterTweets,
			source: "nitter",
			fetchedAt: new Date().toISOString(),
		};
		writeTweetsCache(handle, limit, value);
		return value;
	}

	const cached = readTweetsCache(handle, limit);
	if (cached) return { ...cached, source: "cached" };
	return { handle, tweets: [], source: "cached", fetchedAt: new Date().toISOString() };
}

// Test seam: lets tests warm and inspect the in-memory cache.
export const __tweetsCacheInternal = {
	set(handle: string, limit: number, value: TweetsResult): void {
		writeTweetsCache(handle, limit, value);
	},
	clear(): void {
		tweetsCache.clear();
		userIdCache.clear();
	},
};
