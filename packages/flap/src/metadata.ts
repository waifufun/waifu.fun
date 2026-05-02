import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";

import { env } from "@waifufun/config";

import { FLAP_UPLOAD_API_URL, resolveFlapIpfsUrl } from "./constants.js";
import type {
	FlapMetadataRecord,
	FlapMetadataUploadImageInput,
	UploadFlapMetadataInput,
	UploadFlapMetadataResult,
} from "./types.js";

export const FLAP_METADATA_UPLOAD_MUTATION = `
mutation Create($file: Upload!, $meta: MetadataInput!) {
  create(file: $file, meta: $meta)
}
`;

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
	".gif": "image/gif",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".svg": "image/svg+xml",
	".webp": "image/webp",
};

const guessContentType = (path?: string, fallback = "application/octet-stream") => {
	if (!path) {
		return fallback;
	}

	return CONTENT_TYPE_BY_EXTENSION[extname(path).toLowerCase()] ?? fallback;
};

const isBlobLike = (input: unknown): input is Blob => typeof Blob !== "undefined" && input instanceof Blob;

const normalizeMetadataField = (value?: string | null) => {
	if (value == null) {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
};

const toUploadBlob = async (input: FlapMetadataUploadImageInput | Blob): Promise<{ blob: Blob; filename: string }> => {
	if (isBlobLike(input)) {
		return {
			blob: input,
			filename: "image.png",
		};
	}

	if (input.path) {
		const bytes = await readFile(input.path);

		return {
			blob: new Blob([bytes], {
				type: input.contentType ?? guessContentType(input.path),
			}),
			filename: input.filename ?? basename(input.path),
		};
	}

	if (input.bytes) {
		const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);

		return {
			blob: new Blob([bytes], {
				type: input.contentType ?? "application/octet-stream",
			}),
			filename: input.filename ?? "image.bin",
		};
	}

	throw new Error("image input must provide either a Blob, path, or bytes");
};

export const buildFlapMetadataRecord = (input: FlapMetadataRecord): FlapMetadataRecord => ({
	buy: normalizeMetadataField(input.buy),
	creator: input.creator,
	description: input.description,
	sell: normalizeMetadataField(input.sell),
	telegram: normalizeMetadataField(input.telegram),
	twitter: normalizeMetadataField(input.twitter),
	website: normalizeMetadataField(input.website),
});

/**
 * Low-level adapter for Flap's upload API.
 *
 * TODO(waifu-core): keep retry/backoff, queue orchestration, moderation,
 * and observability in the worker tier. This package intentionally only owns
 * the direct protocol-compatible network call + payload formatting.
 */
export const uploadFlapMetadata = async (input: UploadFlapMetadataInput): Promise<UploadFlapMetadataResult> => {
	const uploadUrl = input.uploadUrl ?? env.FLAP_UPLOAD_API_URL ?? FLAP_UPLOAD_API_URL;
	const metadata = buildFlapMetadataRecord(input.metadata);
	const { blob, filename } = await toUploadBlob(input.image);

	const form = new FormData();
	form.append(
		"operations",
		JSON.stringify({
			query: FLAP_METADATA_UPLOAD_MUTATION,
			variables: {
				file: null,
				meta: metadata,
			},
		}),
	);
	form.append(
		"map",
		JSON.stringify({
			0: ["variables.file"],
		}),
	);
	form.append("0", blob, filename);

	const headers = new Headers();
	const apiKey = input.apiKey ?? env.FLAP_UPLOAD_API_KEY;

	if (apiKey) {
		headers.set("x-api-key", apiKey);
	}

	const response = await fetch(uploadUrl, {
		method: "POST",
		body: form,
		headers,
		signal: input.signal,
	});

	if (!response.ok) {
		throw new Error(`Flap upload failed with ${response.status} ${response.statusText}`);
	}

	const payload = (await response.json()) as {
		data?: { create?: string | null };
		errors?: Array<{ message?: string }>;
	};

	const cid = payload.data?.create;

	if (!cid) {
		const message = payload.errors
			?.map((error) => error.message)
			.filter(Boolean)
			.join("; ");
		throw new Error(message || "Flap upload response did not include a CID");
	}

	return {
		cid,
		uploadUrl,
	};
};

export const getFlapMetadataUrl = (cid: string) => resolveFlapIpfsUrl(cid);
