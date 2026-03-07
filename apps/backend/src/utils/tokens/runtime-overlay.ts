import logger from "@waifufun/logger";
import type {
	AddressLike,
	IToken,
	ITokenAgentCharacterConfig,
	ITokenOwnerWallets,
	ITokenRuntimeOverlay,
	ITokenRuntimeOverlayLookup,
	TChain,
	TokenAgentLifecycleState,
	TokenAgentStatus,
	TokenBillingMode,
	TokenLaunchPlatform,
	TokenLaunchType,
	TokenOwnerClaimStatus,
} from "@waifufun/types";

const DEFAULT_RUNTIME_SOURCE_NAMES = [
	"waifufun_token_runtime_overlay",
	"token_runtime_overlay",
	"token_runtime_overlays",
];
const SUPABASE_REQUEST_TIMEOUT_MS = 10_000;
const RUNTIME_SELECT_COLUMNS = [
	"chain",
	"chain_id",
	"contract_address",
	"launch_type",
	"launch_platform",
	"owner_claim_status",
	"creator_user_id",
	"owner_wallets",
	"agent_character_config",
	"cloud_agent_id",
	"agent_status",
	"agent_lifecycle_state",
	"billing_mode",
	"infra_reserve_usd",
	"last_trade_at",
	"suspend_at",
	"revive_at",
	"web_ui_url",
].join(",");

const warnedMessages = new Set<string>();

type TokenRuntimeOverlayRestRow = {
	chain?: TChain;
	chainId?: number;
	chain_id?: number;
	contractAddress?: string;
	contract_address?: string;
	launchType?: TokenLaunchType | null;
	launch_type?: TokenLaunchType | null;
	launchPlatform?: TokenLaunchPlatform | null;
	launch_platform?: TokenLaunchPlatform | null;
	ownerClaimStatus?: TokenOwnerClaimStatus | null;
	owner_claim_status?: TokenOwnerClaimStatus | null;
	creatorUserId?: string | null;
	creator_user_id?: string | null;
	ownerWallets?: ITokenOwnerWallets | null;
	owner_wallets?: ITokenOwnerWallets | null;
	agentCharacterConfig?: ITokenAgentCharacterConfig | null;
	agent_character_config?: ITokenAgentCharacterConfig | null;
	cloudAgentId?: string | null;
	cloud_agent_id?: string | null;
	agentStatus?: TokenAgentStatus | null;
	agent_status?: TokenAgentStatus | null;
	agentLifecycleState?: TokenAgentLifecycleState | null;
	agent_lifecycle_state?: TokenAgentLifecycleState | null;
	billingMode?: TokenBillingMode | null;
	billing_mode?: TokenBillingMode | null;
	infraReserveUsd?: number | string | null;
	infra_reserve_usd?: number | string | null;
	lastTradeAt?: string | null;
	last_trade_at?: string | null;
	suspendAt?: string | null;
	suspend_at?: string | null;
	reviveAt?: string | null;
	revive_at?: string | null;
	webUiUrl?: string | null;
	web_ui_url?: string | null;
};

function warnOnce(key: string, message: string, context?: Record<string, unknown>) {
	if (warnedMessages.has(key)) {
		return;
	}

	warnedMessages.add(key);
	logger.warn({ ...context }, message);
}

function normalizeLookupKey({ chain, chainId, contractAddress }: ITokenRuntimeOverlayLookup) {
	const normalizedAddress = chain === "evm" ? String(contractAddress).toLowerCase() : String(contractAddress);
	return `${chain}:${chainId}:${normalizedAddress}`;
}

function dedupeLookups(lookups: ITokenRuntimeOverlayLookup[]) {
	const seen = new Set<string>();
	const deduped: ITokenRuntimeOverlayLookup[] = [];

	for (const lookup of lookups) {
		const key = normalizeLookupKey(lookup);
		if (seen.has(key)) {
			continue;
		}

		seen.add(key);
		deduped.push(lookup);
	}

	return deduped;
}

function normalizeString(value: unknown) {
	return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeNumber(value: unknown) {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string" && value.trim()) {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}

	return undefined;
}

function normalizeDate(value: unknown) {
	if (typeof value !== "string" || !value.trim()) {
		return undefined;
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return undefined;
	}

	return parsed;
}

function normalizeStringArray(value: unknown) {
	if (!Array.isArray(value)) {
		return undefined;
	}

	const items = value.map((item) => normalizeString(item)).filter((item): item is string => Boolean(item));

	return items.length > 0 ? items : undefined;
}

function normalizeOwnerWallets(value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}

	const candidate = value as ITokenOwnerWallets;
	const ownerWallets: ITokenOwnerWallets = {};
	const solanaWallets = normalizeStringArray(candidate.solana);
	const evmWallets = normalizeStringArray(candidate.evm);

	if (solanaWallets) {
		ownerWallets.solana = solanaWallets;
	}

	if (evmWallets) {
		ownerWallets.evm = evmWallets;
	}

	return ownerWallets.solana || ownerWallets.evm ? ownerWallets : undefined;
}

