import { type AgentLaunchRow, schema } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";
import { eq } from "drizzle-orm";
import {
	http,
	type Address,
	type Hex,
	createPublicClient,
	createWalletClient,
	encodeFunctionData,
	parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc, bscTestnet } from "viem/chains";

import { decryptBundleWalletPk, markUsed, releaseWallet, selectAvailableWallet } from "./bundle-wallet-pool.js";

export const PUISSANT_RPC_URL = "https://puissant-bsc.48.club";
export const BUNDLE_TIP_STEPS_BNB = ["0.03", "0.05", "0.08"] as const;

export const bundleRouterAbi = [
	{
		type: "function",
		name: "executeBundle",
		stateMutability: "payable",
		inputs: [],
		outputs: [],
	},
] as const;

export interface BundleSubmitterConfig {
	chainId?: number;
	rpcUrl?: string;
	privateRpcUrl?: string;
	bundleBotPrivateKey?: Hex;
	useWalletPool?: boolean;
	allowSingleWalletFallback?: boolean;
	dryRun?: boolean;
}

export interface SubmitBundleResult {
	status: AgentLaunchRow["bundleStatus"];
	txHash?: Hex;
	attempt: number;
	reason?: string;
}

export class BundleSubmitterError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "BundleSubmitterError";
		this.code = code;
	}
}

function getRpcUrl(chainId: number): string {
	if (process.env.ALCHEMY_BSC_URL) return process.env.ALCHEMY_BSC_URL;
	if (process.env.ALCHEMY_BSC_KEY) return `https://bnb-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_BSC_KEY}`;
	return chainId === 97 ? "https://data-seed-prebsc-1-s1.binance.org:8545" : "https://bsc-dataseed.binance.org";
}

export function nextBundleTipBnb(attempt: number, current?: string | null): string {
	const stepped = BUNDLE_TIP_STEPS_BNB[Math.min(attempt, BUNDLE_TIP_STEPS_BNB.length - 1)] ?? BUNDLE_TIP_STEPS_BNB[0];
	if (!current) return stepped;
	return Number(current) > Number(stepped) ? current : stepped;
}

