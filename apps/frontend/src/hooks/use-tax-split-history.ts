/**
 * useTaxSplitHistory - lifetime + per-split history for a TaxSplitter.
 *
 * Queries the per-launch `TaxSplitter` for all `Split(address,uint256,
 * uint256,uint256)` events via direct JSON-RPC (`eth_getLogs`), since
 * none of the existing indexers track this event yet.
 *
 * Public BSC RPCs vary wildly in their getLogs caps:
 *   - bsc.publicnode.com  : no documented cap, accepts launch→latest
 *   - bsc-dataseed1...    : "limit exceeded" on broad ranges
 *   - blastapi.io public  : hard 10-block window
 *   - drpc.org freetier   : 10,000-block window
 *
 * We try the friendlier RPCs first and fall back gracefully. Results are
 * cached in localStorage keyed by splitter address: `{ lastBlock, splits }`.
 * On a subsequent page load we only query incrementally from `lastBlock+1`.
 *
 * Returns:
 *   - status      : 'idle' | 'loading' | 'ready' | 'error'
 *   - totals      : cumulative platform / patron / agent wei
 *   - splits      : full chronological list (newest-first)
 *   - lastBlock   : highest block scanned
 *   - error       : human-readable error string when status==='error'
 *
 * The hook tolerates RPC failures completely: status flips to 'error',
 * splits stays empty (or returns cached results if any), and the caller
 * is expected to render a "live readout · cumulative pending indexer"
 * fallback rather than blanking the panel.
 */
"use client";

import { useEffect, useState } from "react";
import { type Address, isAddress } from "viem";

/** Topic0 for `Split(address,uint256,uint256,uint256)`. Precomputed via keccak256. */
const SPLIT_TOPIC = "0xf66885c33d648fcd0d97e0f2a18e30102169c22763473af0fb716f11b4a17dd6";

/** RPC endpoints we try in priority order. */
const RPC_ENDPOINTS = ["https://bsc.publicnode.com", "https://bsc.drpc.org", "https://bsc-rpc.publicnode.com"] as const;

/** Per-call chunk size when an RPC enforces a block-range cap. */
const CHUNK_BLOCKS = 9_000n;

/** Refresh cadence for the incremental tail scan. */
const REFRESH_MS = 90_000;

const STORAGE_KEY_PREFIX = "waifu:tax-split-history:";

export interface SplitEvent {
	/** Tx hash this Split was emitted in. */
	txHash: string;
	/** Block number (decimal). */
	blockNumber: number;
	/** UTC ms epoch when the block was mined. */
	timestampMs: number;
	/** Indexed token (0x00..00 for native BNB splits). */
	token: string;
	/** Native (or token) units split to each leg. */
	platformAmt: bigint;
	patronAmt: bigint;
	agentAmt: bigint;
}

export interface TaxSplitHistory {
	status: "idle" | "loading" | "ready" | "error";
	totals: {
		platformWei: bigint;
		patronWei: bigint;
		agentWei: bigint;
		totalWei: bigint;
		splitCount: number;
	};
	splits: SplitEvent[];
	lastBlockScanned: number;
	error: string | null;
}

interface CachedHistory {
	lastBlock: number;
	splits: SerializedSplit[];
}

interface SerializedSplit {
	txHash: string;
	blockNumber: number;
	timestampMs: number;
	token: string;
	platformAmt: string;
	patronAmt: string;
	agentAmt: string;
}

function readCache(key: string): CachedHistory | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(key);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as CachedHistory;
		if (typeof parsed?.lastBlock !== "number" || !Array.isArray(parsed.splits)) return null;
		return parsed;
	} catch {
		return null;
	}
}

function writeCache(key: string, value: CachedHistory) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		// quota or private mode; non-fatal
	}
}

function serialize(events: SplitEvent[]): SerializedSplit[] {
	return events.map((e) => ({
		txHash: e.txHash,
		blockNumber: e.blockNumber,
		timestampMs: e.timestampMs,
		token: e.token,
		platformAmt: e.platformAmt.toString(),
		patronAmt: e.patronAmt.toString(),
		agentAmt: e.agentAmt.toString(),
	}));
}

function deserialize(events: SerializedSplit[]): SplitEvent[] {
	return events.map((e) => ({
		txHash: e.txHash,
		blockNumber: e.blockNumber,
		timestampMs: e.timestampMs,
		token: e.token,
		platformAmt: BigInt(e.platformAmt),
		patronAmt: BigInt(e.patronAmt),
		agentAmt: BigInt(e.agentAmt),
	}));
}

