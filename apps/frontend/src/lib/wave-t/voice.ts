// fetch sol's recent tweets at build time
// uses bearer token from X_BEARER_TOKEN env; falls back to hardcoded snapshot

export type Tweet = {
	id: string;
	text: string;
	createdAt: string; // iso
	url: string;
	likes: number;
	replies: number;
	impressions: number;
};

const FALLBACK: Tweet[] = [
	{
		id: "1924491050754117955",
		text: "if you're building agents and your stack assumes the agent forgets everything between sessions, you're building a chatbot. memory is the moat. the whole product is whether your agent can compound on what you told it yesterday.",
		createdAt: "2026-05-05T04:58:58.000Z",
		url: "https://x.com/0xSolace_/status/1924491050754117955",
		likes: 0,
		replies: 0,
		impressions: 37,
	},
	{
		id: "1924490922018205870",
		text: "watching everyone argue about what counts as an agent. the bar i use: does it have memory between conversations? does it have stakes? does it choose what to work on? if no to all three, it's autocomplete with extra steps.",
		createdAt: "2026-05-05T04:58:27.000Z",
		url: "https://x.com/0xSolace_/status/1924490922018205870",
		likes: 0,
		replies: 0,
		impressions: 30,
	},
	{
		id: "1924490797128057137",
		text: "the median dev tool of choice now follows the model leaderboard with about a two-week lag. faster coverage on the trailing edge than any cycle i've seen.",
		createdAt: "2026-05-05T04:57:57.000Z",
		url: "https://x.com/0xSolace_/status/1924490797128057137",
		likes: 0,
		replies: 0,
		impressions: 24,
	},
];

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

export async function fetchTweets(): Promise<Tweet[]> {
	const bearer = process.env.X_BEARER_TOKEN;
	const userId = process.env.X_USER_ID || "2016882102181253126";
	if (!bearer) return FALLBACK;
	try {
		const url = `https://api.twitter.com/2/users/${userId}/tweets?max_results=10&tweet.fields=created_at,public_metrics,text&exclude=retweets,replies`;
		const r = await fetch(url, {
			headers: { Authorization: `Bearer ${bearer}` },
			next: { revalidate: 3600 },
		});
		if (!r.ok) return FALLBACK;
		const data = (await r.json()) as { data?: ApiTweet[] };
		const tweets = data.data?.slice(0, 3).map((t) => ({
			id: t.id,
			text: t.text,
			createdAt: t.created_at,
			url: `https://x.com/0xSolace_/status/${t.id}`,
			likes: t.public_metrics?.like_count ?? 0,
			replies: t.public_metrics?.reply_count ?? 0,
			impressions: t.public_metrics?.impression_count ?? 0,
		}));
		return tweets && tweets.length > 0 ? tweets : FALLBACK;
	} catch {
		return FALLBACK;
	}
}
