import { or, sql } from "drizzle-orm";
import { http, type Address, createPublicClient } from "viem";
import { bsc } from "viem/chains";

import { createDatabase } from "../client.js";
import type { Database } from "../client.js";
import { agentLaunches } from "../schema/agent-launches.js";
import {
	type AgentWalletChain,
	type AgentWalletOwnerType,
	type AgentWalletRole,
	type NewAgentWalletRegistryRow,
	agentWalletRegistry,
} from "../schema/agent-wallet-registry.js";

const SOL_HOT_BSC_ADDRESS = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";
const DEFAULT_BSC_RPC_URL = "https://bsc-dataseed.binance.org";

const taxSplitterAbi = [
	{
		type: "function",
		name: "patron",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
	},
	{
		type: "function",
		name: "platform",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
	},
	{
		type: "function",
		name: "agent",
		stateMutability: "view",
		inputs: [],
		outputs: [{ name: "", type: "address" }],
	},
] as const;

type TaxSplitterReadClient = {
	readContract(args: {
		address: Address;
		abi: typeof taxSplitterAbi;
		functionName: "patron" | "platform" | "agent";
	}): Promise<Address>;
};

type TaxSplitterAddresses = {
	patron: string;
	platform: string;
	agent: string;
};

export type BackfillAgentWalletsOptions = {
	taxSplitterClient?: TaxSplitterReadClient;
	rpcUrl?: string;
};

type WalletCandidate = {
	agentTokenAddress: string;
	address: string;
	chain: AgentWalletChain;
	role: AgentWalletRole;
	venue?: string | null;
	label: string;
	ownerType?: AgentWalletOwnerType;
};

export type BackfillAgentWalletsResult = {
	launchesProcessed: number;
	candidates: number;
	inserted: number;
	skipped: number;
};

function normalizeEvmAddress(address: string): string {
	return address.toLowerCase();
}

function getBscRpcUrl(options: BackfillAgentWalletsOptions): string {
	return options.rpcUrl ?? process.env.BSC_RPC_URL ?? process.env.BNB_RPC_URL ?? DEFAULT_BSC_RPC_URL;
}

function createTaxSplitterClient(options: BackfillAgentWalletsOptions = {}): TaxSplitterReadClient {
	return createPublicClient({
		chain: bsc,
		transport: http(getBscRpcUrl(options)),
	});
}

async function readTaxSplitterAddresses(
	client: TaxSplitterReadClient,
	taxSplitterAddress: string,
): Promise<TaxSplitterAddresses> {
	const address = taxSplitterAddress as Address;
	const [patron, platform, agent] = await Promise.all([
		client.readContract({ address, abi: taxSplitterAbi, functionName: "patron" }),
		client.readContract({ address, abi: taxSplitterAbi, functionName: "platform" }),
		client.readContract({ address, abi: taxSplitterAbi, functionName: "agent" }),
	]);

	return { patron, platform, agent };
}

