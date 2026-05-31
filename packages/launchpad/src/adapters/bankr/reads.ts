/**
 * Bankr / Doppler launch-state reads.
 *
 * Bankr exposes a public `/token-launches` listing and (when a key is present)
 * per-launch detail. We use it to resolve curve progress + graduation for a
 * launched token. The exact JSON shape is not fully documented, so the parser
 * is defensive about field names.
 *
 * Gating: reads require either `BANKR_API_KEY` (preferred) or fall back to the
 * public listing if `BANKR_PUBLIC_READS=true`. Without either, reads return
 * null so the adapter can throw a clear "configure creds" error.
 */

import { getAddress, isAddress } from "viem";

export interface BankrLaunchState {
	graduated: boolean;
	lpAddress?: string;
	creatorFeeRecipient?: string;
	curve?: { raisedWei: bigint; targetWei: bigint };
}

interface BankrReadConfig {
	apiKey?: string;
	baseUrl: string;
	fetchImpl: typeof fetch;
	publicReads: boolean;
}

function resolveReadConfig(override?: Partial<BankrReadConfig>): BankrReadConfig {
	return {
		apiKey: override?.apiKey ?? process.env.BANKR_API_KEY,
		baseUrl: override?.baseUrl ?? process.env.BANKR_API_URL ?? "https://api.bankr.bot",
		fetchImpl: override?.fetchImpl ?? fetch,
		publicReads: override?.publicReads ?? process.env.BANKR_PUBLIC_READS === "true",
	};
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function toBigIntOrUndefined(value: unknown): bigint | undefined {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
	if (typeof value === "string" && /^\d+$/.test(value.trim())) return BigInt(value.trim());
	return undefined;
}

function pickString(record: JsonRecord, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

function pickAddress(record: JsonRecord, keys: string[]): string | undefined {
	const raw = pickString(record, keys);
	return raw && isAddress(raw) ? getAddress(raw) : undefined;
}

/** Resolve the launch record for `tokenAddress` from a `/token-launches` payload. */
function findLaunch(body: unknown, tokenAddress: string): JsonRecord | null {
	const lc = tokenAddress.toLowerCase();
	const top = asRecord(body);
	const list = Array.isArray(body)
		? body
		: Array.isArray(top?.launches)
			? top.launches
			: Array.isArray(top?.data)
				? top.data
				: top
					? [top]
					: [];
	for (const entry of list) {
		const record = asRecord(entry);
		if (!record) continue;
		const addr = pickString(record, ["tokenAddress", "contractAddress", "token", "address"]);
		if (addr && addr.toLowerCase() === lc) return record;
	}
	return null;
}

function parseLaunchState(record: JsonRecord): BankrLaunchState {
	const graduated =
		record.graduated === true ||
		record.migrated === true ||
		(typeof record.status === "string" && /grad|migrat|live|complete/i.test(record.status));
	const lpAddress = pickAddress(record, ["lpAddress", "poolAddress", "poolId", "uniswapPool", "pairAddress"]);
	const creatorFeeRecipient = pickAddress(record, ["feeRecipient", "creatorFeeRecipient", "creator"]);
	const raised = toBigIntOrUndefined(record.raisedWei ?? record.raised ?? record.totalRaised);
	const target = toBigIntOrUndefined(record.targetWei ?? record.target ?? record.graduationTarget);
	const curve = raised !== undefined && target !== undefined ? { raisedWei: raised, targetWei: target } : undefined;
	return {
		graduated,
		...(lpAddress ? { lpAddress } : {}),
		...(creatorFeeRecipient ? { creatorFeeRecipient } : {}),
		...(curve ? { curve } : {}),
	};
}

/**
 * Fetch the Bankr/Doppler launch state for a Base token. Returns null when no
 * creds are configured (and public reads are off) so the adapter surfaces a
 * clear configuration error.
 */
export async function fetchBankrLaunchState(
	tokenAddress: string,
	override?: Partial<BankrReadConfig>,
): Promise<BankrLaunchState | null> {
	if (!isAddress(tokenAddress)) return null;
	const config = resolveReadConfig(override);
	if (!config.apiKey && !config.publicReads) return null;

	const headers: Record<string, string> = { Accept: "application/json" };
	if (config.apiKey) headers["X-API-Key"] = config.apiKey;

	// Try a per-token detail endpoint first, then fall back to the listing.
	const paths = [`/token-launches/${tokenAddress}`, "/token-launches"];
	for (const path of paths) {
		let res: Response;
		try {
			res = await config.fetchImpl(`${config.baseUrl}${path}`, { method: "GET", headers });
		} catch {
			continue;
		}
		if (!res.ok) continue;
		let body: unknown;
		try {
			body = JSON.parse(await res.text());
		} catch {
			continue;
		}
		const record = path.endsWith(tokenAddress)
			? (asRecord(body)?.data ?? asRecord(body))
			: findLaunch(body, tokenAddress);
		const resolved = asRecord(record);
		if (resolved) return parseLaunchState(resolved);
	}
	return null;
}
