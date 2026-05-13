/**
 * Flap-native token metadata uploader.
 *
 * Wave H pivots us from "we mint AgentTokenV3" to "Flap mints the token via
 * Portal.newTokenV6 inside our atomic bundle." Flap's Portal requires token
 * metadata (image, description, socials) to live at an IPFS CID hosted by
 * their `funcs.flap.sh/api/upload` endpoint. The CID is passed in as the
 * `meta` param when the bundle router calls `Portal.newTokenV6`.
 *
 * The wizard collects the image + metadata client-side, posts it to Flap,
 * and stores the returned CID on the wizard state. Backend will pick up the
 * CID from the launch row at bundle-submit time.
 *
 * Endpoint:
 *   POST https://funcs.flap.sh/api/upload  (multipart/form-data)
 *
 *   form fields:
 *     image:     File (the token logo)
 *     metadata:  application/json blob with
 *                  { name, symbol, description, twitter?, telegram?, website? }
 *
 *   response (200):
 *     { cid: string, uri: string }
 *
 * The endpoint is mocked in tests via `tests/e2e/fixtures/api-mock.ts`. The
 * client never reads `NEXT_PUBLIC_API_URL` for this call — Flap is a hard-coded
 * third-party host that lives outside our backend.
 */

export const FLAP_METADATA_UPLOAD_URL = "https://funcs.flap.sh/api/upload";

export type FlapMetadataInput = {
	name: string;
	symbol: string;
	description: string;
	image: File | Blob;
	twitter?: string | null;
	telegram?: string | null;
	website?: string | null;
};

export type FlapMetadataUploadResult = {
	cid: string;
	uri: string;
};

export class FlapMetadataUploadError extends Error {
	override readonly cause?: unknown;
	readonly status?: number;
	constructor(message: string, opts?: { cause?: unknown; status?: number }) {
		super(message);
		this.name = "FlapMetadataUploadError";
		if (opts?.cause !== undefined) this.cause = opts.cause;
		if (opts?.status !== undefined) this.status = opts.status;
	}
}

export type UploadOpts = {
	/** Override for tests. Defaults to `FLAP_METADATA_UPLOAD_URL`. */
	endpoint?: string;
	/** Override `fetch` for unit tests. */
	fetchImpl?: typeof fetch;
	/** AbortSignal pass-through. */
	signal?: AbortSignal;
};

/**
 * Build the metadata JSON blob Flap expects. Pure so callers can preview /
 * inspect what's being sent without doing a real upload.
 */
export function buildFlapMetadataPayload(input: Omit<FlapMetadataInput, "image">): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		name: input.name,
		symbol: input.symbol,
		description: input.description,
	};
	if (input.twitter?.trim()) payload.twitter = input.twitter.trim();
	if (input.telegram?.trim()) payload.telegram = input.telegram.trim();
	if (input.website?.trim()) payload.website = input.website.trim();
	return payload;
}

/**
 * POST the image + metadata to Flap's IPFS uploader and return the CID.
 *
 * Throws `FlapMetadataUploadError` on any non-2xx, network error, or
 * malformed response. Callers should catch and surface a friendly retry
 * affordance — the wizard MUST NOT proceed without a CID.
 */
export async function uploadFlapMetadata(
	input: FlapMetadataInput,
	opts: UploadOpts = {},
): Promise<FlapMetadataUploadResult> {
	const endpoint = opts.endpoint ?? FLAP_METADATA_UPLOAD_URL;
	const fetchImpl = opts.fetchImpl ?? fetch;

	const form = new FormData();
	form.append("image", input.image);
	form.append("metadata", new Blob([JSON.stringify(buildFlapMetadataPayload(input))], { type: "application/json" }));

	const init: RequestInit = { method: "POST", body: form };
	if (opts.signal) init.signal = opts.signal;

	let res: Response;
	try {
		res = await fetchImpl(endpoint, init);
	} catch (err) {
		throw new FlapMetadataUploadError("network error contacting flap", { cause: err });
	}

	if (!res.ok) {
		let detail = "";
		try {
			detail = await res.text();
		} catch {
			// ignore body-read errors
		}
		throw new FlapMetadataUploadError(`flap upload failed (${res.status}): ${detail.slice(0, 200) || res.statusText}`, {
			status: res.status,
		});
	}

	let json: unknown;
	try {
		json = await res.json();
	} catch (err) {
		throw new FlapMetadataUploadError("flap returned non-json", { cause: err });
	}

	if (typeof json !== "object" || json === null) {
		throw new FlapMetadataUploadError("flap response missing cid");
	}
	const obj = json as { cid?: unknown; uri?: unknown };
	if (typeof obj.cid !== "string" || obj.cid.length === 0) {
		throw new FlapMetadataUploadError("flap response missing cid");
	}
	const cid = obj.cid;
	const uri = typeof obj.uri === "string" && obj.uri.length > 0 ? obj.uri : `ipfs://${cid}`;
	return { cid, uri };
}

/** UI-friendly truncation of a CID. e.g. `bafkrei...x4uq` */
export function shortenCid(cid: string): string {
	if (!cid) return "";
	if (cid.length <= 14) return cid;
	return `${cid.slice(0, 8)}…${cid.slice(-4)}`;
}
