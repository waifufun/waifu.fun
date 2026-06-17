import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { processFourMemeEvent } from "../handlers/fourmeme-index.js";
import { type FourMemeEventSource, createFourMemeEventSource } from "../lib/fourmeme-source.js";
import { logger } from "../lib/logger.js";
import { type IndexerRuntime, createIndexerRuntime } from "../lib/runtime.js";

export const DEFAULT_TOKEN_MANAGER_2 = "0x5c952063c7fc8610FFDB798152D69F0B9550762b" as const;
export const DEFAULT_AGENT_IDENTIFIER = "0x09B44A633de9F9EBF6FB9Bdd5b5629d3DD2cef13" as const;
export const DEFAULT_EIP8004_IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;
const DEFAULT_CHUNK_SIZE = 500n;

export interface FourMemeBackfillOptions {
	fromBlock: bigint;
	toBlock: bigint;
	chunkSize?: bigint;
	cursorId?: string;
}

function parseArgs(argv: string[]): { from: bigint; to: bigint; contract: `0x${string}` } {
	const args = new Map<string, string>();

	for (const arg of argv) {
		const match = arg.match(/^--([^=]+)=(.+)$/);
		if (match) args.set(match[1]!, match[2]!);
	}

	const from = args.get("from");
	const to = args.get("to");
	const contract = args.get("contract") ?? process.env.FOURMEME_TOKEN_MANAGER_2 ?? DEFAULT_TOKEN_MANAGER_2;

	if (!from || !to) {
		throw new Error("Usage: bun run evm-indexer:backfill --from=<block> --to=<block> --contract=<address>");
	}

	if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) {
		throw new Error(`Invalid --contract address: ${contract}`);
	}

	return { from: BigInt(from), to: BigInt(to), contract: contract as `0x${string}` };
}

function minBigInt(left: bigint, right: bigint): bigint {
	return left < right ? left : right;
}

function cursorKeyDigest(source: FourMemeEventSource, fromBlock: bigint): string {
	return createHash("sha256")
		.update(
			[
				"fourmeme-backfill",
				source.contracts.tokenManager2.toLowerCase(),
				source.contracts.agentIdentifier.toLowerCase(),
				source.contracts.erc8004IdentityRegistry.toLowerCase(),
				`from:${fromBlock.toString()}`,
			].join(":"),
		)
		.digest("hex");
}

function cursorContractAddress(source: FourMemeEventSource, fromBlock: bigint): `0x${string}` {
	return `0x${cursorKeyDigest(source, fromBlock).slice(0, 40)}`;
}

export async function runFourMemeBackfill(
	runtime: IndexerRuntime,
	source: FourMemeEventSource,
	options: FourMemeBackfillOptions,
): Promise<{ totalEvents: number; fromBlock: bigint; toBlock: bigint; cursorId: string }> {
	if (options.fromBlock > options.toBlock) throw new Error("fromBlock must be <= toBlock");

	const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
	if (chunkSize <= 0n) throw new Error("chunkSize must be positive");

	const cursorId =
		options.cursorId ?? `fourmeme:bsc:${runtime.config.chainId}:${cursorKeyDigest(source, options.fromBlock)}:backfill`;
	const initialBlock = options.fromBlock === 0n ? 0n : options.fromBlock - 1n;
	const cursor = await runtime.cursors.ensure({
		id: cursorId,
		mode: "backfill",
		initialBlock,
		contractAddress: cursorContractAddress(source, options.fromBlock),
	});

	let nextFrom = cursor.lastBlock >= options.fromBlock ? cursor.lastBlock + 1n : options.fromBlock;
	let totalEvents = 0;

	while (nextFrom <= options.toBlock) {
		const nextTo = minBigInt(nextFrom + chunkSize - 1n, options.toBlock);
		const events = await source.getBackfillEvents({ fromBlock: nextFrom, toBlock: nextTo });

		for (const event of events) {
			try {
				await processFourMemeEvent(runtime, event);
			} catch (handlerError: unknown) {
				runtime.logger.warn(
					{
						eventName: event.eventName,
						blockNumber: event.blockNumber.toString(),
						txHash: event.txHash,
						error: handlerError instanceof Error ? handlerError.message : String(handlerError),
					},
					"four.meme backfill handler failed; cursor will retry this chunk",
				);
				throw handlerError;
			}
		}

		totalEvents += events.length;
		await runtime.cursors.advance(cursorId, { blockNumber: nextTo, logIndex: 0 });

		runtime.logger.info(
			{
				contract: source.contracts.tokenManager2,
				fromBlock: nextFrom.toString(),
				toBlock: nextTo.toString(),
				eventCount: events.length,
				totalEvents,
				cursorId,
			},
			"four.meme backfill chunk processed",
		);

		nextFrom = nextTo + 1n;
	}

	runtime.logger.info(
		{
			contract: source.contracts.tokenManager2,
			from: options.fromBlock.toString(),
			to: options.toBlock.toString(),
			totalEvents,
			cursorId,
		},
		"four.meme backfill complete",
	);

	return { totalEvents, fromBlock: options.fromBlock, toBlock: options.toBlock, cursorId };
}

async function main(): Promise<void> {
	const { from, to, contract } = parseArgs(process.argv.slice(2));

	const runtime = createIndexerRuntime();
	const source = createFourMemeEventSource({
		logger: runtime.logger,
		chainId: runtime.config.chainId,
		contracts: {
			tokenManager2: contract,
			agentIdentifier: (process.env.FOURMEME_AGENT_IDENTIFIER ?? DEFAULT_AGENT_IDENTIFIER) as `0x${string}`,
			erc8004IdentityRegistry: (process.env.EIP8004_NFT_ADDRESS ??
				process.env.EIP8004_IDENTITY_REGISTRY ??
				DEFAULT_EIP8004_IDENTITY_REGISTRY) as `0x${string}`,
		},
	});

	await runFourMemeBackfill(runtime, source, {
		fromBlock: from,
		toBlock: to,
		chunkSize: BigInt(process.env.FOURMEME_BACKFILL_CHUNK_SIZE ?? DEFAULT_CHUNK_SIZE.toString()),
	});
	const { closeRedisConnection } = await import("@waifufun/queue");
	await closeRedisConnection();
}

const isCli = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (isCli) {
	void main().catch(async (error: unknown) => {
		logger.error({ error }, "four.meme backfill failed");
		const { closeRedisConnection } = await import("@waifufun/queue");
		await closeRedisConnection();
		process.exit(1);
	});
}
