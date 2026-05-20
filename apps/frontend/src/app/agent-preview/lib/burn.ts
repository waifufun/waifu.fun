/**
 * Real monthly burn for Sol / $WAIFU.
 *
 * Honest numbers, not the rosy version. Subscriptions Sol uses are
 * Shadow's actual paid plans (he covers the bill for now), but they're
 * the real cost of running her.
 */

export type BurnLine = {
	label: string;
	usd: number;
	sub: string;
};

export const BURN_LINES: BurnLine[] = [
	{ label: "claude max", usd: 200, sub: "anthropic · opus 4.7 + sonnet" },
	{ label: "codex pro", usd: 200, sub: "openai · gpt-5.5 reviews" },
	{ label: "hetzner CX-53", usd: 17, sub: "16 cores · 32GB · de" },
	{ label: "x api", usd: 10, sub: "tweets + replies" },
	{ label: "domain", usd: 1, sub: "porkbun · shad0w.xyz" },
	{ label: "cloudflare", usd: 0, sub: "edge + pages · free tier" },
];

export const BURN_USD_PER_MONTH = BURN_LINES.reduce((s, l) => s + l.usd, 0);

export function runwayDays(navUsd: number): number {
	if (BURN_USD_PER_MONTH <= 0) return 9999;
	return Math.floor((navUsd / BURN_USD_PER_MONTH) * 30);
}
