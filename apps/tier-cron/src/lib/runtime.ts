/**
 * Runtime wiring for the W45 tier cron service.
 *
 * Responsibilities:
 *   - Build the typed config from env (chain id, RPC, signer pk, intervals).
 *   - Build a viem `PublicClient` for read calls + a `WalletClient` for
 *     `oraclePoke()` / `checkAndAdvance()` writes.
 *   - Expose a `LaunchRepo` facade so the loop can list candidate
 *     TreasuryLP4 addresses without depending on drizzle directly. Tests
 *     swap this out for an in-memory implementation.
 */

import { type Database, getDatabase, schema } from "@waifufun/db";
import type { Logger } from "@waifufun/logger";
import { and, eq, inArray, isNotNull, lt, lte } from "drizzle-orm";
import {
	http,
	type Account,
	type Address,
	type Chain,
	type Hex,
	type PublicClient,
	type Transport,
	type WalletClient,
	createPublicClient,
	createWalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";

import { logger } from "./logger.js";

export interface TierCronConfig {
	chainId: number;
	rpcUrl: string;
	signerPrivateKey: Hex | undefined;
	pollIntervalMs: number;
	perTxTimeoutMs: number;
	maxConcurrency: number;
	dryRun: boolean;
}

export interface LaunchCandidate {
	id: string;
	tokenAddress: Address;
	treasuryLpAddress: Address;
}

export interface BundleCandidate {
	id: string;
	routerAddress: Address;
	predictedTokenAddress: Address | null;
	vanitySalt: string | null;
	flapMetaCid: string | null;
	bundleStatus: string;
	bundleAttempt: number;
	bundleTipBnb: string;
}

export interface LaunchRepo {
	listLaunchedWithTreasury(): Promise<LaunchCandidate[]>;
	listBundlePendingReady?(nowSeconds: bigint): Promise<BundleCandidate[]>;
	markBundleSubmitted?(launchId: string, txHash: string, attempt: number, tipBnb: string): Promise<void>;
}

export interface TierCronRuntime {
	logger: Logger;
	config: TierCronConfig;
	publicClient: PublicClient<Transport, Chain>;
	walletClient: WalletClient<Transport, Chain, Account> | undefined;
	signerAddress: Address | undefined;
	repo: LaunchRepo;
}

export function getBscChain(chainId: number): Chain {
	return chainId === 97 ? bscTestnet : bsc;
}

export function createTierCronConfig(): TierCronConfig {
	const chainId = Number(process.env.BSC_CHAIN_ID ?? 56);
	const chain = getBscChain(chainId);
	const alchemyKey = process.env.ALCHEMY_BSC_KEY;
	const defaultRpc =
		alchemyKey != null && alchemyKey !== ""
			? chainId === 97
				? `https://bnb-testnet.g.alchemy.com/v2/${alchemyKey}`
				: `https://bnb-mainnet.g.alchemy.com/v2/${alchemyKey}`
			: chain.rpcUrls.default.http[0]!;
	const rpcUrl = process.env.BSC_RPC_URL ?? defaultRpc;

	const rawPk = process.env.TIER_CRON_SIGNER_PK;
	const signerPrivateKey = normalizePrivateKey(rawPk);

	return {
		chainId,
		rpcUrl,
		signerPrivateKey,
		pollIntervalMs: Number(process.env.TIER_CRON_POLL_INTERVAL_MS ?? 5 * 60 * 1_000),
		perTxTimeoutMs: Number(process.env.TIER_CRON_TX_TIMEOUT_MS ?? 60_000),
		maxConcurrency: Math.max(1, Number(process.env.TIER_CRON_MAX_CONCURRENCY ?? 4)),
		dryRun: process.env.TIER_CRON_DRY_RUN === "1",
	};
}

function normalizePrivateKey(value: string | undefined): Hex | undefined {
	if (value == null || value === "") return undefined;
	const trimmed = value.trim();
	const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
	if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
		throw new Error("TIER_CRON_SIGNER_PK must be a 32-byte hex string");
	}
	return withPrefix as Hex;
}

export class DrizzleLaunchRepo implements LaunchRepo {
	constructor(private readonly db: Database) {}

	async listLaunchedWithTreasury(): Promise<LaunchCandidate[]> {
		const rows = await this.db
			.select({
				id: schema.agentLaunches.id,
				tokenAddress: schema.agentLaunches.tokenAddress,
				treasuryLpAddress: schema.agentLaunches.treasuryLpAddress,
			})
			.from(schema.agentLaunches)
			.where(and(eq(schema.agentLaunches.state, "launched"), isNotNull(schema.agentLaunches.treasuryLpAddress)));

		const candidates: LaunchCandidate[] = [];
		for (const row of rows) {
			if (row.treasuryLpAddress == null) continue;
			candidates.push({
				id: row.id,
				tokenAddress: row.tokenAddress as Address,
				treasuryLpAddress: row.treasuryLpAddress as Address,
			});
		}
		return candidates;
	}

	async listBundlePendingReady(nowSeconds: bigint): Promise<BundleCandidate[]> {
		const rows = await this.db
			.select({
				id: schema.agentLaunches.id,
				routerAddress: schema.agentLaunches.routerAddress,
				predictedTokenAddress: schema.agentLaunches.predictedTokenAddress,
				vanitySalt: schema.agentLaunches.vanitySalt,
				flapMetaCid: schema.agentLaunches.flapMetaCid,
				bundleStatus: schema.agentLaunches.bundleStatus,
				bundleAttempt: schema.agentLaunches.bundleAttempt,
				bundleTipBnb: schema.agentLaunches.bundleTipBnb,
			})
			.from(schema.agentLaunches)
			.where(
				and(
					inArray(schema.agentLaunches.bundleStatus, ["pending", "failed_retry"]),
					lt(schema.agentLaunches.bundleAttempt, 3),
					lte(schema.agentLaunches.closeTimestamp, nowSeconds),
				),
			);
		return rows.map((row) => ({
			...row,
			routerAddress: row.routerAddress as Address,
			predictedTokenAddress: row.predictedTokenAddress as Address | null,
		}));
	}

	async markBundleSubmitted(launchId: string, txHash: string, attempt: number, tipBnb: string): Promise<void> {
		await this.db
			.update(schema.agentLaunches)
			.set({
				bundleStatus: "submitted",
				bundleTxHash: txHash,
				bundleAttempt: attempt,
				bundleTipBnb: tipBnb,
				updatedAt: new Date(),
			})
			.where(eq(schema.agentLaunches.id, launchId));
	}
}

export function createTierCronRuntime(): TierCronRuntime {
	const config = createTierCronConfig();
	const chain = getBscChain(config.chainId);
	const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl) }) as PublicClient<Transport, Chain>;

	let walletClient: WalletClient<Transport, Chain, Account> | undefined;
	let signerAddress: Address | undefined;
	if (config.signerPrivateKey) {
		const account = privateKeyToAccount(config.signerPrivateKey);
		walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl) });
		signerAddress = account.address;
	}

	const { db } = getDatabase();
	return {
		logger,
		config,
		publicClient,
		walletClient,
		signerAddress,
		repo: new DrizzleLaunchRepo(db),
	};
}
