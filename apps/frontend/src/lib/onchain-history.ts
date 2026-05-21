/**
 * On-chain transaction history with a graceful cascade.
 *
 * Order of preference:
 *   1. Moralis Deep Index API (requires MORALIS_API_KEY). Cleanest, paginated
 *      response with native transfers + ERC-20 + decoded events. 40K CU/day
 *      on free tier (sign up at moralis.io).
 *   2. Ankr / public BSC RPC + eth_getLogs paginated. No auth required.
 *      We sweep the last ~N blocks (~24h on BSC at 3s blocks ~ 28800 blocks)
 *      for ERC-20 Transfer events touching the address. Native tx history
 *      via RPC alone is too expensive without an indexer, so this path
 *      reports ERC-20 transfers only.
 *   3. eth_getTransactionCount as a last resort: we cannot enumerate
 *      individual txs but can at least confirm the wallet has activity.
 *      Returns an empty list with a non-zero `txCount` hint.
 *
 * Empty results are honest empty states in the UI. Never throws.
 */

export type OnchainChain = "bsc";

export type OnchainTxKind = "transfer" | "swap" | "approve" | "contract" | "native";

export interface OnchainTx {
	hash: string;
	from: string;
	to: string;
	valueUsd: number;
	valueNative: number;
	timestamp: number; // unix seconds
	chain: OnchainChain;
	kind: OnchainTxKind;
	symbol?: string;
	tokenAddress?: string;
	tokenAmount?: string; // raw integer string for ERC-20
	blockNumber: number;
}

export interface OnchainHistoryResult {
	source: "moralis" | "ankr-logs" | "rpc-count" | "none";
	chain: OnchainChain;
	address: string;
	txCount: number;
	txs: OnchainTx[];
}

const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const PUBLIC_BSC_RPCS = [
	"https://bsc-dataseed1.binance.org",
	"https://bsc-dataseed2.binance.org",
	"https://bsc-mainnet.public.blastapi.io",
	"https://rpc.ankr.com/bsc",
];

const PUBLIC_BSC_DEFAULT_RPC = PUBLIC_BSC_RPCS[0] ?? "https://bsc-dataseed1.binance.org";

/** Pad an EVM address to a 32-byte topic. */
function addrToTopic(address: string): string {
	const a = address.toLowerCase().replace(/^0x/, "");
	return `0x${"0".repeat(64 - a.length)}${a}`;
}

function topicToAddress(topic: string): string {
	const t = topic.replace(/^0x/, "");
	return `0x${t.slice(-40)}`;
}

interface RpcReqBody {
	jsonrpc: "2.0";
	id: number;
	method: string;
	params: unknown[];
}