function totalsOf(events: SplitEvent[]): TaxSplitHistory["totals"] {
	let p = 0n;
	let pat = 0n;
	let a = 0n;
	for (const e of events) {
		p += e.platformAmt;
		pat += e.patronAmt;
		a += e.agentAmt;
	}
	return {
		platformWei: p,
		patronWei: pat,
		agentWei: a,
		totalWei: p + pat + a,
		splitCount: events.length,
	};
}

/** Hex helpers. */
const toHex = (n: number | bigint): string => `0x${BigInt(n).toString(16)}`;

interface RpcLog {
	address: string;
	topics: string[];
	data: string;
	blockNumber: string;
	transactionHash: string;
	blockTimestamp?: string;
}

async function rpcCall<T>(endpoint: string, method: string, params: unknown[]): Promise<T> {
	const res = await fetch(endpoint, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});
	if (!res.ok) throw new Error(`rpc http ${res.status}`);
	const json = (await res.json()) as { result?: T; error?: { message?: string } };
	if (json.error) throw new Error(json.error.message ?? "rpc error");
	if (json.result === undefined) throw new Error("rpc empty result");
	return json.result;
}

async function getBlockNumber(endpoint: string): Promise<bigint> {
	const hex = await rpcCall<string>(endpoint, "eth_blockNumber", []);
	return BigInt(hex);
}

async function getLogsRange(
	endpoint: string,
	splitter: Address,
	fromBlock: bigint,
	toBlock: bigint,
): Promise<RpcLog[]> {
	return rpcCall<RpcLog[]>(endpoint, "eth_getLogs", [
		{
			address: splitter,
			topics: [SPLIT_TOPIC],
			fromBlock: toHex(fromBlock),
			toBlock: toHex(toBlock),
		},
	]);
}

/**
 * Attempt a single broad eth_getLogs over [from..to]. If it fails, fall
 * back to chunked scans. Returns the merged log set on success or throws
 * on total RPC failure.
 */
async function scanRange(endpoint: string, splitter: Address, fromBlock: bigint, toBlock: bigint): Promise<RpcLog[]> {
	// First try one shot — friendly RPCs serve this fine.
	try {
		return await getLogsRange(endpoint, splitter, fromBlock, toBlock);
	} catch {
		// fall through to chunked
	}

	const out: RpcLog[] = [];
	let cursor = fromBlock;
	while (cursor <= toBlock) {
		const end = cursor + CHUNK_BLOCKS - 1n > toBlock ? toBlock : cursor + CHUNK_BLOCKS - 1n;
		const chunk = await getLogsRange(endpoint, splitter, cursor, end);
		out.push(...chunk);
		cursor = end + 1n;
	}
	return out;
}

/**
 * Pull block timestamps for a list of distinct block numbers via
 * `eth_getBlockByNumber`. Used only when the log payload doesn't include
 * `blockTimestamp` (some RPCs omit it).
 */
async function fetchBlockTimestamps(endpoint: string, blocks: bigint[]): Promise<Map<string, number>> {
	const out = new Map<string, number>();
	if (blocks.length === 0) return out;
	// Sequential to be polite to free RPCs. Small N in practice (one split
	// per ~hour, agent page rarely has more than a handful per scan).
	for (const b of blocks) {
		try {
			const blk = await rpcCall<{ timestamp?: string } | null>(endpoint, "eth_getBlockByNumber", [toHex(b), false]);
			if (blk?.timestamp) out.set(toHex(b), Number(BigInt(blk.timestamp)) * 1000);
		} catch {
			// non-fatal; the row just gets timestamp=0
		}
	}
	return out;
}

function decodeLog(log: RpcLog, timestampsByBlock: Map<string, number>): SplitEvent | null {
	if (!log.data || log.data.length < 2 + 64 * 3) return null;
	// data = platform (32) ++ patron (32) ++ agent (32)
	const hex = log.data.slice(2);
	const platformAmt = BigInt(`0x${hex.slice(0, 64)}`);
	const patronAmt = BigInt(`0x${hex.slice(64, 128)}`);
	const agentAmt = BigInt(`0x${hex.slice(128, 192)}`);

	// topic[1] = indexed token (left-padded to 32 bytes)
	const tokenTopic = log.topics[1] ?? "0x";
	const token = `0x${tokenTopic.slice(-40)}`;

	const blockNumber = Number(BigInt(log.blockNumber));
	const tsFromLog = log.blockTimestamp ? Number(BigInt(log.blockTimestamp)) * 1000 : 0;
	const tsFromMap = timestampsByBlock.get(toHex(blockNumber)) ?? 0;

	return {
		txHash: log.transactionHash,
		blockNumber,
		timestampMs: tsFromLog || tsFromMap,
		token,
		platformAmt,
		patronAmt,
		agentAmt,
	};
}

