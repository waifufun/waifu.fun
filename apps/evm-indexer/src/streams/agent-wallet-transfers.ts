import { schema } from "@waifufun/db";
import { inArray, sql } from "drizzle-orm";
import { http, type Address, createPublicClient, formatUnits, parseAbiItem } from "viem";
import { arbitrum, bsc } from "viem/chains";

import { renderEventData } from "@waifufun/db";
import type { IndexerRuntime } from "../lib/runtime.js";
import { type NativeSourceKind, fetchNativeTransfersFor, selectNativeSourceKind } from "./native-transfer-source.js";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const NATIVE_SENTINEL = "0x0000000000000000000000000000000000000000" as const;
const NATIVE_SYMBOL = "BNB";
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const DEFAULT_TICK_WATCHDOG_MS = 60_000;
const ADDRESS_CHUNK_SIZE = 75;
const TOKEN_CHUNK_SIZE = 25;
const DEFAULT_NATIVE_MAX_BLOCKS_PER_POLL = 2_000n;
// Cap the parallel getBlock supplement (BSC third-party sends) per poll so the RPC
// budget stays bounded even when the native poll window is large.
const DEFAULT_NATIVE_GET_BLOCK_MAX_SPAN = 250n;
const DEFAULT_NATIVE_GET_BLOCK_CONCURRENCY = 12;
const BSC_LAUNCH_FALLBACK_BLOCK = 100_400_000n; // Covers the 2026-05-20 launch window without scanning genesis.
// Free public BSC RPC used for the ERC20 wallet-transfer path. ERC20 transfers
// are read with topic-filtered eth_getLogs (the from/to wallets are indexed
// topics), so the payload per range is tiny and does NOT need an archive
// provider. Keeping this path off Alchemy is the bulk of the cost saving.
const PUBLIC_BSC_RPC_URL = "https://bsc-dataseed.binance.org";
// Native BNB backfill (Alchemy getAssetTransfers across the full launch window)
// is the genuinely expensive call. Default to forward-only: index native
// transfers from the live cursor forward and skip the deep backfill. Opt back
// in with AGENT_WALLET_TRANSFER_NATIVE_BACKFILL=true if a one-off historical
// pass is ever funded.
const NATIVE_BACKFILL_ENABLED = process.env.AGENT_WALLET_TRANSFER_NATIVE_BACKFILL === "true";
const CURSOR_CONTRACT_ADDRESSES = {
	erc20Backfill: "0x0000000000000000000000000000000000000101",
	nativeBackfill: "0x0000000000000000000000000000000000000102",
	erc20Live: "0x0000000000000000000000000000000000000103",
	nativeLive: "0x0000000000000000000000000000000000000104",
} as const satisfies Record<string, Address>;

const CHAIN_CONFIG = {
	bsc: {
		chainId: 56,
		chain: bsc,
		rpcEnv: "BSC_RPC_URL",
		archiveRpcEnv: "ALCHEMY_BSC_URL",
		cursorPrefix: "wallet-transfer:bsc",
		source: "evm-indexer:bsc",
		nativeSymbol: NATIVE_SYMBOL,
	},
	arb: {
		chainId: 42161,
		chain: arbitrum,
		rpcEnv: "ARBITRUM_RPC_URL",
		archiveRpcEnv: "ALCHEMY_ARBITRUM_URL",
		cursorPrefix: "wallet-transfer:arb",
		source: "evm-indexer:arb",
		nativeSymbol: "ETH",
	},
} as const;

type SupportedChain = keyof typeof CHAIN_CONFIG;

export type RegisteredWallet = {
	agentTokenAddress: string;
	address: string;
	chain: SupportedChain;
	role: string;
	label: string;
	launchBlock: bigint | null;
};

type TransferCandidate = {
	from: string;
	to: string;
	wallet: RegisteredWallet;
	tokenAddress: string;
	amountRaw: bigint;
	txHash: string;
	blockNumber: bigint;
	logIndex: number;
	assetKind: "erc20" | "native";
	assetSymbol?: string;
};