async function rpcCall<T = unknown>(rpc: string, body: RpcReqBody, revalidate = 60): Promise<T | null> {
	try {
		const res = await fetch(rpc, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			next: { revalidate },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as { result?: T; error?: unknown };
		if (json.error) return null;
		return json.result ?? null;
	} catch {
		return null;
	}
}

async function pickHealthyRpc(): Promise<string> {
	for (const rpc of PUBLIC_BSC_RPCS) {
		const block = await rpcCall<string>(rpc, { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }, 30);
		if (block) return rpc;
	}
	return PUBLIC_BSC_DEFAULT_RPC;
}

/**
 * Sweep the last `lookbackBlocks` blocks for ERC-20 Transfer events touching
 * `address` (either as `from` or as `to`). Returns up to `limit` events.
 *
 * BSC: ~3s blocks, so ~28_800 blocks = 24h. Public RPCs typically cap the
 * range per call (Ankr free = 3000 blocks, Binance public = unlimited but
 * slow). We chunk to be safe.
 */
async function fetchTransferLogs(
	rpc: string,
	address: string,
	lookbackBlocks: number,
	limit: number,
): Promise<OnchainTx[]> {
	const head = await rpcCall<string>(rpc, { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }, 30);
	if (!head) return [];
	const headNum = Number.parseInt(head, 16);
	if (!Number.isFinite(headNum) || headNum <= 0) return [];
	const fromBlock = Math.max(0, headNum - lookbackBlocks);

	const addrTopic = addrToTopic(address);

	const chunkSize = 3000; // friendly to Ankr free tier
	const ranges: [number, number][] = [];
	for (let start = fromBlock; start <= headNum && ranges.length < 6; start += chunkSize) {
		const end = Math.min(headNum, start + chunkSize - 1);
		ranges.push([start, end]);
	}

	type RpcLog = {
		address?: string;
		topics?: string[];
		data?: string;
		blockNumber?: string;
		transactionHash?: string;
	};

	const all: OnchainTx[] = [];
	for (const [start, end] of ranges) {
		// Query both directions in parallel for this range.
		const [outgoing, incoming] = await Promise.all([
			rpcCall<RpcLog[]>(
				rpc,
				{
					jsonrpc: "2.0",
					id: 2,
					method: "eth_getLogs",
					params: [
						{
							fromBlock: `0x${start.toString(16)}`,
							toBlock: `0x${end.toString(16)}`,
							topics: [ERC20_TRANSFER_TOPIC, addrTopic],
						},
					],
				},
				120,
			),
			rpcCall<RpcLog[]>(
				rpc,
				{
					jsonrpc: "2.0",
					id: 3,
					method: "eth_getLogs",
					params: [
						{
							fromBlock: `0x${start.toString(16)}`,
							toBlock: `0x${end.toString(16)}`,
							topics: [ERC20_TRANSFER_TOPIC, null, addrTopic],
						},
					],
				},
				120,
			),
		]);

		const merged = [...(outgoing ?? []), ...(incoming ?? [])];
		for (const log of merged) {
			if (!log.transactionHash || !log.topics || log.topics.length < 3) continue;
			const fromTopic = log.topics[1];
			const toTopic = log.topics[2];
			if (!fromTopic || !toTopic) continue;
			const blockHex = log.blockNumber ?? "0x0";
			const blockNumber = Number.parseInt(blockHex, 16);
			const valueHex = log.data && log.data.length > 2 ? log.data : "0x0";
			let valueBig = 0n;
			try {
				valueBig = BigInt(valueHex);
			} catch {
				valueBig = 0n;
			}
			const tx: OnchainTx = {
				hash: log.transactionHash,
				from: topicToAddress(fromTopic),
				to: topicToAddress(toTopic),
				valueUsd: 0,
				valueNative: 0,
				timestamp: 0,
				chain: "bsc",
				kind: "transfer",
				tokenAmount: valueBig.toString(),
				blockNumber,
			};
			if (log.address) tx.tokenAddress = log.address.toLowerCase();
			all.push(tx);
		}
		if (all.length >= limit) break;
	}

	// dedupe by hash (a transfer can show up twice if from == address == to)
	const seen = new Set<string>();
	const deduped: OnchainTx[] = [];
	for (const tx of all) {
		if (seen.has(tx.hash)) continue;
		seen.add(tx.hash);
		deduped.push(tx);
	}

	// Sort newest first and trim.
	deduped.sort((a, b) => b.blockNumber - a.blockNumber);
	return deduped.slice(0, limit);
}

/**
 * Moralis primary path. Requires MORALIS_API_KEY in env.
 * Returns null when unavailable so the caller falls through.
 */
async function fetchMoralis(address: string, limit: number): Promise<OnchainTx[] | null> {
	const key = process.env.MORALIS_API_KEY?.trim();
	if (!key) return null;
	try {
		const url = new URL(`https://deep-index.moralis.io/api/v2.2/${address}`);
		url.searchParams.set("chain", "bsc");
		url.searchParams.set("limit", String(Math.min(100, limit)));
		const res = await fetch(url.toString(), {
			headers: { "X-API-Key": key, accept: "application/json" },
			next: { revalidate: 60 },
		});
		if (!res.ok) return null;
		const data = (await res.json()) as {
			result?: Array<{
				hash?: string;
				block_number?: string;
				block_timestamp?: string;
				from_address?: string;
				to_address?: string;
				value?: string;
				input?: string;
			}>;
		};
		const rows = data.result ?? [];
		return rows
			.filter((r): r is { hash: string } & typeof r => typeof r.hash === "string")
			.map((r) => {
				const valueWei = (() => {
					try {
						return BigInt(r.value ?? "0");
					} catch {
						return 0n;
					}
				})();
				const valueNative = Number(valueWei) / 1e18;
				const block = Number.parseInt(r.block_number ?? "0", 10) || 0;
				const ts = r.block_timestamp ? Math.floor(new Date(r.block_timestamp).getTime() / 1000) : 0;
				const kind: OnchainTxKind =
					r.input && r.input.length > 2 && r.input !== "0x" ? "contract" : ("native" as OnchainTxKind);
				return {
					hash: r.hash,
					from: (r.from_address ?? "").toLowerCase(),
					to: (r.to_address ?? "").toLowerCase(),
					valueNative,
					valueUsd: 0,
					timestamp: ts,
					chain: "bsc" as const,
					kind,
					blockNumber: block,
				};
			});
	} catch {
		return null;
	}
}

/** Try the public-RPC transactionCount as the final hint. */
async function fetchTxCount(address: string): Promise<number> {
	const rpc = await pickHealthyRpc();
	const r = await rpcCall<string>(
		rpc,
		{
			jsonrpc: "2.0",
			id: 1,
			method: "eth_getTransactionCount",
			params: [address, "latest"],
		},
		300,
	);
	if (!r) return 0;
	const n = Number.parseInt(r, 16);
	return Number.isFinite(n) ? n : 0;
}

export interface FetchOnchainHistoryOpts {
	chain: OnchainChain;
	address: string;
	limit?: number;
	/** Block lookback for the eth_getLogs fallback. Defaults to ~24h on BSC. */
	lookbackBlocks?: number;
}

/**
 * Public entry point. Returns a structured result so the UI can render a
 * source hint (`live · moralis` vs `live · public rpc`) honestly.
 */
export async function fetchOnchainHistory(opts: FetchOnchainHistoryOpts): Promise<OnchainHistoryResult> {
	const { chain, address } = opts;
	const limit = Math.max(1, Math.min(50, opts.limit ?? 20));
	const lookback = Math.max(500, Math.min(50_000, opts.lookbackBlocks ?? 28_800));

	if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
		return { source: "none", chain, address, txCount: 0, txs: [] };
	}
	const addr = address.toLowerCase();

	// 1. Moralis
	const moralis = await fetchMoralis(addr, limit);
	if (moralis && moralis.length > 0) {
		return { source: "moralis", chain, address: addr, txCount: moralis.length, txs: moralis };
	}

	// 2. eth_getLogs
	const rpc = await pickHealthyRpc();
	const logs = await fetchTransferLogs(rpc, addr, lookback, limit);
	if (logs.length > 0) {
		return { source: "ankr-logs", chain, address: addr, txCount: logs.length, txs: logs };
	}

	// 3. Bare nonce
	const count = await fetchTxCount(addr);
	return { source: count > 0 ? "rpc-count" : "none", chain, address: addr, txCount: count, txs: [] };
}