/**
 * Try each RPC endpoint in order. Returns the first one that yields a
 * non-throwing chain head + a successful scan over the requested range.
 *
 * `fromBlock` is the launch block (caller's job to pick a sane lower
 * bound; we don't want to scan from genesis).
 */
async function scanWithFallback(
	splitter: Address,
	fromBlock: bigint,
): Promise<{ events: SplitEvent[]; lastBlock: bigint }> {
	let lastErr: Error | null = null;
	for (const endpoint of RPC_ENDPOINTS) {
		try {
			const head = await getBlockNumber(endpoint);
			if (head < fromBlock) return { events: [], lastBlock: head };
			const logs = await scanRange(endpoint, splitter, fromBlock, head);
			// Backfill timestamps for any log row missing blockTimestamp.
			const needsTs = logs.filter((l) => !l.blockTimestamp).map((l) => BigInt(l.blockNumber));
			const uniq = Array.from(new Set(needsTs.map((b) => b.toString()))).map((s) => BigInt(s));
			const tsMap = uniq.length > 0 ? await fetchBlockTimestamps(endpoint, uniq) : new Map<string, number>();

			const events = logs.map((l) => decodeLog(l, tsMap)).filter((e): e is SplitEvent => e !== null);

			return { events, lastBlock: head };
		} catch (err) {
			lastErr = err instanceof Error ? err : new Error(String(err));
		}
	}
	throw lastErr ?? new Error("all rpc endpoints failed");
}

export function useTaxSplitHistory(splitter: string | null | undefined, launchBlock: number | null): TaxSplitHistory {
	const splitterValid = !!splitter && isAddress(splitter);
	const cacheKey = splitterValid ? `${STORAGE_KEY_PREFIX}${splitter.toLowerCase()}` : null;

	// Seed from localStorage so the first paint isn't empty when we have
	// a cached scan from a prior visit.
	const seed = ((): TaxSplitHistory => {
		const cached = cacheKey ? readCache(cacheKey) : null;
		const events = cached ? deserialize(cached.splits) : [];
		return {
			status: cached ? "ready" : "idle",
			totals: totalsOf(events),
			splits: events,
			lastBlockScanned: cached?.lastBlock ?? 0,
			error: null,
		};
	})();

	const [state, setState] = useState<TaxSplitHistory>(seed);

	useEffect(() => {
		if (!splitterValid || launchBlock === null) return;
		let cancelled = false;

		const run = async () => {
			setState((s) => ({ ...s, status: s.splits.length === 0 ? "loading" : s.status }));
			try {
				const cached = cacheKey ? readCache(cacheKey) : null;
				const prevEvents = cached ? deserialize(cached.splits) : [];
				const fromBlock = BigInt(Math.max(launchBlock, (cached?.lastBlock ?? 0) + 1, launchBlock));

				const { events, lastBlock } = await scanWithFallback(splitter as Address, fromBlock);

				if (cancelled) return;

				// Merge prev + new; de-dupe by tx+blockNumber+logIndex (we don't
				// have logIndex separately, txHash uniqueness within a block
				// for Split() events is the practical key).
				const seen = new Set(prevEvents.map((e) => `${e.txHash}:${e.blockNumber}`));
				const merged = [...prevEvents];
				for (const e of events) {
					const key = `${e.txHash}:${e.blockNumber}`;
					if (seen.has(key)) continue;
					seen.add(key);
					merged.push(e);
				}
				merged.sort((a, b) => b.blockNumber - a.blockNumber);

				if (cacheKey) {
					writeCache(cacheKey, {
						lastBlock: Number(lastBlock),
						splits: serialize(merged),
					});
				}

				setState({
					status: "ready",
					totals: totalsOf(merged),
					splits: merged,
					lastBlockScanned: Number(lastBlock),
					error: null,
				});
			} catch (err) {
				if (cancelled) return;
				const msg = err instanceof Error ? err.message : String(err);
				setState((s) => ({
					...s,
					status: s.splits.length > 0 ? "ready" : "error",
					error: msg,
				}));
			}
		};

		run();
		const interval = setInterval(run, REFRESH_MS);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
		// re-run when the splitter address or launch block changes
	}, [splitterValid, splitter, launchBlock, cacheKey]);

	return state;
}