export async function submitLaunchBundle(
	db: Database,
	launch: AgentLaunchRow,
	config: BundleSubmitterConfig = {},
): Promise<SubmitBundleResult> {
	if (!launch.predictedTokenAddress || !launch.vanitySalt || !launch.flapMetaCid) {
		throw new BundleSubmitterError(
			"BUNDLE_NOT_READY",
			"launch is missing predicted token, vanity salt, or Flap metadata CID",
		);
	}
	if (
		launch.bundleStatus === "submitted" ||
		launch.bundleStatus === "confirmed" ||
		launch.bundleStatus === "refunded"
	) {
		return launch.bundleTxHash
			? { status: launch.bundleStatus, txHash: launch.bundleTxHash as Hex, attempt: launch.bundleAttempt }
			: { status: launch.bundleStatus, attempt: launch.bundleAttempt };
	}

	const attempt = launch.bundleAttempt + 1;
	const tipBnb = nextBundleTipBnb(launch.bundleAttempt, launch.bundleTipBnb);
	const chainId = config.chainId ?? Number(process.env.BSC_CHAIN_ID ?? 56);
	const chain = chainId === 97 ? bscTestnet : bsc;
	let selectedPoolWallet: Awaited<ReturnType<typeof selectAvailableWallet>> = null;
	let pk = config.bundleBotPrivateKey ?? (process.env.BUNDLE_BOT_PK as Hex | undefined);
	const useWalletPool = config.useWalletPool ?? process.env.BUNDLE_WALLET_POOL_DISABLED !== "true";
	if (useWalletPool && !config.bundleBotPrivateKey) {
		selectedPoolWallet = await selectAvailableWallet(db);
		if (selectedPoolWallet) {
			try {
				pk = decryptBundleWalletPk(selectedPoolWallet.encryptedPk);
			} catch (error) {
				await releaseWallet(db, selectedPoolWallet.address);
				throw error;
			}
		}
	}
	const allowFallback = config.allowSingleWalletFallback ?? process.env.BUNDLE_WALLET_POOL_REQUIRED !== "true";
	if (!selectedPoolWallet && !config.dryRun && useWalletPool && !allowFallback) {
		const retryAt = new Date(Date.now() + 90_000);
		await db
			.update(schema.agentLaunches)
			.set({
				bundleStatus: "pending",
				bundleFailureReason: `bundle wallet pool exhausted; retry after ${retryAt.toISOString()}`,
				updatedAt: new Date(),
			})
			.where(eq(schema.agentLaunches.id, launch.id));
		return { status: "pending", attempt: launch.bundleAttempt, reason: "bundle_wallet_pool_exhausted" };
	}
	if (!selectedPoolWallet && !pk && !config.dryRun) {
		throw new BundleSubmitterError(
			"NO_BUNDLE_BOT_PK",
			"bundle wallet pool is exhausted and BUNDLE_BOT_PK fallback is not set",
		);
	}

	const publicClient = createPublicClient({ chain, transport: http(config.rpcUrl ?? getRpcUrl(chainId)) });
	const data = encodeFunctionData({ abi: bundleRouterAbi, functionName: "executeBundle" });

	let privateTxAccepted = false;
	try {
		let txHash: Hex = "0x0000000000000000000000000000000000000000000000000000000000000000";
		if (!config.dryRun) {
			const account = privateKeyToAccount(pk as Hex);
			const walletClient = createWalletClient({ account, chain, transport: http(config.rpcUrl ?? getRpcUrl(chainId)) });
			const [nonce, gasPrice] = await Promise.all([
				publicClient.getTransactionCount({ address: account.address, blockTag: "pending" }),
				publicClient.getGasPrice(),
			]);
			const gas = await publicClient.estimateGas({
				account: account.address,
				to: launch.routerAddress as Address,
				data,
				value: 0n,
			});
			const rawTx = await walletClient.signTransaction({
				account,
				chain,
				to: launch.routerAddress as Address,
				data,
				value: 0n,
				gas,
				gasPrice,
				nonce,
			});
			const privateRpc = config.privateRpcUrl ?? process.env.PUISSANT_BSC_URL ?? PUISSANT_RPC_URL;
			const response = await fetch(privateRpc, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_sendPrivateTransaction", params: [rawTx] }),
			});
			const json = (await response.json()) as { result?: Hex; error?: { message?: string } };
			if (!response.ok || json.error || !json.result) {
				throw new Error(json.error?.message ?? `Puissant returned HTTP ${response.status}`);
			}
			txHash = json.result;
			privateTxAccepted = true;
		}

		const submittedAt = new Date();
		await db
			.update(schema.agentLaunches)
			.set({
				bundleStatus: "submitted",
				bundleAttempt: attempt,
				bundleTipBnb: tipBnb,
				bundleTxHash: txHash,
				bundleFailureReason: null,
				updatedAt: submittedAt,
			})
			.where(eq(schema.agentLaunches.id, launch.id));
		if (selectedPoolWallet) await markUsed(db, selectedPoolWallet.address, submittedAt);

		return { status: "submitted", txHash, attempt };
	} catch (error) {
		if (selectedPoolWallet && !privateTxAccepted) await releaseWallet(db, selectedPoolWallet.address);
		const terminal = attempt >= 3;
		const reason = error instanceof Error ? error.message : String(error);
		const status = terminal ? "failed_terminal" : "failed_retry";
		await db
			.update(schema.agentLaunches)
			.set({
				bundleStatus: status,
				bundleAttempt: attempt,
				bundleTipBnb: tipBnb,
				bundleFailureReason: reason,
				updatedAt: new Date(),
			})
			.where(eq(schema.agentLaunches.id, launch.id));
		return { status, attempt, reason };
	}
}

export async function markBundleReceipt(
	db: Database,
	launch: AgentLaunchRow,
	receipt: { status: "success" | "reverted" },
): Promise<AgentLaunchRow["bundleStatus"]> {
	const status =
		receipt.status === "success" ? "confirmed" : launch.bundleAttempt >= 3 ? "failed_terminal" : "failed_retry";
	await db
		.update(schema.agentLaunches)
		.set({ bundleStatus: status, updatedAt: new Date() })
		.where(eq(schema.agentLaunches.id, launch.id));
	return status;
}

export const __testing = { parseEther };
