/**
 * Four.Meme image upload.
 *
 * Endpoint: POST /v1/private/token/upload
 *   Headers: meme-web-access: <accessToken>
 *   Body:    multipart/form-data with single field `file`
 *   Response: { code: "0", data: "<cdn_url>" }
 *
 * Four.Meme requires images to be served from their CDN. We accept either a
 * URL (fetched here) or a raw buffer/base64 string.
 */

import { FourMemeError } from "./errors.js";
import { FOURMEME_API_BASE } from "./fourmeme-auth.js";

export interface FourMemeUploadInput {
	/** One of imageUrl or imageBase64 (may be `data:...;base64,...` or raw base64). */
	imageUrl?: string | undefined;
	imageBase64?: string | undefined;
	mimeType?: string | undefined;
	filename?: string | undefined;
}

export interface FourMemeUploadOptions {
	baseUrl?: string | undefined;
	fetchImpl?: typeof fetch | undefined;
}

export interface FourMemeUploadResult {
	imageUrl: string;
}

/** Produce a Blob + filename pair from the various image input shapes. */
async function resolveBlob(
	input: FourMemeUploadInput,
	fetchImpl: typeof fetch,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
	if (!input.imageUrl && !input.imageBase64) {
		throw new FourMemeError("upload: imageUrl or imageBase64 required", 0);
	}
	if (input.imageUrl && input.imageBase64) {
		throw new FourMemeError("upload: pass exactly one of imageUrl / imageBase64", 0);
	}

	// --- Base64 path ---
	if (input.imageBase64) {
		let mimeFromHeader: string | undefined;
		let raw = input.imageBase64;
		const dataUriMatch = raw.match(/^data:([^;]+);base64,(.+)$/);
		if (dataUriMatch?.[1] && dataUriMatch[2]) {
			mimeFromHeader = dataUriMatch[1];
			raw = dataUriMatch[2];
		}
		const bytes = Buffer.from(raw, "base64");
		const mimeType: string = input.mimeType ?? mimeFromHeader ?? "image/png";
		const filename: string = input.filename ?? `upload.${guessExt(mimeType)}`;
		return {
			blob: new Blob([bytes], { type: mimeType }),
			filename,
			mimeType,
		};
	}

	// --- URL path ---
	const url = input.imageUrl as string;
	const res = await fetchImpl(url);
	if (!res.ok) {
		throw new FourMemeError(`upload: failed to fetch imageUrl (${res.status})`, res.status);
	}
	const contentType = res.headers.get("content-type") ?? "";
	const derivedMime = contentType.startsWith("image/")
		? (contentType.split(";")[0]?.trim() ?? "image/png")
		: "image/png";
	const mimeType: string = input.mimeType ?? derivedMime;
	const bytes = new Uint8Array(await res.arrayBuffer());
	const filename =
		input.filename ??
		(() => {
			try {
				const u = new URL(url);
				const last = u.pathname.split("/").pop() ?? "";
				if (last && /\.[a-z0-9]+$/i.test(last)) return last;
			} catch {
				// ignore
			}
			return `upload.${guessExt(mimeType)}`;
		})();
	return {
		blob: new Blob([bytes], { type: mimeType }),
		filename,
		mimeType,
	};
}

function guessExt(mimeType: string): string {
	if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
	if (mimeType.includes("png")) return "png";
	if (mimeType.includes("gif")) return "gif";
	if (mimeType.includes("webp")) return "webp";
	if (mimeType.includes("bmp")) return "bmp";
	return "png";
}

export async function fourMemeUploadImage(
	accessToken: string,
	input: FourMemeUploadInput,
	opts: FourMemeUploadOptions = {},
): Promise<FourMemeUploadResult> {
	if (!accessToken) {
		throw new FourMemeError("upload: accessToken required", 0);
	}
	const baseUrl = (opts.baseUrl ?? FOURMEME_API_BASE).replace(/\/+$/, "");
	const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);

	const { blob, filename } = await resolveBlob(input, fetchImpl);

	const form = new FormData();
	form.append("file", blob, filename);

	const res = await fetchImpl(`${baseUrl}/v1/private/token/upload`, {
		method: "POST",
		headers: {
			// Do NOT set Content-Type — fetch will add the boundary for multipart.
			"meme-web-access": accessToken,
			Accept: "application/json",
		},
		body: form,
	});

	const text = await res.text();
	let payload: unknown = {};
	if (text) {
		try {
			payload = JSON.parse(text);
		} catch {
			throw new FourMemeError(`upload: non-JSON response (status ${res.status})`, res.status, {
				body: text.slice(0, 500),
			});
		}
	}

	const obj = payload as { code?: unknown; data?: unknown; msg?: unknown };
	if (obj.code !== "0" && obj.code !== 0) {
		throw new FourMemeError(`upload: Four.Meme returned error ${String(obj.msg ?? obj.code)}`, res.status, payload);
	}
	const imageUrl = typeof obj.data === "string" ? obj.data : "";
	if (!imageUrl) {
		throw new FourMemeError("upload: Four.Meme returned empty URL", res.status, payload);
	}
	return { imageUrl };
}
