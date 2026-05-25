import { schema } from "@waifufun/db";
import { inArray } from "drizzle-orm";
import { http, createPublicClient, formatUnits, parseAbiItem } from "viem";
import { arbitrum, bsc } from "viem/chains";

import { renderEventData } from "@waifufun/db";
import type { IndexerRuntime } from "../lib/runtime.js";

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const NATIVE_SENTINEL = "0x0000000000000000000000000000000000000000" as const;

const CHAIN_CONFIG = {
	bsc: {
		chainId: 56,
		chain: bsc,
		rpcEnv: "BSC_RPC_URL",
		cursorPrefix: "wallet-transfer:bsc",
		source: "evm-indexer:bsc",
	},
	arb: {
		chainId: 42161,
		chain: arbitrum,
		rpcEnv: "ARBITRUM_RPC_URL",
		cursorPrefix: "wallet-transfer:arb",
		source: "evm-indexer:arb",
	},
} as const;

type SupportedChain = keyof typeof CHAIN_CONFIG;

type RegisteredWallet = {
	agentTokenAddress: string;
	address: string;
	chain: SupportedChain;
	role: string;
	label: string;
};

export interface AgentWalletTransferStreamOptions {
	pollIntervalMs?: number;
	maxBlocksPerPoll?: bigint;
	startBlock?: bigint;
	runOnce?: boolean;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value: string): string {
	return value.toLowerCase();
}

async function loadWallets(runtime: IndexerRuntime): Promise<RegisteredWallet[]> {
	const rows = await runtime.db
		.select({
			agentTokenAddress: schema.agentWalletRegistry.agentTokenAddress,
			address: schema.agentWalletRegistry.address,
			chain: schema.agentWalletRegistry.chain,
			role: schema.agentWalletRegistry.role,
			label: schema.agentWalletRegistry.label,
		})
		.from(schema.agentWalletRegistry)
		.where(inArray(schema.agentWalletRegistry.chain, ["bsc", "arb"]));
	return rows.map((row) => ({
		...row,
		address: normalize(row.address),
		agentTokenAddress: normalize(row.agentTokenAddress),
	})) as RegisteredWallet[];
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

	const client = createPublicClient({
		chain: cfg.chain,
		transport: http(process.env[cfg.rpcEnv] ?? cfg.chain.rpcUrls.default.http[0]),
	});
	const latestBlock = await client.getBlockNumber();
	const startBlock = options.startBlock === 0n ? 0n : options.startBlock - 1n;
	const cursorId = `${cfg.cursorPrefix}:erc20`;
	const cursor = await runtime.cursors.ensure({
		id: cursorId,
		mode: "live",
		initialBlock: startBlock,
		contractAddress: NATIVE_SENTINEL,
	});
	const fromBlock = cursor.lastBlock + 1n;
	if (fromBlock > latestBlock) return;
	const toBlock =
		fromBlock + options.maxBlocksPerPoll - 1n > latestBlock ? latestBlock : fromBlock + options.maxBlocksPerPoll - 1n;

	const byAddress = new Map<string, RegisteredWallet[]>();
	for (const wallet of chainWallets) {
		const existing = byAddress.get(wallet.address) ?? [];
		existing.push(wallet);
		byAddress.set(wallet.address, existing);
	}

	const logs = await client.getLogs({ event: transferEvent, fromBlock, toBlock });
	for (const log of logs) {
		const from = normalize(String(log.args.from));
		const to = normalize(String(log.args.to));
		const touched = [...(byAddress.get(from) ?? []), ...(byAddress.get(to) ?? [])];
		for (const wallet of touched) {
			const direction = wallet.address === to ? "in" : "out";
			const eventType = direction === "in" ? "transfer.in" : "transfer.out";
			const amountFormatted = formatUnits(log.args.value ?? 0n, 18);
			const payload = {
				chain,
				chainId: String(cfg.chainId),
				from,
				to,
				wallet: wallet.address,
				walletRole: wallet.role,
				walletLabel: wallet.label,
				tokenAddress: normalize(log.address),
				amountRaw: (log.args.value ?? 0n).toString(),
				amount: Number(amountFormatted),
				amountFormatted,
				txHash: log.transactionHash,
				blockNumber: log.blockNumber.toString(),
				logIndex: log.logIndex,
			};
			await runtime.db
				.insert(schema.agentEvents)
				.values({
					agentId: null,
					tokenAddress: wallet.agentTokenAddress,
					eventType,
					data: renderEventData(eventType, payload),
					source: cfg.source,
					sourceEventId: `${chain}:${log.transactionHash}:${log.logIndex}:${wallet.address}`,
					type: eventType,
					payload,
					status: "done",
					chainId: String(cfg.chainId),
					txHash: log.transactionHash,
					blockNumber: log.blockNumber.toString(),
					occurredAt: new Date(),
					processedAt: new Date(),
				})
				.onConflictDoNothing({ target: [schema.agentEvents.source, schema.agentEvents.sourceEventId] });
		}
		await runtime.cursors.advance(cursorId, { blockNumber: log.blockNumber, logIndex: log.logIndex });
	}

	await runtime.cursors.advance(cursorId, { blockNumber: toBlock, logIndex: 0 });
	runtime.logger.info(
		{ chain, cursorId, eventCount: logs.length, fromBlock: fromBlock.toString(), toBlock: toBlock.toString() },
		"agent wallet transfer poll finished",
	);
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
		startBlock: options.startBlock ?? runtime.config.startBlock,
		runOnce: options.runOnce ?? process.env.INDEXER_RUN_ONCE === "1",
	};
	const tick = async () => {
		const wallets = await loadWallets(runtime);
		await pollChainOnce(runtime, "bsc", wallets, resolved);
		await pollChainOnce(runtime, "arb", wallets, resolved);
	};
	await tick();
	if (resolved.runOnce) return () => undefined;
	let stopped = false;
	void (async () => {
		while (!stopped) {
			await delay(resolved.pollIntervalMs);
			if (!stopped) await tick().catch((error) => runtime.logger.error({ error }, "agent wallet transfer poll failed"));
		}
	})();
	return () => {
		stopped = true;
	};
}
