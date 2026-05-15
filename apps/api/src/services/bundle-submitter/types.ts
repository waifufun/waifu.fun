import type { BundleStatus } from "@waifufun/db";

export interface SubmitBundleInput {
	rawTx: string;
	deadline: number;
	fallbackPublic?: boolean | undefined;
	chainId?: number | undefined;
	metadata?: Record<string, unknown> | undefined;
}

export interface SubmitBundleResult {
	bundleHash: string;
	txHash: string | null;
	status: BundleStatus;
	submittedAt: string;
}

export interface BundleStatusResult {
	bundleHash: string;
	txHash: string | null;
	blockNumber: string | null;
	status: BundleStatus;
	path: string;
	submittedAt: string;
	includedAt: string | null;
	expiredAt: string | null;
	fallbackAt: string | null;
	fallbackTxHash: string | null;
	lastError: string | null;
}

export interface InclusionWatcher {
	/** Resolves with block number when tx is included, or null when timed out. */
	waitForInclusion(txHash: string, options: { maxBlocks: number; pollMs: number }): Promise<string | null>;
}

export interface PublicMempoolFallback {
	sendRawTransaction(rawTx: string): Promise<string>;
}
