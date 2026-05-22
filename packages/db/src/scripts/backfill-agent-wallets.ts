import { or, sql } from "drizzle-orm";

import { createDatabase } from "../client.js";
import type { Database } from "../client.js";
import { agentLaunches } from "../schema/agent-launches.js";
import {
	agentWalletRegistry,
	type AgentWalletChain,
	type AgentWalletOwnerType,
	type AgentWalletRole,
	type NewAgentWalletRegistryRow,
} from "../schema/agent-wallet-registry.js";

const SOL_HOT_BSC_ADDRESS = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";

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
	const candidates = [metadataString(metadata, "ticker"), metadataString(metadata, "symbol"), metadataString(metadata, "name")]
		.filter((value): value is string => Boolean(value))
		.map((value) => value.toLowerCase());
	return candidates.some((value) => value === "waifu" || value === "$waifu" || value.includes("waifu"));
}

function buildWalletCandidates(launch: {
	tokenAddress: string;
	agentSafeAddress: string | null;
	creator: string;
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

	if (launch.creator) {
		wallets.push({
			agentTokenAddress: token,
			address: normalizeEvmAddress(launch.creator),
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

export async function backfillAgentWallets(db: Database): Promise<BackfillAgentWalletsResult> {
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

	for (const launch of launches) {
		for (const wallet of buildWalletCandidates(launch)) {
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
