/**
 * Read + write helpers for a single TreasuryLP4 contract.
 *
 * Pulled out so the loop can be unit-tested with a stubbed `OnchainClient`
 * and so the loop file stays focused on orchestration.
 */

import type { Account, Address, Chain, PublicClient, Transport, WalletClient } from "viem";

import { TIER_COUNT, TWAP_WINDOW_SECONDS, treasuryLp4Abi } from "./abi.js";

export interface TierState {
	idx: number;
	epochsAbove: number;
	minEpochs: number;
	lastEpochTimestamp: number;
	paused: boolean;
	deployed: boolean;
}

export interface ContractState {
	nextTierIndex: number;
	epochLength: number;
	oracleSnapshotTimestamp: number;
	activeTier: TierState | null;
}

export interface OnchainClient {
	readState(treasury: Address): Promise<ContractState>;
	simulateOraclePoke(treasury: Address): Promise<void>;
	simulateCheckAndAdvance(treasury: Address): Promise<void>;
	sendOraclePoke(treasury: Address): Promise<`0x${string}`>;
	sendCheckAndAdvance(treasury: Address): Promise<`0x${string}`>;
	waitForReceipt(hash: `0x${string}`, timeoutMs: number): Promise<{ status: "success" | "reverted" }>;
}

export class ViemOnchainClient implements OnchainClient {
	constructor(
		private readonly publicClient: PublicClient<Transport, Chain>,
		private readonly walletClient: WalletClient<Transport, Chain, Account> | undefined,
		private readonly signerAddress: Address | undefined,
	) {}

	async readState(treasury: Address): Promise<ContractState> {
		const [nextTierIndexRaw, epochLengthRaw, snapshot] = await Promise.all([
			this.publicClient.readContract({
				address: treasury,
				abi: treasuryLp4Abi,
				functionName: "nextTierIndex",
			}),
			this.publicClient.readContract({
				address: treasury,
				abi: treasuryLp4Abi,
				functionName: "epochLength",
			}),
			this.publicClient.readContract({
				address: treasury,
				abi: treasuryLp4Abi,
				functionName: "oracleSnapshot",
			}),
		]);

		const nextTierIndex = Number(nextTierIndexRaw);
		const epochLength = Number(epochLengthRaw);
		const oracleSnapshotTimestamp = Number(snapshot[1]);

		let activeTier: TierState | null = null;
		if (nextTierIndex < TIER_COUNT) {
			const tier = await this.publicClient.readContract({
				address: treasury,
				abi: treasuryLp4Abi,
				functionName: "tiers",
				args: [BigInt(nextTierIndex)],
			});
			// tuple: [targetMcUSD, tokenAmount, tickLower, tickUpper, minEpochs,
			//         epochsAbove, lastEpochTimestamp, deployed, paused, positionId]
			activeTier = {
				idx: nextTierIndex,
				minEpochs: Number(tier[4]),
				epochsAbove: Number(tier[5]),
				lastEpochTimestamp: Number(tier[6]),
				deployed: Boolean(tier[7]),
				paused: Boolean(tier[8]),
			};
		}

		return { nextTierIndex, epochLength, oracleSnapshotTimestamp, activeTier };
	}

	async simulateOraclePoke(treasury: Address): Promise<void> {
		await this.publicClient.simulateContract({
			address: treasury,
			abi: treasuryLp4Abi,
			functionName: "oraclePoke",
			account: this.signerAddress,
		});
	}

	async simulateCheckAndAdvance(treasury: Address): Promise<void> {
		await this.publicClient.simulateContract({
			address: treasury,
			abi: treasuryLp4Abi,
			functionName: "checkAndAdvance",
			account: this.signerAddress,
		});
	}

	async sendOraclePoke(treasury: Address): Promise<`0x${string}`> {
		this.requireWallet();
		return this.walletClient!.writeContract({
			address: treasury,
			abi: treasuryLp4Abi,
			functionName: "oraclePoke",
			account: this.walletClient!.account,
			chain: this.walletClient!.chain,
		});
	}

	async sendCheckAndAdvance(treasury: Address): Promise<`0x${string}`> {
		this.requireWallet();
		return this.walletClient!.writeContract({
			address: treasury,
			abi: treasuryLp4Abi,
			functionName: "checkAndAdvance",
			account: this.walletClient!.account,
			chain: this.walletClient!.chain,
		});
	}

	async waitForReceipt(hash: `0x${string}`, timeoutMs: number): Promise<{ status: "success" | "reverted" }> {
		const receipt = await this.publicClient.waitForTransactionReceipt({
			hash,
			timeout: timeoutMs,
		});
		return { status: receipt.status };
	}

	private requireWallet(): void {
		if (!this.walletClient || !this.signerAddress) {
			throw new Error("tier cron has no signer configured (set TIER_CRON_SIGNER_PK)");
		}
	}
}

/**
 * Pure helper: given the on-chain snapshot and a "now" timestamp, decide
 * whether `oraclePoke()` will succeed (i.e. enough seconds have elapsed
 * since the last snapshot to satisfy `TWAP_WINDOW`).
 *
 * Note: the contract treats `blockTimestampLast == 0` as "first poke" and
 * skips the TWAP gate, so we do too.
 */
export function isPokeReady(state: ContractState, nowSeconds: number): boolean {
	if (state.oracleSnapshotTimestamp === 0) return true;
	return nowSeconds - state.oracleSnapshotTimestamp >= TWAP_WINDOW_SECONDS;
}

/**
 * Pure helper: would `checkAndAdvance` revert because the active tier's
 * epoch hasn't elapsed yet? We use this to skip wasted simulate/send calls.
 */
export function isAdvanceReady(state: ContractState, nowSeconds: number): boolean {
	if (state.nextTierIndex >= TIER_COUNT) return false;
	const tier = state.activeTier;
	if (!tier) return false;
	if (tier.paused) return false;
	return nowSeconds >= tier.lastEpochTimestamp + state.epochLength;
}
