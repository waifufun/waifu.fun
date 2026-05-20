/**
 * Unified activity stream. Merges PRs + tweets + onchain txs into one
 * chronological feed. Each item is a discriminated union by type so the
 * renderer can give each kind its own visual treatment.
 */

import type { ShipItem } from "./github";
import type { MarketsSnapshot } from "./markets";
import type { Tweet } from "./voice";

export type ActivityPR = {
	id: string;
	type: "pr";
	timestamp: string; // iso
	title: string;
	number: number;
	url: string;
};

export type ActivityTweet = {
	id: string;
	type: "tweet";
	timestamp: string;
	text: string;
	url: string;
	impressions: number;
	likes: number;
};

export type ActivityTx = {
	id: string;
	type: "tx";
	timestamp: string;
	method: string;
	valueBnb: number;
	url: string;
};

export type ActivityRevenue = {
	id: string;
	type: "revenue";
	timestamp: string;
	source: "tax" | "referral" | "skill" | "trading";
	usd: number;
};

export type ActivityItem = ActivityPR | ActivityTweet | ActivityTx | ActivityRevenue;

export function buildActivity({
	prs,
	tweets,
	markets,
}: {
	prs: ShipItem[];
	tweets: Tweet[];
	markets: MarketsSnapshot;
}): ActivityItem[] {
	const items: ActivityItem[] = [];

	for (const pr of prs) {
		items.push({
			id: `pr-${pr.number}`,
			type: "pr",
			timestamp: pr.mergedAt,
			title: pr.title,
			number: pr.number,
			url: pr.url,
		});
	}

	for (const t of tweets) {
		items.push({
			id: `tweet-${t.id}`,
			type: "tweet",
			timestamp: t.createdAt,
			text: t.text,
			url: t.url,
			impressions: t.impressions,
			likes: t.likes,
		});
	}

	for (const tx of markets.bsc.recent) {
		items.push({
			id: `tx-${tx.hash}`,
			type: "tx",
			timestamp: new Date(tx.timestamp * 1000).toISOString(),
			method: tx.method,
			valueBnb: tx.valueBnb,
			url: tx.url,
		});
	}

	// future: revenue events when steward billing wires up
	// for now, no revenue items in the stream

	items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
	return items;
}
