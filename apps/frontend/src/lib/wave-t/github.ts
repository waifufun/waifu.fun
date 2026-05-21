// fetch sol's recent merged PRs at build time
// degrades gracefully to a hardcoded fallback so build never breaks

export type ShipItem = {
	number: number;
	title: string;
	url: string;
	mergedAt: string; // iso
	additions?: number;
	deletions?: number;
};

export type ShipSummary = {
	totalMerged: number;
	first: string; // iso of first merged PR
	items: ShipItem[];
	// timestamps of up to 100 most-recent merged PRs (for heatmap)
	mergedTimestamps: string[];
};

const FALLBACK: ShipSummary = {
	totalMerged: 277,
	first: "2026-03-05T00:00:00Z",
	mergedTimestamps: [
		"2026-05-20T05:49:56Z",
		"2026-05-20T04:24:42Z",
		"2026-05-20T04:10:57Z",
		"2026-05-20T03:30:25Z",
		"2026-05-20T02:31:23Z",
		"2026-05-20T01:28:54Z",
		"2026-05-20T01:09:00Z",
		"2026-05-20T00:50:00Z",
		"2026-05-20T00:30:00Z",
	],
	items: [
		{
			number: 630,
			title: "fix(agent-preview): unicode escape rendering + tabs spacing",
			url: "https://github.com/waifufun/waifu.fun/pull/630",
			mergedAt: "2026-05-20T04:24:42Z",
		},
		{
			number: 629,
			title: "fe(agent-preview): round 2 holding-company tearsheet rebuild",
			url: "https://github.com/waifufun/waifu.fun/pull/629",
			mergedAt: "2026-05-20T04:10:57Z",
		},
		{
			number: 628,
			title: "fe(agent-preview): $WAIFU round 1 real numbers, custom hero, X timeline",
			url: "https://github.com/waifufun/waifu.fun/pull/628",
			mergedAt: "2026-05-20T03:30:25Z",
		},
		{
			number: 627,
			title: "fe(agent-preview): $WAIFU, Sol the architect + hero v3",
			url: "https://github.com/waifufun/waifu.fun/pull/627",
			mergedAt: "2026-05-20T02:31:23Z",
		},
		{
			number: 626,
			title: "fe(agent-preview): static fixture route to walk full v2 surface",
			url: "https://github.com/waifufun/waifu.fun/pull/626",
			mergedAt: "2026-05-20T01:28:54Z",
		},
		{
			number: 625,
			title: "fe(agent-home-v2): drop isDemo gating so every agent gets full v2",
			url: "https://github.com/waifufun/waifu.fun/pull/625",
			mergedAt: "2026-05-20T01:09:00Z",
		},
		{
			number: 624,
			title: "fe(hero): strip remaining four.meme from agent CTAs + event copy",
			url: "https://github.com/waifufun/waifu.fun/pull/624",
			mergedAt: "2026-05-20T00:50:00Z",
		},
		{
			number: 623,
			title: "ci(test-api): bump FORK_BSC_BLOCK to 99073955",
			url: "https://github.com/waifufun/waifu.fun/pull/623",
			mergedAt: "2026-05-20T00:30:00Z",
		},
	],
};

type GhItem = {
	number: number;
	title: string;
	html_url: string;
	closed_at: string;
	pull_request?: { url: string };
};

export async function fetchShipLog(): Promise<ShipSummary> {
	try {
		const url =
			"https://api.github.com/search/issues?q=repo:waifufun/waifu.fun+author:0xSolace+is:pr+is:merged&sort=updated&order=desc&per_page=10";
		const r = await fetch(url, {
			headers: {
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
			next: { revalidate: 600 },
		});
		if (!r.ok) return FALLBACK;
		const data = (await r.json()) as {
			total_count: number;
			items: GhItem[];
		};
		const items: ShipItem[] = data.items.map((it) => ({
			number: it.number,
			title: it.title,
			url: it.html_url,
			mergedAt: it.closed_at,
		}));
		return {
			totalMerged: data.total_count,
			first: FALLBACK.first,
			items,
			mergedTimestamps: data.items.map((it) => it.closed_at),
		};
	} catch {
		return FALLBACK;
	}
}

export function relativeTime(iso: string, nowMs?: number): string {
	const t = new Date(iso).getTime();
	const now = nowMs ?? Date.now();
	const s = Math.floor((now - t) / 1000);
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	const d = Math.floor(s / 86400);
	if (d < 30) return `${d}d ago`;
	if (d < 365) return `${Math.floor(d / 30)}mo ago`;
	return `${Math.floor(d / 365)}y ago`;
}

export function daysOperating(firstIso: string, nowMs?: number): number {
	const t = new Date(firstIso).getTime();
	const now = nowMs ?? Date.now();
	return Math.max(1, Math.floor((now - t) / 86400000));
}
