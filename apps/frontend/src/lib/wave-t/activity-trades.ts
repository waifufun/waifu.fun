import type { AgentTrade } from "@/components/agent-home/types";
import type { ActivityRowInput } from "@/components/agent-home/wave-t/activity-feed";

export const EMPTY_ACTIVITY_COPY =
	"no activity yet · swaps, ships, tweets, and treasury moves stream here once the agent acts on-chain";

/**
 * Project raw AgentTrade swap events into the wave-T activity feed's
 * `trade` row variant and merge them into the existing activity stream.
 *
 * Sorted newest-first. Dedupes by underlying tx hash so an onchain
 * `tx` row (id `onchain-${hash}`) and a `trade` row (id
 * `trade-${hash}-…`) for the same swap collapse to a single entry; the
 * richer `trade` row wins because it carries buy/sell direction and
 * amount.
 */
export function mergeActivityWithTrades(opts: {
	activity: ActivityRowInput[];
	trades: AgentTrade[];
	ticker: string;
}): ActivityRowInput[] {
	const fallbackAsset = opts.ticker ? opts.ticker.toUpperCase() : "TOKEN";
	const tradeRows: ActivityRowInput[] = opts.trades.map((t, idx) => {
		const ms = t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000;
		const amountNum = typeof t.amount === "number" ? t.amount : Number.parseFloat(t.amount);
		const asset = t.tokenSymbol ? t.tokenSymbol.toUpperCase() : fallbackAsset;
		const row: ActivityRowInput = {
			id: `trade-${t.txId || idx}-${t.timestamp}`,
			type: "trade",
			timestamp: new Date(Number.isFinite(ms) && ms > 0 ? ms : Date.now()).toISOString(),
			side: t.type === "sell" ? "sell" : "buy",
			asset,
			amount: Number.isFinite(amountNum) ? amountNum : 0,
			priceBnb: 0,
			venue: "PancakeSwap",
			...(t.txId ? { url: `https://bscscan.com/tx/${t.txId}` } : {}),
		};
		return row;
	});

	const seen = new Set<string>();
	const out: ActivityRowInput[] = [];
	for (const r of [...tradeRows, ...opts.activity]) {
		const key = rowDedupeKey(r);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(r);
	}
	out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
	return out;
}

function rowDedupeKey(row: ActivityRowInput): string {
	const url = (row as { url?: string }).url;
	if (typeof url === "string") {
		const m = url.match(/0x[a-fA-F0-9]{40,}/);
		if (m) return `tx:${m[0].toLowerCase()}`;
	}
	return `id:${row.id}`;
}
