import type { PublicClient } from "viem";

/**
 * Native (BNB / ETH) transfer indexing source.
 *
 * Background: the agent-wallet stream used to scan native value transfers
 * block-by-block with `getBlock({ includeTransactions: true })` (one RPC call
 * per block). With ~1.7M blocks since the May launch that is hours-to-days to
 * backfill. ERC20 already uses range-based `eth_getLogs` and is fine.
 *
 * This module replaces the serial scan with a swappable, fast source:
 *
 *  1. `alchemy` (preferred when the archive RPC is an Alchemy endpoint):
 *     `alchemy_getAssetTransfers` is range-based and indexed (one call per
 *     page of ~1000 transfers). On BSC Alchemy only accepts the `internal`
 *     category for native value (the `third-party` category is rejected despite
 *     being advertised), so on BSC we use `internal` and fall back to a bounded
 *     parallel getBlock scan to catch top-level (third-party) EOA sends. On chains
 *     that accept `external` (Base / Arbitrum) we request both in one call.
 *
 *  2. `getBlock` (fallback): parallel batched `getBlock` windows instead of a
 *     serial loop, so a wide range still completes in a tolerable number of
 *     round-trips. Only catches top-level (third-party) value transfers.
 *
 * Known data-availability limit (BSC): native BNB that arrives via an internal
 * CALL inside a contract execution is only surfaced if the RPC exposes it via
 * `getAssetTransfers internal`. Funding that the upstream RPC does not trace
 * (observed for some Safe deployments on the free Alchemy BSC tier) cannot be
 * indexed from this source and needs a paid archive/trace provider.
 */

export type NativeTransfer = {
	from: string;
	to: string;
	value: bigint;
	txHash: string;
	blockNumber: bigint;
	/**
	 * A stable per-transfer index within a tx. Top-level (third-party) sends use the
	 * transaction index in the block; internal transfers use a synthetic ordinal.
	 * The stream maps these to negative logIndex values so they never collide
	 * with ERC20 log indices.
	 */
	transferIndex: number;
	kind: "external" | "internal";
};

export type NativeSourceKind = "alchemy" | "getBlock";

export interface NativeTransferFetchInput {
	// Only getBlock is used; accept any client exposing it (callers pass a
	// parametrized PublicClient whose generics don't match the bare type).
	client: Pick<PublicClient, "getBlock">;
	rpcUrl: string;
	chainId: number;
	addresses: string[];
	fromBlock: bigint;
	toBlock: bigint;
	requestTimeoutMs: number;
	/** Max getBlock calls issued in parallel per window (fallback path). */
	getBlockConcurrency?: number;
}

const DEFAULT_GET_BLOCK_CONCURRENCY = 12;
const ALCHEMY_PAGE_SIZE = "0x3e8"; // 1000 transfers per page (max for getAssetTransfers).

function normalize(value: string): string {
	return value.toLowerCase();
}

function toHexBlock(value: bigint): string {
	return `0x${value.toString(16)}`;
}

function isAlchemyUrl(rpcUrl: string): boolean {
	return /\.alchemy\.com\//i.test(rpcUrl) || /\.alchemyapi\.io\//i.test(rpcUrl);
}

/**
 * Categories accepted by `alchemy_getAssetTransfers` for native value transfers.
 * BSC (56) rejects `third-party`; other chains accept it. We always include
 * `internal` (Safe / contract funding) where the RPC supports it.
 */
function alchemyNativeCategories(chainId: number): string[] {
	if (chainId === 56) return ["internal"];
	return ["external", "internal"];
}

export function selectNativeSourceKind(rpcUrl: string): NativeSourceKind {
	return isAlchemyUrl(rpcUrl) ? "alchemy" : "getBlock";
}

type AlchemyTransferRow = {
	from?: string;
	to?: string | null;
	hash?: string;
	blockNum?: string;
	value?: number | null;
	rawContract?: { value?: string | null } | null;
	category?: string;
	uniqueId?: string;
};