function normalizeAgentCharacterConfig(value: unknown) {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}

	const candidate = value as ITokenAgentCharacterConfig;
	const config: ITokenAgentCharacterConfig = {};
	const name = normalizeString(candidate.name);
	const bio = normalizeString(candidate.bio);
	const avatar = normalizeString(candidate.avatar);

	if (name) {
		config.name = name;
	}

	if (bio) {
		config.bio = bio;
	}

	if (avatar) {
		config.avatar = avatar;
	}

	return config.name || config.bio || config.avatar ? config : undefined;
}

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[]) {
	if (typeof value !== "string") {
		return undefined;
	}

	return allowed.includes(value as T) ? (value as T) : undefined;
}

function getSupabaseRuntimeSourceNames() {
	const configuredSource = normalizeString(process.env.SUPABASE_TOKEN_RUNTIME_VIEW);
	if (configuredSource) {
		return [configuredSource];
	}

	return DEFAULT_RUNTIME_SOURCE_NAMES;
}

function getSupabaseConfig() {
	const url = normalizeString(process.env.SUPABASE_URL);
	const serviceRoleKey = normalizeString(process.env.SUPABASE_SERVICE_ROLE_KEY);

	if (!url || !serviceRoleKey) {
		warnOnce(
			"token-runtime-overlay:missing-config",
			"Supabase token runtime overlay is disabled because SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing",
		);
		return null;
	}

	return {
		url: url.replace(/\/+$/, ""),
		serviceRoleKey,
	};
}

function getContractAddressFilter(lookup: ITokenRuntimeOverlayLookup) {
	const operator = lookup.chain === "evm" ? "ilike" : "eq";
	return `contract_address.${operator}.${String(lookup.contractAddress)}`;
}

function buildLookupFilters(lookups: ITokenRuntimeOverlayLookup[]) {
	if (lookups.length === 1) {
		const lookup = lookups[0];
		if (!lookup) {
			return {};
		}

		const contractAddressOperator = lookup.chain === "evm" ? "ilike" : "eq";
		return {
			chain: `eq.${lookup.chain}`,
			chain_id: `eq.${lookup.chainId}`,
			contract_address: `${contractAddressOperator}.${String(lookup.contractAddress)}`,
		};
	}

	const orClauses = lookups.map((lookup) => {
		const contractAddressFilter = getContractAddressFilter(lookup);
		return `and(chain.eq.${lookup.chain},chain_id.eq.${lookup.chainId},${contractAddressFilter})`;
	});

	return {
		or: `(${orClauses.join(",")})`,
	};
}

async function queryRuntimeSource(sourceName: string, lookups: ITokenRuntimeOverlayLookup[]) {
	const config = getSupabaseConfig();
	if (!config) {
		return [];
	}

	const queryParams = new URLSearchParams({
		select: RUNTIME_SELECT_COLUMNS,
	});

	const filters = buildLookupFilters(lookups);
	for (const [key, value] of Object.entries(filters)) {
		queryParams.set(key, value);
	}

	const response = await fetch(`${config.url}/rest/v1/${sourceName}?${queryParams.toString()}`, {
		headers: {
			Accept: "application/json",
			apikey: config.serviceRoleKey,
			Authorization: `Bearer ${config.serviceRoleKey}`,
		},
		signal: AbortSignal.timeout(SUPABASE_REQUEST_TIMEOUT_MS),
	});

	const rawBody = await response.text();
	if (!response.ok) {
		const relationMissing =
			response.status === 404 ||
			/relation .* does not exist/i.test(rawBody) ||
			/Could not find the table .* in the schema cache/i.test(rawBody);

		if (relationMissing) {
			return null;
		}

		throw new Error(
			`Supabase runtime overlay query failed for ${sourceName} with ${response.status} ${response.statusText}: ${rawBody}`,
		);
	}

	if (!rawBody.trim()) {
		return [];
	}

	const parsed = JSON.parse(rawBody) as TokenRuntimeOverlayRestRow[];
	return Array.isArray(parsed) ? parsed : [];
}

