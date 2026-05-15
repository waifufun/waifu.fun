import { schema } from "@waifufun/db";
import type { Database } from "@waifufun/db/client";
import { eq } from "drizzle-orm";

export interface FlapMetadata {
	name: string;
	symbol: string;
	description: string;
	image: string;
	[key: string]: unknown;
}

export interface ValidateFlapMetadataOptions {
	gatewayBaseUrl?: string;
	fetchImpl?: typeof fetch;
}

export class FlapMetadataError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "FlapMetadataError";
		this.code = code;
	}
}

const CID_RE = /^(?:ipfs:\/\/)?([a-zA-Z0-9][a-zA-Z0-9._-]{20,180})$/;

export function normalizeFlapCid(cid: string): string {
	const match = cid.trim().match(CID_RE);
	if (!match?.[1]) throw new FlapMetadataError("INVALID_CID", "flap_meta_cid must be a valid IPFS CID");
	return match[1];
}

export async function validateFlapMetadataCid(
	cid: string,
	options: ValidateFlapMetadataOptions = {},
): Promise<{ cid: string; metadata: FlapMetadata }> {
	const normalized = normalizeFlapCid(cid);
	const gatewayBaseUrl = (
		options.gatewayBaseUrl ??
		process.env.FLAP_FUNCS_GATEWAY_URL ??
		"https://funcs.flap.sh/api"
	).replace(/\/$/, "");
	const fetchImpl = options.fetchImpl ?? fetch;
	const response = await fetchImpl(`${gatewayBaseUrl}/${encodeURIComponent(normalized)}`, {
		headers: { accept: "application/json" },
	});
	if (!response.ok) {
		throw new FlapMetadataError("CID_UNREACHABLE", `Flap metadata CID was not reachable (${response.status})`);
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch {
		throw new FlapMetadataError("INVALID_JSON", "Flap metadata response was not valid JSON");
	}

	const metadata = json as Partial<FlapMetadata>;
	for (const key of ["name", "symbol", "description", "image"] as const) {
		if (typeof metadata[key] !== "string" || metadata[key]?.trim() === "") {
			throw new FlapMetadataError("INVALID_METADATA", `Flap metadata missing required field: ${key}`);
		}
	}

	return { cid: normalized, metadata: metadata as FlapMetadata };
}

export async function persistFlapMetadataCid(db: Database, launchId: string, cid: string): Promise<void> {
	await db
		.update(schema.agentLaunches)
		.set({ flapMetaCid: normalizeFlapCid(cid), updatedAt: new Date() })
		.where(eq(schema.agentLaunches.id, launchId));
}
