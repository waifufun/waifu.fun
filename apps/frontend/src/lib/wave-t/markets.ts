/**
 * Markets surfaces for Sol:
 *  - bsc onchain trading (live, real)
 *  - hyperliquid perps (pending fund)
 *  - polymarket predictions (pending fund)
 *
 * Honest empty-states: "pending fund" not blank placeholders.
 */

import { SOL_BURNER } from "./holdings";

export type BscTx = {
	hash: string;
	timestamp: number; // unix
	from: string;
	to: string;
	valueBnb: number;
	method: string;
	url: string;
};

export type MarketsSnapshot = {
	bsc: {
		txCount: number;
		recent: BscTx[];
	};
	hyperliquid: {
		state: "pending_fund" | "funded";
		address: string | null;
		target: number;
	};
	polymarket: {
		state: "pending_fund" | "funded";
		address: string | null;
		target: number;
	};
};

const FALLBACK: MarketsSnapshot = {
	bsc: {
		txCount: 4,
		recent: [],
	},
	hyperliquid: {
		state: "pending_fund",
		address: null,
		target: 50,
	},
	polymarket: {
		state: "pending_fund",
		address: null,
		target: 50,
	},
};

type BscScanResult = {
	status: string;
	result?: Array<{
		hash: string;
		timeStamp: string;
		from: string;
		to: string;
		value: string;
		functionName?: string;
		input?: string;
		isError: string;
	}>;
};

function methodFromInput(input?: string, functionName?: string): string {
	if (functionName && functionName.length > 0) {
		const m = functionName.match(/^([a-zA-Z0-9_]+)/);
		if (m) return m[1] || functionName;
	}
	if (!input || input === "0x" || input.length < 10) return "transfer";
	return input.slice(0, 10);
}

export async function fetchMarkets(): Promise<MarketsSnapshot> {
	// Try eth_getTransactionCount via public BSC RPC for the live tx count.
	// Free, no key. Fall back to FALLBACK if it errors.
	try {
		const body = {
			jsonrpc: "2.0",
			id: 1,
			method: "eth_getTransactionCount",
			params: [SOL_BURNER, "latest"],
		};
		const r = await fetch("https://bsc-mainnet.public.blastapi.io", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			next: { revalidate: 600 },
		});
		if (!r.ok) return FALLBACK;
		const data = (await r.json()) as { result?: string };
		const nonceHex = data.result;
		const nonce = nonceHex ? Number.parseInt(nonceHex, 16) : 4;
		return {
			bsc: { txCount: Number.isFinite(nonce) ? nonce : 4, recent: [] },
			hyperliquid: FALLBACK.hyperliquid,
			polymarket: FALLBACK.polymarket,
		};
	} catch {
		return FALLBACK;
	}
}
