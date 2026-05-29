import type { AgentTrade } from "@/components/agent-home/types";
import type { ActivityRowInput } from "@/components/agent-home/wave-t/activity-feed";

export const EMPTY_ACTIVITY_COPY = "no activity yet · onchain feed quiet";

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

	// Rich hyperliquid fills already arrive as `perpTrade` rows (id
	// `hl-fill-${fillId}`) from the live events stream. The same fills also
	// surface through /activity-trades as generic `trade` rows. Collect the
	// fill ids already present so the generic duplicate collapses into the
	// richer perp row (which carries side/price/notional).
	const perpFillIds = new Set<string>();
	for (const r of opts.activity) {
		if (r.id.startsWith("hl-fill-")) perpFillIds.add(r.id.slice("hl-fill-".length));
	}

	const seen = new Set<string>();
	const out: ActivityRowInput[] = [];
	for (const r of [...tradeRows, ...opts.activity]) {
		// Drop a generic trade row whose tx/fill id matches a perp fill we
		// already render richer.
		if (r.type === "trade") {
			const fillId = (r as { url?: string }).url?.match(/0x[a-fA-F0-9]{40,}/)?.[0];
			const tradeId = r.id.replace(/^trade-/, "").replace(/-\d+$/, "");
			if ((fillId && perpFillIds.has(fillId)) || perpFillIds.has(tradeId)) continue;
		}
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
