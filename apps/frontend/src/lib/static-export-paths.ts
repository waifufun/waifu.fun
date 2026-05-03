/**
 * Helpers for `output: "export"` builds (Cloudflare Pages static uploads).
 * Dynamic segments must be enumerated at build time; extend these helpers if you add new APIs.
 */

/**
 * True when prerendering for production (`next build`). This app uses `output: "export"`, so
 * builds must enumerate dynamic segments. `next dev` stays false so local dev does not fan out
 * to the API. `scripts/static-export-build.mjs` sets STATIC_EXPORT for clarity, but some Next
 * workers do not inherit it: NODE_ENV is reliable.
 */
export function isStaticExport(): boolean {
	return process.env.NODE_ENV === "production";
}

/** Same default as route handlers and client modules when env is unset (static export has no /api proxy). */
const DEFAULT_PUBLIC_API_ORIGIN = "https://api.waifu.fun";

function apiBaseForStaticExport(): string {
	const trimmed = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ?? "";
	if (trimmed.length > 0) return trimmed;
	if (isStaticExport()) {
		return DEFAULT_PUBLIC_API_ORIGIN;
	}
	return "";
}

const STATIC_EXPORT_PLACEHOLDER_EVM_ADDRESS = "0x0000000000000000000000000000000000000000";

/**
 * Next `output: "export"` throws if `generateStaticParams` yields zero paths (error text says
 * "missing generateStaticParams"). When the API is unreachable at build time, fall back to a
 * placeholder so the export completes; pages resolve to not-found or empty states.
 */
function ensureNonEmptyTokenParams(
	result: { chain: string; chainId: string; contractAddress: string }[],
): { chain: string; chainId: string; contractAddress: string }[] {
	if (result.length > 0 || !isStaticExport()) return result;
	console.warn("[static-export] no tokens from API; using placeholder param so export succeeds (page may 404)");
	return [{ chain: "evm", chainId: "1", contractAddress: STATIC_EXPORT_PLACEHOLDER_EVM_ADDRESS }];
}

function ensureNonEmptyAddresses(result: { address: string }[]): { address: string }[] {
	if (result.length > 0 || !isStaticExport()) return result;
	console.warn("[static-export] no agent/profile addresses from API; using placeholder so export succeeds");
	return [{ address: STATIC_EXPORT_PLACEHOLDER_EVM_ADDRESS }];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function agentsArrayFromJson(data: unknown): Record<string, unknown>[] {
	if (!isRecord(data)) return [];
	if (Array.isArray(data.agents)) return data.agents.filter(isRecord);
	if (Array.isArray(data.docs)) return data.docs.filter(isRecord);
	if (Array.isArray(data)) return data.filter(isRecord);
	return [];
}

function tokenAddressFromAgent(raw: Record<string, unknown>): string | null {
	const addr = raw.tokenAddress ?? raw.token_address ?? raw.contractAddress ?? raw.address;
	return typeof addr === "string" && addr.length > 0 ? addr : null;
}

/**
 * Walks `/v2/agents` pages until exhaustion so `/agent/[address]` (and patron/profile stubs) can pre-render.
 */
export async function fetchAgentAddressesForStaticExport(): Promise<{ address: string }[]> {
	if (!isStaticExport()) return [];

	const base = apiBaseForStaticExport();
	const addresses = new Set<string>();
	let offset = 0;
	const limit = 100;

	try {
		while (true) {
			const qs = new URLSearchParams({
				limit: String(limit),
				offset: String(offset),
				sort: "newest",
				includeLegacy: "true",
			});
			const res = await fetch(`${base}/v2/agents?${qs.toString()}`, { cache: "no-store" });
			if (!res.ok) break;

			const agents = agentsArrayFromJson(await res.json());
			if (agents.length === 0) break;

			for (const a of agents) {
				const addr = tokenAddressFromAgent(a);
				if (addr) addresses.add(addr);
			}

			offset += limit;
			if (agents.length < limit) break;
		}
	} catch (err) {
		console.warn("[static-export] failed to enumerate agents (continuing with partial or empty list)", err);
	}

	return ensureNonEmptyAddresses([...addresses].map((address) => ({ address })));
}

export async function fetchPatronAgentParamsForStaticExport(): Promise<{ agentId: string }[]> {
	const agents = await fetchAgentAddressesForStaticExport();
	return agents.map(({ address }) => ({ agentId: address }));
}

/** Profiles reuse agent treasury/wallet addresses when present on agent payloads (best-effort). */
export async function fetchProfileAddressesForStaticExport(): Promise<{ address: string }[]> {
	if (!isStaticExport()) return [];

	const base = apiBaseForStaticExport();
	const addresses = new Set<string>();
	let offset = 0;
	const limit = 100;

	try {
		while (true) {
			const qs = new URLSearchParams({
				limit: String(limit),
				offset: String(offset),
				sort: "newest",
				includeLegacy: "true",
			});
			const res = await fetch(`${base}/v2/agents?${qs.toString()}`, { cache: "no-store" });
			if (!res.ok) break;

			const agents = agentsArrayFromJson(await res.json());
			if (agents.length === 0) break;

			for (const a of agents) {
				const token = tokenAddressFromAgent(a);
				if (token) addresses.add(token);
				const w = a.walletAddress ?? a.treasuryAddress ?? a.patronAddress;
				if (typeof w === "string" && w.length > 0) addresses.add(w);
			}

			offset += limit;
			if (agents.length < limit) break;
		}
	} catch (err) {
		console.warn("[static-export] failed to enumerate profile addresses", err);
	}

	return ensureNonEmptyAddresses([...addresses].map((address) => ({ address })));
}

function tokenItemsFromJson(data: unknown): Record<string, unknown>[] {
	if (!isRecord(data)) return [];
	if (Array.isArray(data.items)) return data.items.filter(isRecord);
	if (Array.isArray(data.docs)) return data.docs.filter(isRecord);
	if (Array.isArray(data)) return data.filter(isRecord);
	return [];
}

function toNumberLike(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "") {
		const n = Number(value);
		if (Number.isFinite(n)) return n;
	}
	return fallback;
}

