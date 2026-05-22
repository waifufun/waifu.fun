import { getDatabase, twitterStats } from "@waifufun/db";
import { eq } from "drizzle-orm";

export type TwitterStats = {
	handle: string;
	followers: number | null;
	following: number | null;
	tweets: number | null;
	source: "twitter-api" | "nitter" | "cached";
	fetchedAt: string;
};

type FetchedTwitterStats = Omit<TwitterStats, "source"> & { source: "twitter-api" | "nitter" };

const CACHE_TTL_MS = 60 * 60 * 1000;
const NITTER_INSTANCES = [
	"https://nitter.poast.org",
	"https://nitter.privacydev.net",
	"https://nitter.1d4.us",
] as const;

export function normalizeTwitterHandle(handle: string): string {
	const trimmed = handle.trim();
	const withoutUrl = trimmed
		.replace(/^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\//i, "")
		.replace(/^https?:\/\/[^/]+\//i, "");
	return withoutUrl.split(/[/?#]/)[0]?.replace(/^@+/, "").toLowerCase() ?? "";
}

function rowToStats(row: typeof twitterStats.$inferSelect, source: TwitterStats["source"] = "cached"): TwitterStats {
	return {
		handle: row.handle,
		followers: row.followers ?? null,
		following: row.following ?? null,
		tweets: row.tweets ?? null,
		source,
		fetchedAt: row.fetchedAt.toISOString(),
	};
}

async function readCached(handle: string): Promise<typeof twitterStats.$inferSelect | null> {
	if (!process.env.DATABASE_URL) return null;
	const db = getDatabase().db;
	const [row] = await db.select().from(twitterStats).where(eq(twitterStats.handle, handle)).limit(1);
	return row ?? null;
}

async function writeCache(stats: FetchedTwitterStats): Promise<void> {
	if (!process.env.DATABASE_URL) return;
	const db = getDatabase().db;
	await db
		.insert(twitterStats)
		.values({
			handle: stats.handle,
			followers: stats.followers,
			following: stats.following,
			tweets: stats.tweets,
			source: stats.source,
			fetchedAt: new Date(stats.fetchedAt),
		})
		.onConflictDoUpdate({
			target: twitterStats.handle,
			set: {
				followers: stats.followers,
				following: stats.following,
				tweets: stats.tweets,
				source: stats.source,
				fetchedAt: new Date(stats.fetchedAt),
			},
		});
}

async function fetchTwitterApi(handle: string): Promise<FetchedTwitterStats | null> {
	const token = process.env.TWITTER_BEARER_TOKEN?.trim();
	if (!token) return null;
	const res = await fetch(
		`https://api.twitter.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=public_metrics`,
		{
			headers: { authorization: `Bearer ${token}` },
		},
	);
	if (!res.ok) return null;
	const json = (await res.json()) as {
		data?: { username?: string; public_metrics?: Record<string, unknown> };
	};
	const metrics = json.data?.public_metrics;
	if (!metrics) return null;
	return {
		handle: normalizeTwitterHandle(json.data?.username ?? handle),
		followers: numberOrNull(metrics.followers_count),
		following: numberOrNull(metrics.following_count),
		tweets: numberOrNull(metrics.tweet_count),
		source: "twitter-api",
		fetchedAt: new Date().toISOString(),
	};
}

function numberOrNull(value: unknown): number | null {
	const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
	return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null;
}

function parseCompactNumber(raw: string): number | null {
	const normalized = raw.replace(/,/g, "").trim().toLowerCase();
	const match = normalized.match(/^([0-9]+(?:\.[0-9]+)?)\s*([km])?$/);
	if (!match) return null;
	const base = Number(match[1]);
	if (!Number.isFinite(base)) return null;
	const suffix = match[2];
	const multiplier = suffix === "m" ? 1_000_000 : suffix === "k" ? 1_000 : 1;
	return Math.round(base * multiplier);
}

function parseNitterStats(html: string, handle: string): FetchedTwitterStats | null {
	const stats: Partial<Record<"followers" | "following" | "tweets", number | null>> = {};
	const statBlockRe = /<li[^>]*class=["'][^"']*profile-stat[^"']*["'][^>]*>([\s\S]*?)<\/li>/gi;
	for (const match of html.matchAll(statBlockRe)) {
		const block = match[1] ?? "";
		const label = block
			.replace(/<[^>]+>/g, " ")
			.replace(/\s+/g, " ")
			.trim()
			.toLowerCase();
		const value = block.match(/<span[^>]*class=["'][^"']*profile-stat-num[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
		if (!value) continue;
		const parsed = parseCompactNumber(value.replace(/<[^>]+>/g, ""));
		if (label.includes("followers")) stats.followers = parsed;
		else if (label.includes("following")) stats.following = parsed;
		else if (label.includes("tweets") || label.includes("posts")) stats.tweets = parsed;
	}
	if (stats.followers == null && stats.following == null && stats.tweets == null) return null;
	return {
		handle,
		followers: stats.followers ?? null,
		following: stats.following ?? null,
		tweets: stats.tweets ?? null,
		source: "nitter",
		fetchedAt: new Date().toISOString(),
	};
}

async function fetchNitter(handle: string): Promise<FetchedTwitterStats | null> {
	for (const instance of NITTER_INSTANCES) {
		try {
			const res = await fetch(`${instance}/${encodeURIComponent(handle)}`, {
				headers: { "user-agent": "waifu.fun twitter stats fetcher" },
			});
			if (!res.ok) continue;
			const parsed = parseNitterStats(await res.text(), handle);
			if (parsed) return parsed;
		} catch {
			// Try the next public Nitter mirror.
		}
	}
	return null;
}

export async function fetchTwitterStats(handle: string): Promise<TwitterStats> {
	const normalized = normalizeTwitterHandle(handle);
	if (!normalized) throw new Error("twitter handle is required");

	let cached: typeof twitterStats.$inferSelect | null = null;
	try {
		cached = await readCached(normalized);
		if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
			return rowToStats(cached, "cached");
		}
	} catch {
		cached = null;
	}

	let fetched: FetchedTwitterStats | null = null;
	try {
		fetched = await fetchTwitterApi(normalized);
	} catch {
		fetched = null;
	}
	if (!fetched) fetched = await fetchNitter(normalized);

	if (fetched) {
		try {
			await writeCache(fetched);
		} catch {
			// External data is still useful even if the DB cache write fails.
		}
		return fetched;
	}

	if (cached) return rowToStats(cached, "cached");
	return {
		handle: normalized,
		followers: null,
		following: null,
		tweets: null,
		source: "cached",
		fetchedAt: new Date().toISOString(),
	};
}