function mapRestRowToOverlay(row: TokenRuntimeOverlayRestRow): ITokenRuntimeOverlay | null {
	const chain = row.chain;
	const chainId = normalizeNumber(row.chain_id ?? row.chainId);
	const contractAddress = normalizeString(row.contract_address ?? row.contractAddress);

	if (!chain || !chainId || !contractAddress) {
		return null;
	}

	return {
		chain,
		chainId: chainId as ITokenRuntimeOverlayLookup["chainId"],
		contractAddress: contractAddress as AddressLike,
		launchType: normalizeEnum(row.launch_type ?? row.launchType, ["native", "imported"]),
		launchPlatform: normalizeEnum(row.launch_platform ?? row.launchPlatform, ["pump", "flap", "external"]),
		ownerClaimStatus: normalizeEnum(row.owner_claim_status ?? row.ownerClaimStatus, [
			"unclaimed",
			"claimed",
			"verified",
			"disputed",
		]),
		creatorUserId: normalizeString(row.creator_user_id ?? row.creatorUserId),
		ownerWallets: normalizeOwnerWallets(row.owner_wallets ?? row.ownerWallets),
		agentCharacterConfig: normalizeAgentCharacterConfig(row.agent_character_config ?? row.agentCharacterConfig),
		cloudAgentId: normalizeString(row.cloud_agent_id ?? row.cloudAgentId),
		agentStatus: normalizeEnum(row.agent_status ?? row.agentStatus, [
			"none",
			"provisioning",
			"running",
			"suspended",
			"failed",
			"deleted",
		]),
		agentLifecycleState: normalizeEnum(row.agent_lifecycle_state ?? row.agentLifecycleState, [
			"birth",
			"live",
			"dormant",
			"reviving",
		]),
		billingMode: normalizeEnum(row.billing_mode ?? row.billingMode, [
			"owner_credits",
			"waifu_treasury_subsidy",
			"hybrid",
		]),
		infraReserveUsd: normalizeNumber(row.infra_reserve_usd ?? row.infraReserveUsd),
		lastTradeAt: normalizeDate(row.last_trade_at ?? row.lastTradeAt),
		suspendAt: normalizeDate(row.suspend_at ?? row.suspendAt),
		reviveAt: normalizeDate(row.revive_at ?? row.reviveAt),
		webUiUrl: normalizeString(row.web_ui_url ?? row.webUiUrl),
	};
}

function pickDefinedRuntimeFields(overlay: ITokenRuntimeOverlay) {
	const runtimeFields: Partial<IToken> = {};
	const entries = Object.entries(overlay) as Array<[keyof ITokenRuntimeOverlay, unknown]>;

	for (const [key, value] of entries) {
		if (key === "chain" || key === "chainId" || key === "contractAddress" || value === undefined) {
			continue;
		}

		(runtimeFields as Record<string, unknown>)[key] = value;
	}

	return runtimeFields;
}

function toPlainToken(token: IToken): IToken {
	const tokenWithSerializer = token as IToken & {
		toObject?: () => IToken;
	};

	if (typeof tokenWithSerializer.toObject === "function") {
		return tokenWithSerializer.toObject();
	}

	return token;
}

export async function fetchTokenRuntimeOverlays(lookups: ITokenRuntimeOverlayLookup[]) {
	const dedupedLookups = dedupeLookups(lookups);
	if (dedupedLookups.length === 0) {
		return [];
	}

	for (const sourceName of getSupabaseRuntimeSourceNames()) {
		try {
			const rows = await queryRuntimeSource(sourceName, dedupedLookups);
			if (rows === null) {
				continue;
			}

			return rows
				.map((row) => mapRestRowToOverlay(row))
				.filter((overlay): overlay is ITokenRuntimeOverlay => Boolean(overlay));
		} catch (error) {
			warnOnce(
				`token-runtime-overlay:query-failed:${sourceName}`,
				"Failed to read token runtime overlay from Supabase; returning Mongo-backed token payloads without runtime overlay",
				{
					sourceName,
					error: error instanceof Error ? error.message : String(error),
				},
			);
			return [];
		}
	}

	warnOnce(
		"token-runtime-overlay:missing-view",
		"Supabase token runtime overlay source was not found; returning Mongo-backed token payloads without runtime overlay",
		{
			sourcesTried: getSupabaseRuntimeSourceNames(),
		},
	);
	return [];
}

export function composeTokenWithRuntimeOverlay(token: IToken, overlay?: ITokenRuntimeOverlay | null): IToken {
	if (!overlay) {
		return token;
	}

	return {
		...toPlainToken(token),
		...pickDefinedRuntimeFields(overlay),
	};
}

export async function composeTokensWithRuntimeOverlay(tokens: IToken[]): Promise<IToken[]> {
	if (!tokens.length) {
		return tokens;
	}

	const overlays = await fetchTokenRuntimeOverlays(
		tokens.map((token) => ({
			contractAddress: token.contractAddress,
			chain: token.chain,
			chainId: token.chainId,
		})),
	);

	if (!overlays.length) {
		return tokens;
	}

	const overlayByLookupKey = new Map(overlays.map((overlay) => [normalizeLookupKey(overlay), overlay]));
	return tokens.map((token) =>
		composeTokenWithRuntimeOverlay(token, overlayByLookupKey.get(normalizeLookupKey(token))),
	);
}
