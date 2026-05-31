/**
 * Bags / Meteora pool-state reads.
 *
 * Bags exposes `GET /token-launch/{tokenMint}` and
 * `GET /bags-pools/{tokenMint}` (the Meteora DBC + DAMM v2 pool keys). We use
 * them to resolve graduation (PRE_LAUNCH/PRE_GRAD/MIGRATING/MIGRATED) and curve
 * progress. The Bags token status enum is the graduation signal:
 *   PRE_LAUNCH | PRE_GRAD  -> not graduated (still on the DBC curve)
 *   MIGRATING | MIGRATED   -> graduated (DAMM v2 LP exists)
 *
 * Gating: reads require `BAGS_API_KEY`. Without it, returns null so the adapter
 * surfaces a clear configuration error.
 */

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface BagsPoolState {
	graduated: boolean;
	/** DAMM v2 LP / migrated pool address. */
	lpAddress?: string;
	/** Fee-share wallet (creator fee accrual). */
	feeShareWallet?: string;
	status?: string;
	curve?: { raisedWei: bigint; targetWei: bigint };
}

interface BagsReadConfig {
	apiKey?: string;
	baseUrl: string;
	fetchImpl: typeof fetch;
}

function resolveReadConfig(override?: Partial<BagsReadConfig>): BagsReadConfig {
	return {
		apiKey: override?.apiKey ?? process.env.BAGS_API_KEY,
		baseUrl: override?.baseUrl ?? process.env.BAGS_API_URL ?? "https://public-api-v2.bags.fm/api/v1",
		fetchImpl: override?.fetchImpl ?? fetch,
	};
}

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function pickString(record: JsonRecord, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

function toBigIntOrUndefined(value: unknown): bigint | undefined {
	if (typeof value === "bigint") return value;
	if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
	if (typeof value === "string" && /^\d+$/.test(value.trim())) return BigInt(value.trim());
	return undefined;
}

/** GRAD signal from the Bags TokenLaunchStatus enum. */
function statusGraduated(status: string | undefined): boolean {
	if (!status) return false;
	return /migrat/i.test(status);
}

function parsePoolState(record: JsonRecord): BagsPoolState {
	const status = pickString(record, ["status", "launchStatus", "tokenLaunchStatus"]);
	const lpAddress = pickString(record, ["dammV2Pool", "dammPool", "lpAddress", "poolAddress", "migratedPool"]);
	const feeShareWallet = pickString(record, ["feeShareWallet", "feeShareAuthority", "launchWallet"]);
	const raised = toBigIntOrUndefined(record.raised ?? record.raisedLamports ?? record.quoteReserve);
	const target = toBigIntOrUndefined(record.target ?? record.migrationThreshold ?? record.graduationTarget);
	const curve = raised !== undefined && target !== undefined ? { raisedWei: raised, targetWei: target } : undefined;
	return {
		graduated: statusGraduated(status),
		...(lpAddress ? { lpAddress } : {}),
		...(feeShareWallet ? { feeShareWallet } : {}),
		...(status ? { status } : {}),
		...(curve ? { curve } : {}),
	};
}

/**
 * Fetch Bags/Meteora pool state for a Solana token mint. Returns null when no
 * API key is configured (so the adapter surfaces a clear configuration error)
 * or the mint is malformed.
 */
export async function fetchBagsPoolState(
	tokenMint: string,
	override?: Partial<BagsReadConfig>,
): Promise<BagsPoolState | null> {
	if (!SOLANA_ADDRESS_RE.test(tokenMint)) return null;
	const config = resolveReadConfig(override);
	if (!config.apiKey) return null;

	const headers: Record<string, string> = { Accept: "application/json", "x-api-key": config.apiKey };
	// Pool keys endpoint carries graduation/LP; launch detail carries status/curve.
	const paths = [`/bags-pools/${tokenMint}`, `/token-launch/${tokenMint}`];
	let merged: BagsPoolState | null = null;
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
		const top = asRecord(body);
		const record = asRecord(top?.response) ?? asRecord(top?.data) ?? top;
		if (!record) continue;
		const state = parsePoolState(record);
		merged = merged
			? {
					graduated: merged.graduated || state.graduated,
					...((merged.lpAddress ?? state.lpAddress) ? { lpAddress: merged.lpAddress ?? state.lpAddress } : {}),
					...((merged.feeShareWallet ?? state.feeShareWallet)
						? { feeShareWallet: merged.feeShareWallet ?? state.feeShareWallet }
						: {}),
					...((merged.status ?? state.status) ? { status: merged.status ?? state.status } : {}),
					...((merged.curve ?? state.curve) ? { curve: merged.curve ?? state.curve } : {}),
				}
			: state;
	}
	return merged;
}