async function alchemyAssetTransfersPage(input: {
	rpcUrl: string;
	requestTimeoutMs: number;
	params: Record<string, unknown>;
}): Promise<{ transfers: AlchemyTransferRow[]; pageKey?: string }> {
	const body = {
		jsonrpc: "2.0",
		id: 1,
		method: "alchemy_getAssetTransfers",
		params: [input.params],
	};
	const response = await fetch(input.rpcUrl, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(input.requestTimeoutMs),
	});
	if (!response.ok) {
		throw new Error(`alchemy_getAssetTransfers HTTP ${response.status}`);
	}
	const json = (await response.json()) as {
		error?: { message?: string };
		result?: { transfers?: AlchemyTransferRow[]; pageKey?: string };
	};
	if (json.error) {
		throw new Error(`alchemy_getAssetTransfers error: ${json.error.message ?? "unknown"}`);
	}
	return {
		transfers: json.result?.transfers ?? [],
		pageKey: json.result?.pageKey,
	};
}

function parseTransferValue(row: AlchemyTransferRow): bigint {
	const raw = row.rawContract?.value;
	if (raw && raw.length > 0) {
		try {
			return BigInt(raw);
		} catch {
			// fall through to decimal value below
		}
	}
	if (typeof row.value === "number" && Number.isFinite(row.value) && row.value > 0) {
		// `value` is a float in token units; reconstruct wei (18 decimals).
		// This only runs when rawContract.value is missing, which is rare.
		return BigInt(Math.round(row.value * 1e18));
	}
	return 0n;
}

/**
 * Fetch native transfers touching any of `addresses` via Alchemy
 * `getAssetTransfers`, paginated. Queries both directions (from / to) per
 * address set in a single category request each. De-duplicates by uniqueId.
 */
async function fetchViaAlchemy(input: NativeTransferFetchInput): Promise<NativeTransfer[]> {
	const categories = alchemyNativeCategories(input.chainId);
	const addresses = input.addresses.map(normalize);
	const wanted = new Set(addresses);
	const seen = new Set<string>();
	const out: NativeTransfer[] = [];
	let ordinal = 0;

	const directions: Array<"fromAddress" | "toAddress"> = ["fromAddress", "toAddress"];
	// getAssetTransfers takes a single from/to address per call, so iterate.
	for (const address of addresses) {
		for (const direction of directions) {
			let pageKey: string | undefined;
			do {
				const params: Record<string, unknown> = {
					fromBlock: toHexBlock(input.fromBlock),
					toBlock: toHexBlock(input.toBlock),
					[direction]: address,
					category: categories,
					maxCount: ALCHEMY_PAGE_SIZE,
					excludeZeroValue: true,
					order: "asc",
				};
				if (pageKey) params.pageKey = pageKey;
				const page = await alchemyAssetTransfersPage({
					rpcUrl: input.rpcUrl,
					requestTimeoutMs: input.requestTimeoutMs,
					params,
				});
				for (const row of page.transfers) {
					const from = normalize(row.from ?? "");
					const to = normalize(row.to ?? "");
					if (!wanted.has(from) && !wanted.has(to)) continue;
					const txHash = row.hash ?? "";
					const dedupeKey = row.uniqueId ?? `${txHash}:${row.category}:${from}:${to}`;
					if (seen.has(dedupeKey)) continue;
					seen.add(dedupeKey);
					const value = parseTransferValue(row);
					if (value === 0n) continue;
					const blockNumber = row.blockNum ? BigInt(row.blockNum) : 0n;
					out.push({
						from,
						to,
						value,
						txHash,
						blockNumber,
						transferIndex: ordinal++,
						kind: row.category === "internal" ? "internal" : "external",
					});
				}
				pageKey = page.pageKey;
			} while (pageKey);
		}
	}
	return out;
}

/**
 * Parallel batched getBlock scan. Catches top-level (third-party) value transfers
 * only. Used as the BSC fallback for third-party sends (Alchemy rejects the
 * `third-party` category on BSC) and as the source for non-Alchemy RPCs.
 */
