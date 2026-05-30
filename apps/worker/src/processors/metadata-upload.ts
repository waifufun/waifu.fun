import type { Job } from "bullmq";

import { uploadFlapMetadata } from "@waifufun/flap";
import { type MetadataUploadJob, parseJobPayload } from "@waifufun/queue/jobs";

import { emitAgentEvent } from "../lib/emit.js";
import { safeFetchBytes } from "../lib/safe-url-fetch.js";
import type { WorkerContext } from "../lib/types.js";

const MAX_UPLOAD_ATTEMPTS = 3;
const MAX_METADATA_IMAGE_BYTES = 10 * 1024 * 1024;
const METADATA_IMAGE_TIMEOUT_MS = 10_000;

export function createMetadataUploadProcessor(context: WorkerContext) {
	return async (job: Job<MetadataUploadJob>) => {
		const payload = parseJobPayload("metadata-upload", job.data);

		await emitAgentEvent({
			db: context.db,
			eventType: "launch.metadata_upload_started",
			agentId: null,
			data: { launchId: payload.launchId, attempt: payload.attempt },
		});

		context.logger.info(
			{
				jobId: job.id,
				launchId: payload.launchId,
				creatorAddress: payload.creatorAddress,
				attempt: payload.attempt,
			},
			"metadata upload starting",
		);

		if (payload.attempt >= MAX_UPLOAD_ATTEMPTS) {
			const error = new Error(`Metadata upload failed after ${MAX_UPLOAD_ATTEMPTS} attempts`);
			await emitAgentEvent({
				db: context.db,
				eventType: "launch.metadata_upload_failed",
				agentId: null,
				data: {
					launchId: payload.launchId,
					attempt: payload.attempt,
					error: error instanceof Error ? error.message : String(error),
				},
			});

			context.logger.error(
				{
					jobId: job.id,
					launchId: payload.launchId,
					attempt: payload.attempt,
				},
				error.message,
			);
			throw error;
		}

		try {
			const imageResponse = await safeFetchBytes(payload.metadata.imageUrl, {
				maxBytes: MAX_METADATA_IMAGE_BYTES,
				timeoutMs: METADATA_IMAGE_TIMEOUT_MS,
				allowedContentTypes: ["image/"],
				accept: "image/*",
			});
			const imageBlob = new Blob([imageResponse.bytes], { type: imageResponse.contentType || "image/png" });

			// Build metadata record for Flap
			const metadata = {
				creator: payload.creatorAddress as `0x${string}`,
				description: payload.metadata.description,
				website: payload.metadata.website?.trim() || null,
				twitter: payload.metadata.twitter?.trim() || null,
				telegram: payload.metadata.telegram?.trim() || null,
				buy: payload.metadata.buy?.trim() || null,
				sell: payload.metadata.sell?.trim() || null,
			};

			context.logger.info(
				{
					jobId: job.id,
					launchId: payload.launchId,
					metadata: {
						creator: metadata.creator,
						hasWebsite: !!metadata.website,
						hasTwitter: !!metadata.twitter,
						hasTelegram: !!metadata.telegram,
					},
				},
				"uploading metadata to Flap",
			);

			const result = await uploadFlapMetadata({
				metadata,
				image: imageBlob,
			});

			await emitAgentEvent({
				db: context.db,
				eventType: "launch.metadata_upload_succeeded",
				agentId: null,
				data: {
					launchId: payload.launchId,
					cid: result.cid,
					uploadUrl: result.uploadUrl,
					flapUrl: result.uploadUrl,
					attempt: payload.attempt,
				},
			});

			context.logger.info(
				{
					jobId: job.id,
					launchId: payload.launchId,
					cid: result.cid,
					uploadUrl: result.uploadUrl,
				},
				"metadata upload completed",
			);

			return {
				status: "completed",
				launchId: payload.launchId,
				cid: result.cid,
				uploadUrl: result.uploadUrl,
				attempt: payload.attempt,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await emitAgentEvent({
				db: context.db,
				eventType: "launch.metadata_upload_failed",
				agentId: null,
				data: { launchId: payload.launchId, attempt: payload.attempt, error: message },
			});

			context.logger.error(
				{
					jobId: job.id,
					launchId: payload.launchId,
					attempt: payload.attempt,
					error: message,
				},
				"metadata upload failed",
			);

			// If we haven't exceeded max attempts, throw to trigger retry
			if (payload.attempt < MAX_UPLOAD_ATTEMPTS - 1) {
				throw error;
			}

			// On final attempt, return failure result
			return {
				status: "failed",
				launchId: payload.launchId,
				attempt: payload.attempt,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	};
}
