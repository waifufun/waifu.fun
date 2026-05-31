import { createHash } from "node:crypto";

import type { Job } from "bullmq";

import { findFlapVanitySalt, getFlapPortalAddress, resolveFlapNetwork } from "@waifufun/flap";
import { type SaltSearchJob, parseJobPayload } from "@waifufun/queue/jobs";

import type { WorkerContext } from "../lib/types.js";

const MAX_SALT_SEARCH_ITERATIONS = 50_000_000; // Safety limit to prevent infinite loops

export function createSaltSearchProcessor(context: WorkerContext) {
	return async (job: Job<SaltSearchJob>) => {
		const payload = parseJobPayload("salt-search", job.data);
		const requiredSuffix = payload.suffix ?? (payload.tokenType === "tax" ? "7777" : "8888");
		const network = resolveFlapNetwork({ chainId: payload.chainId });
		const portalAddress =
			(payload.portalAddress as `0x${string}`) ?? getFlapPortalAddress({ chainId: payload.chainId as 56 | 97 });

		// Generate a deterministic seed from launch ID if not provided
		const seedSalt =
			(payload.seedSalt as `0x${string}`) ??
			(`0x${createHash("sha256").update(`${payload.launchId}:${requiredSuffix}`).digest("hex")}` as `0x${string}`);

		context.logger.info(
			{
				jobId: job.id,
				launchId: payload.launchId,
				chainId: payload.chainId,
				tokenType: payload.tokenType,
				requiredSuffix,
				portalAddress,
			},
			"salt search starting",
		);

		const startTime = Date.now();
		let lastProgressUpdate = startTime;

		try {
			const result = await findFlapVanitySalt({
				taxRate: payload.tokenType === "tax" ? 500 : 0, // 5% for tax tokens, 0 for standard
				suffix: requiredSuffix,
				seed: seedSalt,
				chainId: payload.chainId,
				portalAddress,
				yieldEvery: 10_000,
				onProgress: (iterations: number, currentSalt: `0x${string}`) => {
					const now = Date.now();
					// Log progress every 5 seconds
					if (now - lastProgressUpdate > 5000) {
						context.logger.info(
							{
								jobId: job.id,
								launchId: payload.launchId,
								iterations,
								elapsedMs: now - startTime,
							},
							"salt search progress",
						);
						lastProgressUpdate = now;

						// Safety check: abort if we exceed max iterations
						if (iterations > MAX_SALT_SEARCH_ITERATIONS) {
							throw new Error(`Salt search exceeded maximum iterations (${MAX_SALT_SEARCH_ITERATIONS})`);
						}
					}
				},
			});

			const elapsedMs = Date.now() - startTime;

			context.logger.info(
				{
					jobId: job.id,
					launchId: payload.launchId,
					salt: result.salt,
					predictedAddress: result.address,
					iterations: result.iterations,
					elapsedMs,
				},
				"salt search completed",
			);

			return {
				status: "completed",
				launchId: payload.launchId,
				chainId: payload.chainId,
				salt: result.salt,
				predictedTokenAddress: result.address,
				requiredSuffix,
				iterations: result.iterations,
				elapsedMs,
				tokenImplementation: result.tokenImplementation,
				portalAddress: result.portalAddress,
			};
		} catch (error) {
			context.logger.error(
				{
					jobId: job.id,
					launchId: payload.launchId,
					error: error instanceof Error ? error.message : String(error),
					elapsedMs: Date.now() - startTime,
				},
				"salt search failed",
			);
			throw error;
		}
	};
}