/**
 * Paginates `GET /tokens` so `/token/[chain]/[chainId]/[contractAddress]` trees can export.
 */
export async function fetchTokenRouteParamsForStaticExport(): Promise<
	{ chain: string; chainId: string; contractAddress: string }[]
> {
	if (!isStaticExport()) return [];

	const base = apiBaseForStaticExport();
	const out: { chain: string; chainId: string; contractAddress: string }[] = [];
	const seen = new Set<string>();
	let page = 1;
	const limit = 100;

	try {
		while (true) {
			const qs = new URLSearchParams({ limit: String(limit), page: String(page) });
			const res = await fetch(`${base}/tokens?${qs.toString()}`, { cache: "no-store" });
			if (!res.ok) break;

			const items = tokenItemsFromJson(await res.json());
			if (items.length === 0) break;

			for (const item of items) {
				const contractRaw =
					item.contractAddress ?? item.address ?? item.mint ?? item.tokenAddress ?? item.token_address;
				const chainRaw = item.chain;
				const chainIdRaw = item.chainId ?? item.chain_id;
				if (typeof contractRaw !== "string" || contractRaw.length === 0) continue;
				const chain = typeof chainRaw === "string" && chainRaw.length > 0 ? chainRaw : "evm";
				const chainIdNum = toNumberLike(chainIdRaw, 56);
				const chainId = String(chainIdNum);
				if (chain.toLowerCase() === "bsc" && chainId === "56") continue;

				const key = `${chain}:${chainId}:${contractRaw.toLowerCase()}`;
				if (seen.has(key)) continue;
				seen.add(key);
				out.push({ chain, chainId, contractAddress: contractRaw });
			}

			page += 1;
			if (items.length < limit) break;
		}
	} catch (err) {
		console.warn("[static-export] failed to enumerate tokens", err);
	}

	return ensureNonEmptyTokenParams(out);
}

/**
 * Optional `STATIC_EXPORT_CLAIM_TOKENS="tokA,tokB"` so `/claim/[token]` shells exist in the export.
 * Without this env var, no claim HTML is emitted (links still work on Node deployments).
 */
export function parseClaimTokensFromEnv(): { token: string }[] {
	if (!isStaticExport()) return [];
	const raw = process.env.STATIC_EXPORT_CLAIM_TOKENS?.trim();
	if (!raw) return [];
	return raw
		.split(",")
		.map((t) => t.trim())
		.filter((t) => t.length > 0)
		.map((token) => ({ token }));
}
