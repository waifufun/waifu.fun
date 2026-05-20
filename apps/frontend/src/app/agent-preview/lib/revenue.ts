/**
 * Revenue stream stub. Returns 4 streams across the chosen time window.
 * All zero for now (no revenue wired). The structure exists so the
 * chart renders with axis + legend + baseline even pre-revenue.
 *
 * Wire each stream when ready:
 *  - tax        : 1-2% of every $WAIFU buy/sell, hits agent safe
 *  - referral   : kickbacks from waifu.fun mini-app palette
 *  - skill      : api calls to give-skill page, eliza-cloud billing
 *  - trading    : realized pnl from hyperliquid / polymarket / spot
 */

export type StreamKey = "tax" | "referral" | "skill" | "trading";

export type StreamMeta = {
	key: StreamKey;
	label: string;
	color: string;
	status: "live" | "scheduled";
	note: string;
};

export const STREAMS: StreamMeta[] = [
	{
		key: "tax",
		label: "tax stream",
		color: "#f59e0b",
		status: "scheduled",
		note: "1-2% of every buy/sell, hits agent safe",
	},
	{
		key: "referral",
		label: "referrals",
		color: "#fbbf24",
		status: "scheduled",
		note: "kickbacks from waifu.fun palette",
	},
	{
		key: "skill",
		label: "skill calls",
		color: "#fcd34d",
		status: "scheduled",
		note: "api calls + eliza-cloud billing",
	},
	{
		key: "trading",
		label: "trading pnl",
		color: "#fde68a",
		status: "scheduled",
		note: "realized pnl across all venues",
	},
];

export type RevenuePoint = {
	t: string; // iso
	tax: number;
	referral: number;
	skill: number;
	trading: number;
};

export type RevenueRange = "24h" | "7d" | "30d" | "all";

export type RevenueSnapshot = {
	range: RevenueRange;
	points: RevenuePoint[];
	totalsUsd: Record<StreamKey, number>;
	grandTotalUsd: number;
};

const FIRST_PR_MS = new Date("2026-03-05T00:00:00Z").getTime();

function generatePoints(range: RevenueRange): RevenuePoint[] {
	const now = Date.now();
	let span: number;
	let count: number;
	switch (range) {
		case "24h":
			span = 24 * 60 * 60 * 1000;
			count = 24;
			break;
		case "7d":
			span = 7 * 24 * 60 * 60 * 1000;
			count = 28; // 4 per day
			break;
		case "30d":
			span = 30 * 24 * 60 * 60 * 1000;
			count = 30;
			break;
		case "all":
			span = now - FIRST_PR_MS;
			count = 40;
			break;
	}
	const step = span / Math.max(1, count - 1);
	const start = now - span;
	const points: RevenuePoint[] = [];
	for (let i = 0; i < count; i++) {
		points.push({
			t: new Date(start + i * step).toISOString(),
			tax: 0,
			referral: 0,
			skill: 0,
			trading: 0,
		});
	}
	return points;
}

export function loadRevenue(range: RevenueRange = "30d"): RevenueSnapshot {
	const points = generatePoints(range);
	const totalsUsd: Record<StreamKey, number> = {
		tax: 0,
		referral: 0,
		skill: 0,
		trading: 0,
	};
	for (const p of points) {
		totalsUsd.tax += p.tax;
		totalsUsd.referral += p.referral;
		totalsUsd.skill += p.skill;
		totalsUsd.trading += p.trading;
	}
	const grandTotalUsd = totalsUsd.tax + totalsUsd.referral + totalsUsd.skill + totalsUsd.trading;
	return { range, points, totalsUsd, grandTotalUsd };
}
