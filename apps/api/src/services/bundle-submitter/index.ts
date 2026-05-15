import { eq, sql } from "drizzle-orm";
import { type Hex, keccak256 } from "viem";

import { type BundleStatus, type NewBundleSubmissionRow, bundleSubmissions, type getDatabase } from "@waifufun/db";

import { type PuissantClient, PuissantRpcError, createPuissantClient } from "./puissant-client.js";
import type {
	BundleStatusResult,
	InclusionWatcher,
	PublicMempoolFallback,
	SubmitBundleInput,
	SubmitBundleResult,
} from "./types.js";

type Db = ReturnType<typeof getDatabase>["db"];

export interface BundleSubmitterDeps {
	db: Db;
	puissant: PuissantClient;
	watcher: InclusionWatcher;
	publicFallback?: PublicMempoolFallback | undefined;
	now: () => Date;
	maxBlocks: number;
	pollMs: number;
	chainId: number;
	logger?: Pick<Console, "info" | "warn" | "error"> | undefined;
}

export const DEFAULT_MAX_BLOCKS = 5;
export const DEFAULT_POLL_MS = 3_000;

/** Derives the canonical tx hash from a signed raw transaction. */
export function deriveTxHash(rawTx: string): string {
	if (!rawTx.startsWith("0x")) {
		throw new Error("rawTx must be 0x-prefixed");
	}
	return keccak256(rawTx as Hex);
}

export async function submitBundle(deps: BundleSubmitterDeps, input: SubmitBundleInput): Promise<SubmitBundleResult> {
	const rawTx = input.rawTx;
	if (!rawTx || !rawTx.startsWith("0x") || rawTx.length < 4) {
		throw new Error("rawTx must be a 0x-prefixed hex string");
	}
	if (!Number.isFinite(input.deadline) || input.deadline <= 0) {
		throw new Error("deadline must be a positive unix-seconds timestamp");
	}

	const bundleHash = deriveTxHash(rawTx);
	const submittedAt = deps.now();
	const deadline = new Date(input.deadline * 1000);
	const fallbackEnabled = input.fallbackPublic !== false;

	// Insert ledger row up front so analytics see every attempt.
	const insert: NewBundleSubmissionRow = {
		bundleHash,
		txHash: bundleHash,
		rawTx,
		chainId: input.chainId ?? deps.chainId,
		status: "submitted",
		path: "puissant",
		deadline,
		submittedAt,
		updatedAt: submittedAt,
		metadata: input.metadata ?? {},
	};
	await deps.db
		.insert(bundleSubmissions)
		.values(insert)
		.onConflictDoUpdate({
			target: bundleSubmissions.bundleHash,
			set: {
				attempts: sql`${bundleSubmissions.attempts} + 1`,
				updatedAt: submittedAt,
			},
		});

	// 1. Submit to Puissant.
	let puissantError: string | null = null;
	try {
		await deps.puissant.sendPrivateRawTransaction(rawTx);
		deps.logger?.info?.("[bundles] submitted to puissant", { bundleHash });
	} catch (err) {
		puissantError = err instanceof Error ? err.message : String(err);
		deps.logger?.warn?.("[bundles] puissant submit failed", {
			bundleHash,
			err: puissantError,
			rpcCode: err instanceof PuissantRpcError ? err.code : undefined,
		});
		await markFailure(deps.db, bundleHash, puissantError, submittedAt);
	}

	// 2. Poll for inclusion (only if puissant accepted the bundle).
	if (puissantError == null) {
		const blockNumber = await deps.watcher.waitForInclusion(bundleHash, {
			maxBlocks: deps.maxBlocks,
			pollMs: deps.pollMs,
		});

		if (blockNumber) {
			const includedAt = deps.now();
			await deps.db
				.update(bundleSubmissions)
				.set({
					status: "included",
					blockNumber,
					includedAt,
					updatedAt: includedAt,
				})
				.where(eq(bundleSubmissions.bundleHash, bundleHash));
			return {
				bundleHash,
				txHash: bundleHash,
				status: "included",
				submittedAt: submittedAt.toISOString(),
			};
		}
	}

	// 3. Fallback to public mempool if enabled and we still have time.
	if (fallbackEnabled && deps.publicFallback && deps.now() < deadline) {
		try {
			const fallbackHash = await deps.publicFallback.sendRawTransaction(rawTx);
			const fallbackAt = deps.now();
			await deps.db
				.update(bundleSubmissions)
				.set({
					status: "fell_back",
					path: puissantError ? "public" : "puissant+public",
					fallbackTxHash: fallbackHash,
					fallbackAt,
					updatedAt: fallbackAt,
				})
				.where(eq(bundleSubmissions.bundleHash, bundleHash));

			// Best-effort: poll one more cycle for inclusion via fallback path.
			const blockNumber = await deps.watcher.waitForInclusion(fallbackHash, {
				maxBlocks: deps.maxBlocks,
				pollMs: deps.pollMs,
			});
			if (blockNumber) {
				const includedAt = deps.now();
				await deps.db
					.update(bundleSubmissions)
					.set({
						status: "included",
						txHash: fallbackHash,
						blockNumber,
						includedAt,
						updatedAt: includedAt,
					})
					.where(eq(bundleSubmissions.bundleHash, bundleHash));
				return {
					bundleHash,
					txHash: fallbackHash,
					status: "included",
					submittedAt: submittedAt.toISOString(),
				};
			}

			return {
				bundleHash,
				txHash: fallbackHash,
				status: "fell_back",
				submittedAt: submittedAt.toISOString(),
			};
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			await markFailure(deps.db, bundleHash, detail, deps.now());
			return {
				bundleHash,
				txHash: null,
				status: "failed",
				submittedAt: submittedAt.toISOString(),
			};
		}
	}

	// 4. Expired without inclusion.
	const expiredAt = deps.now();
	await deps.db
		.update(bundleSubmissions)
		.set({
			status: puissantError ? "failed" : "expired",
			expiredAt,
			updatedAt: expiredAt,
			lastError: puissantError,
		})
		.where(eq(bundleSubmissions.bundleHash, bundleHash));

	return {
		bundleHash,
		txHash: puissantError ? null : bundleHash,
		status: puissantError ? "failed" : "expired",
		submittedAt: submittedAt.toISOString(),
	};
}