async function fetchViaGetBlock(input: NativeTransferFetchInput): Promise<NativeTransfer[]> {
	const wanted = new Set(input.addresses.map(normalize));
	const concurrency = Math.max(1, input.getBlockConcurrency ?? DEFAULT_GET_BLOCK_CONCURRENCY);
	const out: NativeTransfer[] = [];

	const blocks: bigint[] = [];
	for (let b = input.fromBlock; b <= input.toBlock; b += 1n) blocks.push(b);

	for (let i = 0; i < blocks.length; i += concurrency) {
		const window = blocks.slice(i, i + concurrency);
		const results = await Promise.all(
			window.map(async (blockNumber) => {
				const block = await input.client.getBlock({ blockNumber, includeTransactions: true });
				return block;
			}),
		);
		for (const block of results) {
			for (const [txIndex, tx] of block.transactions.entries()) {
				if (typeof tx === "string") continue;
				if (tx.value === 0n || !tx.to) continue;
				const from = normalize(tx.from);
				const to = normalize(tx.to);
				if (!wanted.has(from) && !wanted.has(to)) continue;
				out.push({
					from,
					to,
					value: tx.value,
					txHash: tx.hash,
					blockNumber: block.number ?? blockNumber(block),
					transferIndex: txIndex,
					kind: "external",
				});
			}
		}
	}
	return out;
}

function blockNumber(block: { number: bigint | null }): bigint {
	return block.number ?? 0n;
}

/**
 * Fetch native transfers for the given address set over a block range, using
 * the fastest available source for the chain / RPC.
 *
 * On BSC + Alchemy: combine `getAssetTransfers internal` (indexed) with a
 * bounded parallel getBlock scan for top-level third-party sends. The getBlock
 * window is only attempted when the range is small enough to stay within a
 * reasonable RPC budget (`maxGetBlockSpan`); the stream sizes its native poll
 * window accordingly so backfill advances in tolerable chunks.
 */
export async function fetchNativeTransfersFor(
	input: NativeTransferFetchInput & { maxGetBlockSpan?: bigint },
): Promise<{ transfers: NativeTransfer[]; source: NativeSourceKind; getBlockScanned: boolean }> {
	if (input.fromBlock > input.toBlock || input.addresses.length === 0) {
		return { transfers: [], source: selectNativeSourceKind(input.rpcUrl), getBlockScanned: false };
	}

	const kind = selectNativeSourceKind(input.rpcUrl);
	if (kind === "getBlock") {
		const transfers = await fetchViaGetBlock(input);
		return { transfers, source: "getBlock", getBlockScanned: true };
	}

	// Alchemy path.
	const alchemyTransfers = await fetchViaAlchemy(input);

	// On BSC, `third-party` (top-level EOA sends) are not returned by Alchemy, so we
	// supplement with a bounded parallel getBlock scan. Skip when the range is
	// wider than the configured span to keep the RPC budget bounded.
	let getBlockScanned = false;
	let topLevelTransfers: NativeTransfer[] = [];
	if (input.chainId === 56) {
		const span = input.toBlock - input.fromBlock + 1n;
		const maxSpan = input.maxGetBlockSpan ?? span;
		if (span <= maxSpan) {
			topLevelTransfers = await fetchViaGetBlock(input);
			getBlockScanned = true;
		}
	}

	// De-dupe: a transfer may appear in both the internal (Alchemy) and third-party
	// (getBlock) sets. Key on tx + from + to + value.
	const seen = new Set<string>();
	const merged: NativeTransfer[] = [];
	let ordinal = 0;
	for (const t of [...alchemyTransfers, ...topLevelTransfers]) {
		const key = `${t.txHash}:${t.from}:${t.to}:${t.value.toString()}`;
		if (seen.has(key)) continue;
		seen.add(key);
		merged.push({ ...t, transferIndex: ordinal++ });
	}

	return { transfers: merged, source: "alchemy", getBlockScanned };
}