type PollMetrics = {
	chain: SupportedChain;
	cursorId: string;
	mode: "live" | "backfill";
	fromBlock: string;
	toBlock: string;
	walletCount: number;
	tokenCount: number;
	logsFetched: number;
	nativeTransfersFetched: number;
	nativeSource?: NativeSourceKind;
	nativeGetBlockScanned?: boolean;
	eventsEmitted: number;
	durationMs: number;
};

export interface AgentWalletTransferStreamOptions {
	pollIntervalMs?: number;
	maxBlocksPerPoll?: bigint;
	backfillMaxBlocksPerPoll?: bigint;
	nativeMaxBlocksPerPoll?: bigint;
	nativeGetBlockMaxSpan?: bigint;
	nativeGetBlockConcurrency?: number;
	startBlock?: bigint;
	runOnce?: boolean;
	requestTimeoutMs?: number;
	tickWatchdogMs?: number;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value: string): string {
	return value.toLowerCase();
}

function errorDetails(err: unknown): Record<string, unknown> {
	if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
	return { message: String(err) };
}

function chunk<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
	return chunks;
}

function uniq<T>(items: Iterable<T>): T[] {
	return [...new Set(items)];
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
	const signal = AbortSignal.timeout(timeoutMs);
	if (signal.aborted) throw new Error(`${label} timed out after ${timeoutMs}ms`);
	return await new Promise<T>((resolve, reject) => {
		const abort = () => reject(new Error(`${label} timed out after ${timeoutMs}ms`));
		signal.addEventListener("abort", abort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener("abort", abort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		);
	});
}

// RPC for the native (BNB / ETH) path. Native transfers emit no logs, so this
// path still needs the trace-capable archive provider (Alchemy
// getAssetTransfers) when available, falling back to the configured / default
// RPC for the bounded getBlock scan.
export function nativeRpcUrlFor(chain: SupportedChain): string {
	const cfg = CHAIN_CONFIG[chain];
	return process.env[cfg.archiveRpcEnv] ?? process.env[cfg.rpcEnv] ?? cfg.chain.rpcUrls.default.http[0];
}

// RPC for the ERC20 path. Topic-filtered getLogs needs no archive node, so we
// deliberately ignore the Alchemy archive env here and prefer a free public
// endpoint. Order: explicit BSC_RPC_URL / ARBITRUM_RPC_URL override, then the
// free public default (BSC), then viem's bundled default for the chain.
export function erc20RpcUrlFor(chain: SupportedChain): string {
	const cfg = CHAIN_CONFIG[chain];
	const explicit = process.env[cfg.rpcEnv];
	if (explicit) return explicit;
	if (chain === "bsc") return PUBLIC_BSC_RPC_URL;
	return cfg.chain.rpcUrls.default.http[0];
}

async function loadWallets(runtime: IndexerRuntime): Promise<RegisteredWallet[]> {
	const rows = await runtime.db
		.select({
			agentTokenAddress: schema.agentWalletRegistry.agentTokenAddress,
			address: schema.agentWalletRegistry.address,
			chain: schema.agentWalletRegistry.chain,
			role: schema.agentWalletRegistry.role,
			label: schema.agentWalletRegistry.label,
			launchBlock: schema.agentLaunches.createBlockNumber,
		})
		.from(schema.agentWalletRegistry)
		.leftJoin(
			schema.agentLaunches,
			sql`lower(${schema.agentLaunches.tokenAddress}) = lower(${schema.agentWalletRegistry.agentTokenAddress})`,
		)
		.where(inArray(schema.agentWalletRegistry.chain, ["bsc", "arb"]));
	return rows.map((row) => ({
		...row,
		address: normalize(row.address),
		agentTokenAddress: normalize(row.agentTokenAddress),
	})) as RegisteredWallet[];
}

function initialBackfillBlock(
	chain: SupportedChain,
	wallets: RegisteredWallet[],
	configuredStartBlock: bigint,
): bigint {
	const launchBlocks = wallets
		.map((wallet) => wallet.launchBlock)
		.filter((block): block is bigint => block !== null && block > 0n);
	if (launchBlocks.length > 0) return launchBlocks.reduce((min, block) => (block < min ? block : min));
	if (configuredStartBlock > 0n) return configuredStartBlock;
	return chain === "bsc" ? BSC_LAUNCH_FALLBACK_BLOCK : 0n;
}

export async function fetchErc20Transfers(input: {
	client: ReturnType<typeof createPublicClient>;
	chain: SupportedChain;
	wallets: RegisteredWallet[];
	fromBlock: bigint;
	toBlock: bigint;
	requestTimeoutMs: number;
}): Promise<{ candidates: TransferCandidate[]; logsFetched: number }> {
	const byAddress = new Map<string, RegisteredWallet[]>();
	for (const wallet of input.wallets) byAddress.set(wallet.address, [...(byAddress.get(wallet.address) ?? []), wallet]);

	const tokenAddresses = uniq(input.wallets.map((wallet) => wallet.agentTokenAddress)) as Address[];
	const walletAddresses = uniq(input.wallets.map((wallet) => wallet.address)) as Address[];
	const seenLogs = new Set<string>();
	const candidates: TransferCandidate[] = [];
	let logsFetched = 0;

	for (const tokenChunk of chunk(tokenAddresses, TOKEN_CHUNK_SIZE)) {
		for (const walletChunk of chunk(walletAddresses, ADDRESS_CHUNK_SIZE)) {
			for (const direction of ["in", "out"] as const) {
				const args = direction === "in" ? { to: walletChunk } : { from: walletChunk };
				const logs = await withTimeout(
					input.client.getLogs({
						address: tokenChunk,
						event: transferEvent,
						args,
						fromBlock: input.fromBlock,
						toBlock: input.toBlock,
					}),
					input.requestTimeoutMs,
					`agent-wallet ${input.chain} erc20 getLogs`,
				);
				logsFetched += logs.length;
				for (const log of logs) {
					const key = `${log.transactionHash}:${log.logIndex}`;
					if (seenLogs.has(key)) continue;
					seenLogs.add(key);
					const from = normalize(String(log.args.from));
					const to = normalize(String(log.args.to));
					const touched = [...(byAddress.get(from) ?? []), ...(byAddress.get(to) ?? [])];
					for (const wallet of touched) {
						if (wallet.agentTokenAddress !== normalize(log.address)) continue;
						candidates.push({
							from,
							to,
							wallet,
							tokenAddress: normalize(log.address),
							amountRaw: log.args.value ?? 0n,
							txHash: log.transactionHash,
							blockNumber: log.blockNumber,
							logIndex: log.logIndex,
							assetKind: "erc20",
						});
					}
				}
			}
		}
	}

	return { candidates, logsFetched };
}

async function fetchNativeTransfers(input: {
	client: ReturnType<typeof createPublicClient>;
	chain: SupportedChain;
	wallets: RegisteredWallet[];
	fromBlock: bigint;
	toBlock: bigint;
	requestTimeoutMs: number;
	getBlockMaxSpan: bigint;
	getBlockConcurrency: number;
}): Promise<{ candidates: TransferCandidate[]; source: NativeSourceKind; getBlockScanned: boolean }> {
	const cfg = CHAIN_CONFIG[input.chain];
	const byAddress = new Map<string, RegisteredWallet[]>();
	for (const wallet of input.wallets) byAddress.set(wallet.address, [...(byAddress.get(wallet.address) ?? []), wallet]);

	const { transfers, source, getBlockScanned } = await withTimeout(
		fetchNativeTransfersFor({
			client: input.client,
			rpcUrl: nativeRpcUrlFor(input.chain),
			chainId: cfg.chainId,
			addresses: uniq(input.wallets.map((wallet) => wallet.address)),
			fromBlock: input.fromBlock,
			toBlock: input.toBlock,
			requestTimeoutMs: input.requestTimeoutMs,
			getBlockConcurrency: input.getBlockConcurrency,
			maxGetBlockSpan: input.getBlockMaxSpan,
		}),
		// The source can issue many RPC calls (paginated getAssetTransfers +
		// parallel getBlock); give it a generous multiple of the per-call timeout.
		input.requestTimeoutMs * 20,
		`agent-wallet ${input.chain} native fetch`,
	);

	const candidates: TransferCandidate[] = [];
	for (const transfer of transfers) {
		const touched = [...(byAddress.get(transfer.from) ?? []), ...(byAddress.get(transfer.to) ?? [])];
		for (const wallet of touched) {
			candidates.push({
				from: transfer.from,
				to: transfer.to,
				wallet,
				tokenAddress: NATIVE_SENTINEL,
				amountRaw: transfer.value,
				txHash: transfer.txHash,
				blockNumber: transfer.blockNumber,
				// Native transfers use negative logIndex so they never collide with
				// ERC20 log indices for the same tx.
				logIndex: -1 - transfer.transferIndex,
				assetKind: "native",
				assetSymbol: cfg.nativeSymbol,
			});
		}
	}
	return { candidates, source, getBlockScanned };
}

async function blockTimestamp(
	client: ReturnType<typeof createPublicClient>,
	blockNumber: bigint,
	cache: Map<bigint, Date>,
	requestTimeoutMs: number,
): Promise<Date> {
	const cached = cache.get(blockNumber);
	if (cached) return cached;
	const block = await withTimeout(
		client.getBlock({ blockNumber }),
		requestTimeoutMs,
		"agent-wallet getBlock timestamp",
	);
	const date = new Date(Number(block.timestamp) * 1000);
	cache.set(blockNumber, date);
	return date;
}

async function emitTransfers(input: {
	runtime: IndexerRuntime;
	client: ReturnType<typeof createPublicClient>;
	chain: SupportedChain;
	candidates: TransferCandidate[];
	requestTimeoutMs: number;
}): Promise<number> {
	const cfg = CHAIN_CONFIG[input.chain];
	const timestampCache = new Map<bigint, Date>();
	let emitted = 0;
	for (const candidate of input.candidates.sort((a, b) => {
		if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1;
		return a.logIndex - b.logIndex;
	})) {
		const direction = candidate.wallet.address === candidate.to ? "in" : "out";
		const eventType = direction === "in" ? "transfer.in" : "transfer.out";
		const amountFormatted = formatUnits(candidate.amountRaw, 18);
		const occurredAt = await blockTimestamp(
			input.client,
			candidate.blockNumber,
			timestampCache,
			input.requestTimeoutMs,
		);
		const payload = {
			chain: input.chain,
			chainId: String(cfg.chainId),
			from: candidate.from,
			to: candidate.to,
			wallet: candidate.wallet.address,
			walletRole: candidate.wallet.role,
			walletLabel: candidate.wallet.label,
			assetKind: candidate.assetKind,
			assetSymbol: candidate.assetSymbol,
			tokenAddress: candidate.tokenAddress,
			amountRaw: candidate.amountRaw.toString(),
			amount: Number(amountFormatted),
			amountFormatted,
			txHash: candidate.txHash,
			blockNumber: candidate.blockNumber.toString(),
			logIndex: candidate.logIndex,
		};
		const sourceEventId =
			candidate.assetKind === "erc20"
				? `${input.chain}:${candidate.txHash}:${candidate.logIndex}:${candidate.wallet.address}`
				: `${input.chain}:native:${candidate.txHash}:${candidate.logIndex}:${candidate.wallet.address}`;
		const rows = await input.runtime.db
			.insert(schema.agentEvents)
			.values({
				agentId: null,
				tokenAddress: candidate.wallet.agentTokenAddress,
				eventType,
				data: renderEventData(eventType, payload),
				source: cfg.source,
				sourceEventId,
				type: eventType,
				payload,
				status: "done",
				chainId: String(cfg.chainId),
				txHash: candidate.txHash,
				blockNumber: candidate.blockNumber.toString(),
				occurredAt,
				createdAt: occurredAt,
				processedAt: new Date(),
			})
			.onConflictDoNothing({ target: [schema.agentEvents.source, schema.agentEvents.sourceEventId] })
			.returning({ id: schema.agentEvents.id });
		if (rows.length > 0) emitted += 1;
	}
	return emitted;
}

async function pollChainRange(input: {
	runtime: IndexerRuntime;
	chain: SupportedChain;
	wallets: RegisteredWallet[];
	options: Required<AgentWalletTransferStreamOptions>;
	cursorId: string;
	mode: "live" | "backfill";
	initialBlock: bigint;
	cursorContractAddress: Address;
	maxBlocks: bigint;
	includeErc20: boolean;
	includeNative: boolean;
}): Promise<PollMetrics | null> {
	const cfg = CHAIN_CONFIG[input.chain];
	const startedAt = Date.now();
	// ERC20 path + block-number / timestamp reads use the free public RPC.
	const client = createPublicClient({
		chain: cfg.chain,
		transport: http(erc20RpcUrlFor(input.chain), { timeout: input.options.requestTimeoutMs }),
	});
	// Native path keeps the trace-capable archive RPC (Alchemy) when configured;
	// only instantiated when this poll actually reads native transfers.
	const nativeClient = input.includeNative
		? createPublicClient({
				chain: cfg.chain,
				transport: http(nativeRpcUrlFor(input.chain), { timeout: input.options.requestTimeoutMs }),
			})
		: client;
	const latestBlock = await withTimeout(
		client.getBlockNumber(),
		input.options.requestTimeoutMs,
		`agent-wallet ${input.chain} getBlockNumber`,
	);
	const cursor = await input.runtime.cursors.ensure({
		id: input.cursorId,
		mode: input.mode,
		initialBlock: input.initialBlock,
		contractAddress: input.cursorContractAddress,
	});
	const fromBlock = cursor.lastBlock + 1n;
	if (fromBlock > latestBlock) return null;
	const toBlock = fromBlock + input.maxBlocks - 1n > latestBlock ? latestBlock : fromBlock + input.maxBlocks - 1n;

	const erc20 = input.includeErc20
		? await fetchErc20Transfers({
				client,
				chain: input.chain,
				wallets: input.wallets,
				fromBlock,
				toBlock,
				requestTimeoutMs: input.options.requestTimeoutMs,
			})
		: { candidates: [], logsFetched: 0 };
	const native = input.includeNative
		? await fetchNativeTransfers({
				client: nativeClient,
				chain: input.chain,
				wallets: input.wallets,
				fromBlock,
				toBlock,
				requestTimeoutMs: input.options.requestTimeoutMs,
				getBlockMaxSpan: input.options.nativeGetBlockMaxSpan,
				getBlockConcurrency: input.options.nativeGetBlockConcurrency,
			})
		: { candidates: [], source: undefined, getBlockScanned: false };
	const eventsEmitted = await emitTransfers({
		runtime: input.runtime,
		client,
		chain: input.chain,
		candidates: [...erc20.candidates, ...native.candidates],
		requestTimeoutMs: input.options.requestTimeoutMs,
	});

	await input.runtime.cursors.advance(input.cursorId, { blockNumber: toBlock, logIndex: 0 });
	return {
		chain: input.chain,
		cursorId: input.cursorId,
		mode: input.mode,
		fromBlock: fromBlock.toString(),
		toBlock: toBlock.toString(),
		walletCount: input.wallets.length,
		tokenCount: uniq(input.wallets.map((wallet) => wallet.agentTokenAddress)).length,
		logsFetched: erc20.logsFetched,
		nativeTransfersFetched: native.candidates.length,
		nativeSource: native.source,
		nativeGetBlockScanned: native.getBlockScanned,
		eventsEmitted,
		durationMs: Date.now() - startedAt,
	};
}

async function pollChainOnce(
	runtime: IndexerRuntime,
	chain: SupportedChain,
	wallets: RegisteredWallet[],
	options: Required<AgentWalletTransferStreamOptions>,
): Promise<void> {
	const cfg = CHAIN_CONFIG[chain];
	const chainWallets = wallets.filter((wallet) => wallet.chain === chain);
	if (chainWallets.length === 0) return;

	const configuredStart = options.startBlock === 0n ? 0n : options.startBlock - 1n;
	const backfillStart = initialBackfillBlock(chain, chainWallets, options.startBlock);
	const initialBackfill = backfillStart === 0n ? 0n : backfillStart - 1n;
	const metrics: PollMetrics[] = [];

	const backfillErc20Metrics = await pollChainRange({
		runtime,
		chain,
		wallets: chainWallets,
		options,
		cursorId: `${cfg.cursorPrefix}:erc20:backfill`,
		mode: "backfill",
		initialBlock: initialBackfill,
		cursorContractAddress: CURSOR_CONTRACT_ADDRESSES.erc20Backfill,
		maxBlocks: options.backfillMaxBlocksPerPoll,
		includeErc20: true,
		includeNative: false,
	});
	if (backfillErc20Metrics) metrics.push(backfillErc20Metrics);

	// Native BNB backfill is the expensive Alchemy getAssetTransfers path across
	// the full launch window. It is forward-only by default (the live native
	// cursor below already fast-forwarded to head), so the deep backfill is
	// skipped unless explicitly funded via AGENT_WALLET_TRANSFER_NATIVE_BACKFILL.
	if (NATIVE_BACKFILL_ENABLED) {
		const backfillNativeMetrics = await pollChainRange({
			runtime,
			chain,
			wallets: chainWallets,
			options,
			cursorId: `${cfg.cursorPrefix}:native:backfill`,
			mode: "backfill",
			initialBlock: initialBackfill,
			cursorContractAddress: CURSOR_CONTRACT_ADDRESSES.nativeBackfill,
			maxBlocks: options.nativeMaxBlocksPerPoll,
			includeErc20: false,
			includeNative: true,
		});
		if (backfillNativeMetrics) metrics.push(backfillNativeMetrics);
	}

	const liveErc20Metrics = await pollChainRange({
		runtime,
		chain,
		wallets: chainWallets,
		options,
		cursorId: `${cfg.cursorPrefix}:erc20:live`,
		mode: "live",
		initialBlock: configuredStart,
		cursorContractAddress: CURSOR_CONTRACT_ADDRESSES.erc20Live,
		maxBlocks: options.maxBlocksPerPoll,
		includeErc20: true,
		includeNative: false,
	});
	if (liveErc20Metrics) metrics.push(liveErc20Metrics);

	const liveNativeMetrics = await pollChainRange({
		runtime,
		chain,
		wallets: chainWallets,
		options,
		cursorId: `${cfg.cursorPrefix}:native:live`,
		mode: "live",
		initialBlock: configuredStart,
		cursorContractAddress: CURSOR_CONTRACT_ADDRESSES.nativeLive,
		maxBlocks: options.nativeMaxBlocksPerPoll,
		includeErc20: false,
		includeNative: true,
	});
	if (liveNativeMetrics) metrics.push(liveNativeMetrics);

	for (const metric of metrics) runtime.logger.info(metric, "agent wallet transfer poll finished");
}

export async function startAgentWalletTransferStream(
	runtime: IndexerRuntime,
	options: AgentWalletTransferStreamOptions = {},
): Promise<() => void> {
	if (process.env.AGENT_WALLET_TRANSFER_INDEXER_ENABLED !== "true") {
		runtime.logger.info("AGENT_WALLET_TRANSFER_INDEXER_ENABLED != true, skipping wallet transfer stream");
		return () => undefined;
	}
	const resolved: Required<AgentWalletTransferStreamOptions> = {
		pollIntervalMs: options.pollIntervalMs ?? runtime.config.livePollIntervalMs,
		maxBlocksPerPoll: options.maxBlocksPerPoll ?? runtime.config.liveMaxBlocksPerPoll,
		backfillMaxBlocksPerPoll: options.backfillMaxBlocksPerPoll ?? runtime.config.backfillChunkSize,
		nativeMaxBlocksPerPoll:
			options.nativeMaxBlocksPerPoll ??
			BigInt(process.env.AGENT_WALLET_TRANSFER_NATIVE_MAX_BLOCKS ?? DEFAULT_NATIVE_MAX_BLOCKS_PER_POLL.toString()),
		nativeGetBlockMaxSpan:
			options.nativeGetBlockMaxSpan ??
			BigInt(
				process.env.AGENT_WALLET_TRANSFER_NATIVE_GET_BLOCK_MAX_SPAN ?? DEFAULT_NATIVE_GET_BLOCK_MAX_SPAN.toString(),
			),
		nativeGetBlockConcurrency:
			options.nativeGetBlockConcurrency ??
			Number(
				process.env.AGENT_WALLET_TRANSFER_NATIVE_GET_BLOCK_CONCURRENCY ??
					DEFAULT_NATIVE_GET_BLOCK_CONCURRENCY.toString(),
			),
		startBlock: options.startBlock ?? runtime.config.startBlock,
		runOnce: options.runOnce ?? process.env.INDEXER_RUN_ONCE === "1",
		requestTimeoutMs:
			options.requestTimeoutMs ??
			Number(process.env.AGENT_WALLET_TRANSFER_RPC_TIMEOUT_MS ?? DEFAULT_REQUEST_TIMEOUT_MS),
		tickWatchdogMs:
			options.tickWatchdogMs ?? Number(process.env.AGENT_WALLET_TRANSFER_TICK_WATCHDOG_MS ?? DEFAULT_TICK_WATCHDOG_MS),
	};

	let stopped = false;
	let running = false;
	let timer: NodeJS.Timeout | null = null;
	let watchdogTimer: NodeJS.Timeout | null = null;
	let activeTickId = 0;

	const scheduleNext = () => {
		if (!stopped && !resolved.runOnce) timer = setTimeout(() => void tick(), resolved.pollIntervalMs);
	};

	const tick = async () => {
		if (stopped) return;
		if (running) {
			runtime.logger.warn(
				{ activeTickId },
				"agent wallet transfer tick skipped because previous tick is still running",
			);
			return;
		}
		running = true;
		const tickId = ++activeTickId;
		const startedAt = Date.now();
		let watchdogFired = false;
		const currentWatchdogTimer = setTimeout(() => {
			if (!running || activeTickId !== tickId || stopped) return;
			watchdogFired = true;
			activeTickId += 1;
			running = false;
			runtime.logger.error(
				{ tickId, durationMs: Date.now() - startedAt, tickWatchdogMs: resolved.tickWatchdogMs },
				"agent wallet transfer tick exceeded watchdog; forcing stream state reset",
			);
			scheduleNext();
		}, resolved.tickWatchdogMs);
		watchdogTimer = currentWatchdogTimer;
		try {
			const wallets = await loadWallets(runtime);
			await pollChainOnce(runtime, "bsc", wallets, resolved);
			if (activeTickId === tickId && !watchdogFired && !stopped) await pollChainOnce(runtime, "arb", wallets, resolved);
		} catch (err) {
			runtime.logger.error({ err: errorDetails(err) }, "agent wallet transfer tick failed");
		} finally {
			clearTimeout(currentWatchdogTimer);
			if (watchdogTimer === currentWatchdogTimer) watchdogTimer = null;
			runtime.logger.info({ durationMs: Date.now() - startedAt }, "agent wallet transfer tick heartbeat");
			if (activeTickId === tickId && !watchdogFired) {
				running = false;
				scheduleNext();
			}
		}
	};

	runtime.logger.info(
		{
			pollIntervalMs: resolved.pollIntervalMs,
			maxBlocksPerPoll: resolved.maxBlocksPerPoll.toString(),
			backfillMaxBlocksPerPoll: resolved.backfillMaxBlocksPerPoll.toString(),
			nativeMaxBlocksPerPoll: resolved.nativeMaxBlocksPerPoll.toString(),
			nativeGetBlockMaxSpan: resolved.nativeGetBlockMaxSpan.toString(),
			nativeGetBlockConcurrency: resolved.nativeGetBlockConcurrency,
			nativeSourceBsc: selectNativeSourceKind(nativeRpcUrlFor("bsc")),
			nativeSourceArb: selectNativeSourceKind(nativeRpcUrlFor("arb")),
			erc20RpcBsc: erc20RpcUrlFor("bsc"),
			nativeBackfillEnabled: NATIVE_BACKFILL_ENABLED,
			requestTimeoutMs: resolved.requestTimeoutMs,
			tickWatchdogMs: resolved.tickWatchdogMs,
		},
		"starting agent wallet transfer stream",
	);
	await tick();
	if (resolved.runOnce) return () => undefined;
	return () => {
		stopped = true;
		if (timer) clearTimeout(timer);
		if (watchdogTimer) clearTimeout(watchdogTimer);
	};
}