async function markFailure(db: Db, bundleHash: string, error: string, at: Date): Promise<void> {
	await db
		.update(bundleSubmissions)
		.set({ lastError: error, updatedAt: at })
		.where(eq(bundleSubmissions.bundleHash, bundleHash));
}

export async function getBundle(db: Db, bundleHash: string): Promise<BundleStatusResult | null> {
	const [row] = await db.select().from(bundleSubmissions).where(eq(bundleSubmissions.bundleHash, bundleHash)).limit(1);
	if (!row) return null;
	return {
		bundleHash: row.bundleHash,
		txHash: row.txHash,
		blockNumber: row.blockNumber,
		status: row.status as BundleStatus,
		path: row.path,
		submittedAt: row.submittedAt.toISOString(),
		includedAt: row.includedAt?.toISOString() ?? null,
		expiredAt: row.expiredAt?.toISOString() ?? null,
		fallbackAt: row.fallbackAt?.toISOString() ?? null,
		fallbackTxHash: row.fallbackTxHash,
		lastError: row.lastError,
	};
}

export interface CreateDefaultDepsOptions {
	db: Db;
	chainId?: number | undefined;
	now?: (() => Date) | undefined;
	maxBlocks?: number | undefined;
	pollMs?: number | undefined;
	logger?: Pick<Console, "info" | "warn" | "error"> | undefined;
}

/** Builds production-grade deps using viem against `BSC_RPC_URL` for inclusion polling. */
export async function createDefaultDeps(options: CreateDefaultDepsOptions): Promise<BundleSubmitterDeps> {
	const { http, createPublicClient } = await import("viem");
	const { bsc } = await import("viem/chains");

	const rpcUrl = process.env.BSC_RPC_URL ?? process.env.RPC_URL;
	if (!rpcUrl) {
		throw new Error("BSC_RPC_URL or RPC_URL is required for bundle submitter");
	}

	const publicClient = createPublicClient({ chain: bsc, transport: http(rpcUrl) });

	const watcher: InclusionWatcher = {
		async waitForInclusion(txHash, { maxBlocks, pollMs }) {
			const start = await publicClient.getBlockNumber();
			for (let i = 0; i <= maxBlocks; i++) {
				try {
					const receipt = await publicClient.getTransactionReceipt({ hash: txHash as Hex });
					if (receipt && receipt.status === "success") {
						return receipt.blockNumber.toString();
					}
				} catch {
					// not yet mined
				}
				const current = await publicClient.getBlockNumber();
				if (current - start > BigInt(maxBlocks)) break;
				await new Promise((r) => setTimeout(r, pollMs));
			}
			return null;
		},
	};

	const publicFallback: PublicMempoolFallback = {
		async sendRawTransaction(rawTx) {
			return publicClient.request({
				method: "eth_sendRawTransaction",
				params: [rawTx as Hex],
			});
		},
	};

	return {
		db: options.db,
		puissant: createPuissantClient(),
		watcher,
		publicFallback,
		now: options.now ?? (() => new Date()),
		maxBlocks: options.maxBlocks ?? DEFAULT_MAX_BLOCKS,
		pollMs: options.pollMs ?? DEFAULT_POLL_MS,
		chainId: options.chainId ?? 56,
		logger: options.logger,
	};
}

export { createPuissantClient, PuissantRpcError } from "./puissant-client.js";
export type { PuissantClient } from "./puissant-client.js";
export type {
	SubmitBundleInput,
	SubmitBundleResult,
	BundleStatusResult,
	InclusionWatcher,
	PublicMempoolFallback,
} from "./types.js";