function metadataString(metadata: unknown, key: string): string | null {
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
	const value = (metadata as Record<string, unknown>)[key];
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function tickerForLabel(metadata: unknown, tokenAddress: string): string {
	return (
		metadataString(metadata, "ticker") ??
		metadataString(metadata, "symbol") ??
		metadataString(metadata, "name") ??
		`${tokenAddress.slice(0, 6)}…${tokenAddress.slice(-4)}`
	).toLowerCase();
}

function isWaifuLaunch(metadata: unknown): boolean {
	const candidates = [
		metadataString(metadata, "ticker"),
		metadataString(metadata, "symbol"),
		metadataString(metadata, "name"),
	]
		.filter((value): value is string => Boolean(value))
		.map((value) => value.toLowerCase());
	return candidates.some((value) => value === "waifu" || value === "$waifu" || value.includes("waifu"));
}

function buildWalletCandidates(launch: {
	tokenAddress: string;
	agentSafeAddress: string | null;
	creator: string;
	patronAddress: string;
	taxSplitterAddress: string | null;
	metadata: unknown;
}): WalletCandidate[] {
	const token = normalizeEvmAddress(launch.tokenAddress);
	const ticker = tickerForLabel(launch.metadata, launch.tokenAddress);
	const wallets: WalletCandidate[] = [];

	if (launch.agentSafeAddress) {
		wallets.push({
			agentTokenAddress: token,
			address: normalizeEvmAddress(launch.agentSafeAddress),
			chain: "bsc",
			role: "agent-safe",
			label: `agent-safe (${ticker})`,
		});
	}

	if (launch.patronAddress) {
		wallets.push({
			agentTokenAddress: token,
			address: normalizeEvmAddress(launch.patronAddress),
			chain: "bsc",
			role: "patron",
			label: `patron (${ticker})`,
			ownerType: "patron",
		});
	}

	if (launch.taxSplitterAddress) {
		wallets.push({
			agentTokenAddress: token,
			address: normalizeEvmAddress(launch.taxSplitterAddress),
			chain: "bsc",
			role: "venue-bridge",
			venue: "taxsplitter",
			label: `tax-splitter (${ticker})`,
		});
	}

	if (isWaifuLaunch(launch.metadata)) {
		wallets.push({
			agentTokenAddress: token,
			address: normalizeEvmAddress(SOL_HOT_BSC_ADDRESS),
			chain: "bsc",
			role: "agent-hot",
			label: "sol-hot-bsc",
		});
	}

	return wallets;
}

async function resolvePatronAddress(
	launch: { creator: string; taxSplitterAddress: string | null },
	taxSplitterClient: TaxSplitterReadClient,
): Promise<string> {
	if (!launch.taxSplitterAddress) return launch.creator;

	try {
		const addresses = await readTaxSplitterAddresses(taxSplitterClient, launch.taxSplitterAddress);
		return addresses.patron;
	} catch (error) {
		console.warn(
			`Failed to read TaxSplitter recipients for ${launch.taxSplitterAddress}; falling back to launch.creator as patron`,
			error,
		);
		return launch.creator;
	}
}

export async function backfillAgentWallets(
	db: Database,
	options: BackfillAgentWalletsOptions = {},
): Promise<BackfillAgentWalletsResult> {
	const launches = await db
		.select({
			tokenAddress: agentLaunches.tokenAddress,
			agentSafeAddress: agentLaunches.agentSafeAddress,
			creator: agentLaunches.creator,
			taxSplitterAddress: agentLaunches.taxSplitterAddress,
			metadata: agentLaunches.metadata,
		})
		.from(agentLaunches)
		.where(
			or(
				sql`${agentLaunches.agentSafeAddress} IS NOT NULL`,
				sql`${agentLaunches.creator} IS NOT NULL`,
				sql`${agentLaunches.taxSplitterAddress} IS NOT NULL`,
			),
		);

	let candidates = 0;
	let inserted = 0;
	const taxSplitterClient = options.taxSplitterClient ?? createTaxSplitterClient(options);

	for (const launch of launches) {
		const patronAddress = await resolvePatronAddress(launch, taxSplitterClient);
		for (const wallet of buildWalletCandidates({ ...launch, patronAddress })) {
			candidates += 1;
			const row: NewAgentWalletRegistryRow = {
				agentTokenAddress: wallet.agentTokenAddress,
				address: wallet.address,
				chain: wallet.chain,
				role: wallet.role,
				venue: wallet.venue ?? null,
				label: wallet.label,
				ownerType: wallet.ownerType ?? "agent",
			};
			const rows = await db
				.insert(agentWalletRegistry)
				.values(row)
				.onConflictDoNothing({
					target: [agentWalletRegistry.agentTokenAddress, agentWalletRegistry.address, agentWalletRegistry.chain],
				})
				.returning({ id: agentWalletRegistry.id });
			if (rows.length > 0) inserted += 1;
		}
	}

	return {
		launchesProcessed: launches.length,
		candidates,
		inserted,
		skipped: candidates - inserted,
	};
}

async function main() {
	const { client, db } = createDatabase();
	try {
		const result = await backfillAgentWallets(db);
		console.log(
			`${result.launchesProcessed} launches processed, ${result.inserted} agent wallets inserted, ${result.skipped} skipped (${result.candidates} candidates)`,
		);
	} finally {
		await client.end();
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error) => {
		console.error(error);
		process.exitCode = 1;
	});
}
