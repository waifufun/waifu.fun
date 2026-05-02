import { closeRedisConnection } from "@waifufun/queue";

import { processFourMemeEvent } from "../handlers/fourmeme-index.js";
import { createFourMemeEventSource } from "../lib/fourmeme-source.js";
import { logger } from "../lib/logger.js";
import { createIndexerRuntime } from "../lib/runtime.js";

const DEFAULT_TOKEN_MANAGER_2 = "0x5c952063c7fc8610FFDB798152D69F0B9550762b" as const;
const DEFAULT_AGENT_IDENTIFIER = "0x09B44A633de9F9EBF6FB9Bdd5b5629d3DD2cef13" as const;
const CHUNK_SIZE = 500n;

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

async function main(): Promise<void> {
	const { from, to, contract } = parseArgs(process.argv.slice(2));
	if (from > to) throw new Error("--from must be <= --to");

	const runtime = createIndexerRuntime();
	const source = createFourMemeEventSource({
		logger: runtime.logger,
		chainId: runtime.config.chainId,
		contracts: {
			tokenManager2: contract,
			agentIdentifier: (process.env.FOURMEME_AGENT_IDENTIFIER ?? DEFAULT_AGENT_IDENTIFIER) as `0x${string}`,
		},
	});

	let nextFrom = from;
	let totalEvents = 0;

	while (nextFrom <= to) {
		const nextTo = minBigInt(nextFrom + CHUNK_SIZE - 1n, to);
		const events = await source.getBackfillEvents({ fromBlock: nextFrom, toBlock: nextTo });

		for (const event of events) {
			await processFourMemeEvent(runtime, event);
		}

		totalEvents += events.length;
		runtime.logger.info(
			{
				contract,
				fromBlock: nextFrom.toString(),
				toBlock: nextTo.toString(),
				eventCount: events.length,
				totalEvents,
			},
			"four.meme backfill chunk processed",
		);

		nextFrom = nextTo + 1n;
	}

	runtime.logger.info(
		{ contract, from: from.toString(), to: to.toString(), totalEvents },
		"four.meme backfill complete",
	);
	await closeRedisConnection();
}

void main().catch(async (error: unknown) => {
	logger.error({ error }, "four.meme backfill failed");
	await closeRedisConnection();
	process.exit(1);
});
