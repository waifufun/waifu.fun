import { schema } from "@waifufun/db";
import { and, isNotNull } from "drizzle-orm";
import { type Address, formatUnits, parseAbi, parseAbiItem } from "viem";

import type { IndexerRuntime } from "../lib/runtime.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const WBNB_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c".toLowerCase();

const pairAbi = parseAbi(["function token0() view returns (address)", "function token1() view returns (address)"]);
const swapEvent = parseAbiItem(
	"event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
);

interface V2SwapStreamOptions {
	pollIntervalMs?: number;
	maxBlocksPerPoll?: bigint;
	startBlock?: bigint;
	runOnce?: boolean;
}

interface LaunchPair {
	tokenAddress: Address;
	pairAddress: Address;
	createBlockNumber: bigint | null;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAddress(value: string): Address {
	return value.toLowerCase() as Address;
}

function decimalRatio(numeratorWei: bigint, denominatorWei: bigint): string | null {
	if (denominatorWei === 0n) return null;
	return formatUnits((numeratorWei * 10n ** 18n) / denominatorWei, 18);
}

async function getLaunchPairs(runtime: IndexerRuntime): Promise<LaunchPair[]> {
	const rows = await runtime.db
		.select({
			tokenAddress: schema.agentLaunches.tokenAddress,
			pairAddress: schema.agentLaunches.v2Pair,
			createBlockNumber: schema.agentLaunches.createBlockNumber,
		})
		.from(schema.agentLaunches)
		.where(and(isNotNull(schema.agentLaunches.v2Pair), isNotNull(schema.agentLaunches.tokenAddress)));

	return rows
		.filter((row): row is typeof row & { pairAddress: string } =>
			Boolean(row.pairAddress && row.pairAddress !== ZERO_ADDRESS),
		)
		.map((row) => ({
			tokenAddress: normalizeAddress(row.tokenAddress),
			pairAddress: normalizeAddress(row.pairAddress),
			createBlockNumber: row.createBlockNumber,
		}));
}

async function getPairTokens(
	runtime: IndexerRuntime,
	pairAddress: Address,
): Promise<{ token0: Address; token1: Address }> {
	const [token0, token1] = await Promise.all([
		runtime.publicClient.readContract({ address: pairAddress, abi: pairAbi, functionName: "token0" }),
		runtime.publicClient.readContract({ address: pairAddress, abi: pairAbi, functionName: "token1" }),
	]);
	return { token0: normalizeAddress(token0), token1: normalizeAddress(token1) };
}

async function indexPairOnce(
	runtime: IndexerRuntime,
	pair: LaunchPair,
	options: Required<V2SwapStreamOptions>,
): Promise<void> {
	const latestBlock = await runtime.publicClient.getBlockNumber();
	const pairStartBlock =
		pair.createBlockNumber && pair.createBlockNumber > options.startBlock ? pair.createBlockNumber : options.startBlock;
	const cursorId = `v2swap:bsc:${runtime.config.chainId}:${pair.pairAddress}`;
	const cursor = await runtime.cursors.ensure({
		id: cursorId,
		mode: "live",
		initialBlock: pairStartBlock > 0n ? pairStartBlock - 1n : 0n,
		contractAddress: pair.pairAddress,
	});

	const fromBlock = cursor.lastBlock + 1n;
	if (fromBlock > latestBlock) return;

	const toBlock =
		fromBlock + options.maxBlocksPerPoll - 1n > latestBlock ? latestBlock : fromBlock + options.maxBlocksPerPoll - 1n;
	const { token0, token1 } = await getPairTokens(runtime, pair.pairAddress);
	const tokenAddress = normalizeAddress(pair.tokenAddress);
	const tokenIs0 = token0 === tokenAddress;
	const tokenIs1 = token1 === tokenAddress;
	const quoteIs0 = token0 === WBNB_ADDRESS;
	const quoteIs1 = token1 === WBNB_ADDRESS;

	if ((!tokenIs0 && !tokenIs1) || (!quoteIs0 && !quoteIs1)) {
		runtime.logger.warn(
			{ pairAddress: pair.pairAddress, tokenAddress, token0, token1 },
			"skipping v2 pair with unexpected token layout",
		);
		await runtime.cursors.advance(cursorId, { blockNumber: toBlock, logIndex: 0 });
		return;
	}

	const logs = await runtime.publicClient.getLogs({ address: pair.pairAddress, event: swapEvent, fromBlock, toBlock });

	for (const log of logs) {
		const block = await runtime.publicClient.getBlock({ blockNumber: log.blockNumber });
		const amount0In = log.args.amount0In ?? 0n;
		const amount1In = log.args.amount1In ?? 0n;
		const amount0Out = log.args.amount0Out ?? 0n;
		const amount1Out = log.args.amount1Out ?? 0n;
		const quoteIn = quoteIs0 ? amount0In : amount1In;
		const quoteOut = quoteIs0 ? amount0Out : amount1Out;
		const tokenIn = tokenIs0 ? amount0In : amount1In;
		const tokenOut = tokenIs0 ? amount0Out : amount1Out;
		const side = quoteIn > 0n && tokenOut > 0n ? "buy" : tokenIn > 0n && quoteOut > 0n ? "sell" : null;

		if (!side) {
			runtime.logger.warn(
				{ pairAddress: pair.pairAddress, txHash: log.transactionHash, logIndex: log.logIndex },
				"skipping non-standard v2 swap",
			);
			await runtime.cursors.advance(cursorId, { blockNumber: log.blockNumber, logIndex: log.logIndex });
			continue;
		}

		const quoteAmount = side === "buy" ? quoteIn : quoteOut;
		const tokenAmount = side === "buy" ? tokenOut : tokenIn;
		const trader = normalizeAddress((log.args.to ?? log.args.sender ?? ZERO_ADDRESS) as string);
		const blockTimestamp = new Date(Number(block.timestamp) * 1000);

		await runtime.db.transaction(async (tx) => {
			const [eventRecord] = await tx
				.insert(schema.events)
				.values({
					chainId: runtime.config.chainId,
					blockNumber: log.blockNumber,
					txHash: log.transactionHash,
					logIndex: log.logIndex,
					eventType: "SwapExecuted",
					portalAddress: pair.pairAddress,
					tokenAddress,
					actorAddress: trader,
					payload: {
						pairAddress: pair.pairAddress,
						sender: log.args.sender,
						to: log.args.to,
						amount0In: amount0In.toString(),
						amount1In: amount1In.toString(),
						amount0Out: amount0Out.toString(),
						amount1Out: amount1Out.toString(),
					},
					rawTopics: [...log.topics],
					rawData: Buffer.from(log.data.slice(2), "hex"),
					blockTimestamp,
					processed: true,
				})
				.onConflictDoUpdate({
					target: [schema.events.chainId, schema.events.txHash, schema.events.logIndex],
					set: { processed: true, processError: null },
				})
				.returning({ id: schema.events.id });

			await tx
				.insert(schema.trades)
				.values({
					eventId: eventRecord!.id,
					chainId: runtime.config.chainId,
					tokenAddress,
					traderAddress: trader,
					side,
					amountIn: (side === "buy" ? quoteAmount : tokenAmount).toString(),
					amountOut: (side === "buy" ? tokenAmount : quoteAmount).toString(),
					price: decimalRatio(quoteAmount, tokenAmount),
					txHash: log.transactionHash,
					blockNumber: log.blockNumber,
					blockTimestamp,
				})
				.onConflictDoNothing();
		});

		await runtime.cursors.advance(cursorId, { blockNumber: log.blockNumber, logIndex: log.logIndex });
		runtime.logger.info(
			{
				tokenAddress,
				pairAddress: pair.pairAddress,
				side,
				txHash: log.transactionHash,
				blockNumber: log.blockNumber.toString(),
			},
			"indexed v2 swap trade",
		);
	}

	await runtime.cursors.advance(cursorId, { blockNumber: toBlock, logIndex: 0 });
	runtime.logger.info(
		{
			cursorId,
			tokenAddress,
			pairAddress: pair.pairAddress,
			eventCount: logs.length,
			fromBlock: fromBlock.toString(),
			toBlock: toBlock.toString(),
		},
		"v2 swap poll finished",
	);
}

async function pollV2SwapsOnce(runtime: IndexerRuntime, options: Required<V2SwapStreamOptions>): Promise<void> {
	const pairs = await getLaunchPairs(runtime);
	for (const pair of pairs) {
		try {
			await indexPairOnce(runtime, pair, options);
		} catch (error: unknown) {
			runtime.logger.error(
				{ error, pairAddress: pair.pairAddress, tokenAddress: pair.tokenAddress },
				"v2 swap pair poll failed",
			);
		}
	}
}

export async function startV2PairSwapStream(
	runtime: IndexerRuntime,
	options: V2SwapStreamOptions = {},
): Promise<() => void> {
	if (process.env.V2_SWAP_INDEXER_ENABLED === "false") {
		runtime.logger.info("v2 swap indexer disabled");
		return () => undefined;
	}

	const resolved: Required<V2SwapStreamOptions> = {
		pollIntervalMs:
			options.pollIntervalMs ??
			Number(process.env.V2_SWAP_POLL_INTERVAL_MS ?? process.env.INDEXER_POLL_INTERVAL ?? 5_000),
		maxBlocksPerPoll: options.maxBlocksPerPoll ?? BigInt(process.env.V2_SWAP_MAX_BLOCKS ?? "500"),
		startBlock: options.startBlock ?? BigInt(process.env.V2_SWAP_START_BLOCK ?? process.env.INDEXER_START_BLOCK ?? "0"),
		runOnce: options.runOnce ?? process.env.INDEXER_RUN_ONCE === "1",
	};

	await pollV2SwapsOnce(runtime, resolved);

	if (resolved.runOnce) return () => undefined;

	let stopped = false;
	void (async () => {
		while (!stopped) {
			await delay(resolved.pollIntervalMs);
			if (stopped) return;
			await pollV2SwapsOnce(runtime, resolved);
		}
	})();

	return () => {
		stopped = true;
	};
}
