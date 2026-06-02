import type { AddressLike, IToken, ITokenLookUp, SolanaNetworkIds, TChain, TChainId } from "@waifufun/types";
import { getApiToken } from "./api-auth";

// Production waifu-core origin (matches PUBLIC_API_BASE_URL / the documented
// NEXT_PUBLIC_API_URL in .env.example). Used only as a last-resort fallback
// when neither NEXT_PUBLIC_API_URL nor API_ORIGIN is set; client-side
// production normally routes through the same-origin "/api/v1" proxy below.
const DEFAULT_API_ORIGIN = "https://api.waifu.fun";

const normalizeApiOrigin = (value?: string | null) => {
	const trimmed = value?.trim();
	if (!trimmed) return DEFAULT_API_ORIGIN;
	return trimmed.replace(/\/+$/, "");
};

const getBaseUrl = () => {
	const publicUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (publicUrl) return normalizeApiOrigin(publicUrl);

	if (typeof window === "undefined") {
		return normalizeApiOrigin(process.env.API_ORIGIN);
	}

	if (process.env.NODE_ENV === "development") {
		return "http://localhost:3100";
	}

	return "/api/v1";
};

const BASE_URL = getBaseUrl();

export type ApiErrorCode = "CONFIG" | "NETWORK" | "HTTP" | "PARSE";

export class ApiError extends Error {
	code: ApiErrorCode;
	status?: number;
	endpoint: string;
	details?: unknown;

	constructor({
		message,
		code,
		endpoint,
		status,
		details,
		cause,
	}: {
		message: string;
		code: ApiErrorCode;
		endpoint: string;
		status?: number;
		details?: unknown;
		cause?: unknown;
	}) {
		super(message);
		this.name = "ApiError";
		this.code = code;
		this.endpoint = endpoint;
		if (status !== undefined) {
			this.status = status;
		}
		if (details !== undefined) {
			this.details = details;
		}
		if (cause !== undefined) {
			Object.assign(this, { cause });
		}
	}
}

const createApiError = ({
	message,
	code,
	endpoint,
	status,
	details,
	cause,
}: {
	message: string;
	code: ApiErrorCode;
	endpoint: string;
	status?: number;
	details?: unknown;
	cause?: unknown;
}) =>
	new ApiError({
		message,
		code,
		endpoint,
		...(status !== undefined ? { status } : {}),
		...(details !== undefined ? { details } : {}),
		...(cause !== undefined ? { cause } : {}),
	});

const getApiUrl = (endpoint: string) => {
	if (!BASE_URL) {
		throw createApiError({
			message: "API host is not configured.",
			code: "CONFIG",
			endpoint,
		});
	}
	return `${BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
};

const toNumber = (value: unknown, fallback = 0) => {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

const unwrapApiData = <T = any>(payload: any): T => {
	if (payload && typeof payload === "object" && "data" in payload) {
		return payload.data as T;
	}
	return payload as T;
};

const getApiItems = (payload: any): any[] => {
	const data = unwrapApiData<any>(payload);
	if (Array.isArray(data)) return data;
	if (Array.isArray(data?.items)) return data.items;
	if (Array.isArray(payload?.items)) return payload.items;
	return [];
};

const getApiErrorMessage = (payload: any, fallback: string) => {
	const nestedError = payload?.error;
	if (typeof nestedError?.message === "string" && nestedError.message.length > 0) return nestedError.message;
	if (typeof payload?.message === "string" && payload.message.length > 0) return payload.message;
	if (typeof nestedError === "string" && nestedError.length > 0) return nestedError;
	return fallback;
};

const normalizeWalletAddress = (value: unknown) => {
	if (!value) return null;
	if (typeof value === "string") return { address: value as AddressLike };
	if (typeof value === "object" && typeof (value as { address?: unknown }).address === "string") {
		return { address: (value as { address: AddressLike }).address };
	}
	return null;
};

export const isApiUnavailableError = (error: unknown) =>
	error instanceof ApiError &&
	(error.code === "CONFIG" || error.code === "NETWORK" || (error.code === "HTTP" && (error.status ?? 0) >= 500));

export interface AuthStatusResponse {
	authenticated: boolean;
	wallets: {
		solana: { address: AddressLike } | null;
		evm: { address: AddressLike } | null;
	};
	message?: string;
}

export interface OwnerRuntimeCharacterInput {
	name?: string;
	bio?: string;
	avatar?: string;
}

export interface OwnerTokenRuntime {
	mint?: string;
	chain?: TChain;
	chainId?: TChainId;
	claimStatus?: "unclaimed" | "claimed" | "verified" | "disputed";
	claimedAt?: string | null;
	creatorWallet?: AddressLike | null;
	cloudAgentId?: string;
	agentStatus?: "none" | "provisioning" | "running" | "suspended" | "failed" | "deleted";
	agentLifecycleState?: "birth" | "live" | "dormant" | "reviving";
	webUiUrl?: string;
	billingMode?: "owner_credits" | "waifu_treasury_subsidy" | "hybrid";
	infraReserveUsd?: number;
	lastHeartbeatAt?: string | null;
	suspendedReason?: string | null;
	hasAgent?: boolean;
}

export interface OwnerTokenRuntimeResponse {
	success: boolean;
	runtime: OwnerTokenRuntime;
	message?: string;
	error?: string;
}

export interface OwnerTokenBillingResponse {
	success: boolean;
	billingMode?: "owner_credits" | "waifu_treasury_subsidy" | "hybrid";
	infraReserveUsd?: number;
	agentStatus?: "none" | "provisioning" | "running" | "suspended" | "failed" | "deleted";
	estimatedDailyBurnUsd?: number;
	currentPeriodCostUsd?: number | null;
	fundingSource?: string | null;
	message?: string;
	error?: string;
}

export interface OwnerTokenTopUpResponse {
	success: boolean;
	creditsAmount?: number;
	creditsUnit?: "usd_cents";
	checkoutUrl?: string | null;
	runtime?: OwnerTokenRuntime;
	message?: string;
	error?: string;
}

export interface TokenChatSessionResponse {
	success: boolean;
	chatUrl?: string;
	role?: "guest" | "user" | "admin";
	balanceTokens?: number | null;
	expiresInSeconds?: number;
	thresholds?: {
		guestMinTokens: number;
		userMinTokens: number;
	};
	message?: string;
	error?: string;
}

export const fetcher = async (
	endpoint: string,
	method: "GET" | "POST" | "PUT" | "DELETE",
	body?: object | undefined,
) => {
	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json",
		};

		// Inject Steward JWT if the user is authenticated via Steward.
		// Falls back to cookie-based auth (credentials: "include") when no token is set.
		const token = getApiToken();
		if (token) {
			headers.Authorization = `Bearer ${token}`;
		}

		const response = await fetch(getApiUrl(endpoint), {
			method,
			headers,
			body: body ? JSON.stringify(body) : null,
			credentials: "include",
		});

		if (response.status === 204) {
			return null as any;
		}

		let rawBody = "";
		let parsedBody: any = null;
		try {
			rawBody = await response.text();
			if (rawBody) {
				parsedBody = JSON.parse(rawBody);
			}
		} catch (error: unknown) {
			if (response.ok) {
				throw createApiError({
					message: "API returned an invalid response.",
					code: "PARSE",
					endpoint,
					status: response.status,
					cause: error,
				});
			}
			parsedBody = rawBody ? { message: rawBody } : null;
		}

		if (!response.ok) {
			if (response.status === 401) {
				console.warn(`Authentication required for ${endpoint}`);
				throw createApiError({
					message: getApiErrorMessage(parsedBody, "Authentication required. Please sign in to access this data."),
					code: "HTTP",
					endpoint,
					status: response.status,
					details: parsedBody,
				});
			}

			throw createApiError({
				message: getApiErrorMessage(parsedBody, `Request failed with status ${response.status}`),
				code: "HTTP",
				endpoint,
				status: response.status,
				details: parsedBody,
			});
		}

		if (parsedBody?.ok === false) {
			throw createApiError({
				message: getApiErrorMessage(parsedBody, "API request failed."),
				code: "HTTP",
				endpoint,
				status: response.status || 500,
				details: parsedBody,
			});
		}

		return parsedBody;
	} catch (error: unknown) {
		console.error(`API Request Failed: ${endpoint}`, error);
		if (error instanceof ApiError) {
			throw error;
		}
		throw createApiError({
			message: "Unable to reach API host.",
			code: "NETWORK",
			endpoint,
			cause: error,
		});
	}
};

// ========== WIRED TO WAIFU-CORE ==========

/** Map a waifu-core /tokens API item to the frontend IToken shape. */
function mapApiTokenToIToken(apiToken: any): IToken {
	const source = unwrapApiData<any>(apiToken) ?? {};
	let status = source.status;
	if (status === "tradable") status = "active";
	else if (status === "dex") status = "migrated";

	return {
		contractAddress: source.address || source.contractAddress || source.mint,
		chain: source.chain || "evm",
		chainId: toNumber(source.chainId, 56),
		name: source.name || "",
		ticker: source.symbol || source.ticker || "",
		image: source.image || source.imageUrl || source.logo || "/waifus/default.png",
		description: source.description || "",
		price: toNumber(source.price ?? source.priceUsd ?? source.currentPrice),
		totalSupply: toNumber(source.totalSupply),
		marketcap: toNumber(source.marketCap ?? source.marketcap),
		volume24h: toNumber(source.volume24h ?? source.volume24 ?? source.volume24H),
		decimals: toNumber(source.decimals, 18),
		holders: toNumber(source.holders),
		status,
		curveProgress: toNumber(source.progressPercent ?? source.curveProgress),
		featured: Boolean(source.featured),
		imported: Boolean(source.imported),
		socials: source.socials || {},
		version: toNumber(source.version, 1),
		creator: source.creatorAddress || source.creator || source.creatorWallet,
		createdAt: source.createdAt || source.launchDate || source.launchedAt,
		hidden: Boolean(source.hidden),
		verified: Boolean(source.verified),
		pool: source.poolAddress || source.pool,
		metadataUrl: source.metadataUrl,
		curveCompleted: source.curveCompleted,
		agentStatus: source.agentStatus,
		agentLifecycleState: source.agentLifecycleState,
		cloudAgentId: source.cloudAgentId,
		webUiUrl: source.webUiUrl,
		billingMode: source.billingMode,
		infraReserveUsd: toNumber(source.infraReserveUsd),
		hasAgent: Boolean(source.hasAgent),
		launchPlatform: source.launchPlatform,
	} as IToken;
}

const normalizeAddress = (value: unknown) =>
	String(value ?? "")
		.trim()
		.toLowerCase();

export type ChartTimeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "all";

const getChartInterval = (timeframe: ChartTimeframe = "1d") => {
	switch (timeframe) {
		case "1m":
		case "5m":
		case "15m":
			return timeframe;
		case "1h":
			return "5m";
		case "4h":
			return "15m";
		case "1d":
			return "1h";
		case "1w":
			return "4h";
		case "all":
			return "1d";
		default:
			return "1h";
	}
};

const getChartFrom = ({
	timeframe = "1d",
	createdAt,
}: {
	timeframe?: ChartTimeframe;
	createdAt?: string | Date;
}) => {
	const now = Date.now();
	const createdAtMs = createdAt ? new Date(createdAt).getTime() : Number.NaN;

	switch (timeframe) {
		case "1m":
			return new Date(now - 60 * 60 * 1000).toISOString();
		case "5m":
			return new Date(now - 6 * 60 * 60 * 1000).toISOString();
		case "15m":
			return new Date(now - 24 * 60 * 60 * 1000).toISOString();
		case "1h":
			return new Date(now - 60 * 60 * 1000).toISOString();
		case "4h":
			return new Date(now - 4 * 60 * 60 * 1000).toISOString();
		case "1d":
			return new Date(now - 24 * 60 * 60 * 1000).toISOString();
		case "1w":
			return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
		case "all":
			if (Number.isFinite(createdAtMs) && createdAtMs > 0) {
				return new Date(createdAtMs).toISOString();
			}
			return new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();
		default:
			return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
	}
};

const getChartTimestamp = (value: unknown) => {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const asNumber = Number(value);
		if (Number.isFinite(asNumber)) return asNumber;
		const asDate = Date.parse(value);
		if (Number.isFinite(asDate)) return asDate;
	}
	if (value instanceof Date) return value.getTime();
	return Number.NaN;
};

const getChartCandles = (payload: any): any[] => {
	const data = unwrapApiData<any>(payload);
	if (Array.isArray(data)) return data;
	if (Array.isArray(data?.candles)) return data.candles;
	if (Array.isArray(payload?.candles)) return payload.candles;
	return [];
};

export const getTokens = async ({
	searchParams,
}: {
	searchParams: {
		[key: string]: string | string[] | number | number[] | undefined;
	};
}) => {
	try {
		const queryParams = new URLSearchParams();

		if (searchParams?.search) {
			queryParams.append("search", String(searchParams.search));
		}
		if (searchParams?.status) {
			queryParams.append("status", String(searchParams.status));
		}
		if (searchParams?.limit) {
			queryParams.append("limit", String(searchParams.limit));
		}
		if (searchParams?.page) {
			queryParams.append("page", String(searchParams.page));
		}
		if (searchParams?.featured) {
			queryParams.append("featured", "true");
		}

		const endpoint = queryParams.size > 0 ? `/tokens?${queryParams.toString()}` : "/tokens";
		const response = await fetcher(endpoint, "GET");
		return getApiItems(response).map(mapApiTokenToIToken);
	} catch (error) {
		console.error("Error fetching tokens:", error);
		return [];
	}
};

export const getToken = async ({ chain, chainId, contractAddress }: ITokenLookUp) => {
	const directEndpoint = `/tokens/${contractAddress}`;

	try {
		const response = await fetcher(directEndpoint, "GET");
		return mapApiTokenToIToken(unwrapApiData(response));
	} catch (error) {
		if (!(error instanceof ApiError) || error.status !== 404) {
			throw error;
		}
	}

	const searchParams = new URLSearchParams({
		search: String(contractAddress),
		limit: "20",
	});
	const searchEndpoint = `/tokens?${searchParams.toString()}`;
	const response = await fetcher(searchEndpoint, "GET");
	const items = getApiItems(response);
	const lookupAddress = normalizeAddress(contractAddress);
	const matchedToken =
		items.find((item) => {
			const itemAddress = normalizeAddress(item?.address || item?.contractAddress || item?.mint);
			if (itemAddress !== lookupAddress) return false;
			if (chain && item?.chain && item.chain !== chain) return false;
			if (chainId && item?.chainId && toNumber(item.chainId) !== toNumber(chainId)) return false;
			return true;
		}) ||
		items.find((item) => normalizeAddress(item?.address || item?.contractAddress || item?.mint) === lookupAddress);

	if (!matchedToken) {
		throw createApiError({
			message: `Token ${contractAddress} not found.`,
			code: "HTTP",
			endpoint: searchEndpoint,
			status: 404,
			details: response,
		});
	}

	return mapApiTokenToIToken(matchedToken);
};

export const getChartData = async ({
	chain: _chain,
	chainId: _chainId,
	contractAddress,
	timeframe = "1d",
	limit,
	createdAt,
}: ITokenLookUp & {
	timeframe?: ChartTimeframe;
	limit?: number;
	createdAt?: string | Date;
}): Promise<
	Array<{
		timestamp: number;
		open: number;
		high: number;
		low: number;
		close: number;
		volume: number;
		volumeUSD: number;
	}>
> => {
	try {
		const queryParams = new URLSearchParams({
			interval: getChartInterval(timeframe),
			from: getChartFrom({
				timeframe,
				...(createdAt ? { createdAt } : {}),
			}),
		});

		if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
			queryParams.set("limit", String(limit));
		}

		const response = await fetcher(`/tokens/${contractAddress}/chart?${queryParams.toString()}`, "GET");

		return getChartCandles(response)
			.map((candle) => ({
				timestamp: getChartTimestamp(candle?.timestamp ?? candle?.time ?? candle?.openTime ?? candle?.bucket),
				open: toNumber(candle?.open),
				high: toNumber(candle?.high),
				low: toNumber(candle?.low),
				close: toNumber(candle?.close),
				volume: toNumber(candle?.volume),
				volumeUSD: toNumber(candle?.volumeUSD ?? candle?.volumeUsd ?? candle?.volume_usd),
			}))
			.filter((candle) => Number.isFinite(candle.timestamp));
	} catch (error) {
		console.warn("[waifu-core] Chart endpoint not fully implemented yet", error);
		return [];
	}
};

export const getTokenTrades = async ({ chain, chainId, contractAddress }: ITokenLookUp) => {
	const response = await fetcher(`/tokens/${contractAddress}/trades`, "GET");
	return getApiItems(response);
};

export const getAuthStatus = async (): Promise<AuthStatusResponse> => {
	try {
		const response = await fetcher("/auth/me", "GET");
		const data = unwrapApiData<any>(response) ?? {};
		const wallets = {
			solana: normalizeWalletAddress(data?.wallets?.solana),
			evm: normalizeWalletAddress(data?.wallets?.evm || data?.auth?.address || data?.address),
		};
		return {
			authenticated:
				typeof data?.authenticated === "boolean"
					? data.authenticated
					: Boolean(data?.auth || wallets.solana || wallets.evm),
			wallets,
			message: data?.message,
		};
	} catch (error) {
		return {
			authenticated: false,
			wallets: { solana: null, evm: null },
		};
	}
};

export const createToken = async ({
	contractAddress,
	name,
	symbol,
	description,
	imageUrl,
	chain,
	chainId,
	pool,
	signature,
	inviteCode,
}: {
	contractAddress: string;
	name: string;
	symbol: string;
	description: string;
	imageUrl?: string;
	chain: TChain;
	chainId: number;
	pool?: string;
	signature?: string;
	inviteCode?: string;
}): Promise<{ launchId: string } | null> => {
	try {
		const response = await fetcher("/launches", "POST", {
			name,
			symbol,
			description,
			imageUrl,
			inviteCode,
		});
		const data = unwrapApiData<any>(response) ?? response ?? {};
		const launchId =
			typeof data?.id === "string"
				? data.id
				: typeof data?.launchId === "string"
					? data.launchId
					: typeof data?.launch?.id === "string"
						? data.launch.id
						: typeof data?.record?.id === "string"
							? data.record.id
							: null;
		return launchId ? { launchId } : null;
	} catch (error) {
		// Surface registration failure to the caller so launch completion UX stays truthful.
		console.warn("Failed to register token with backend:", error);
		return null;
	}
};

export const getLaunchGateCheck = async (inviteCode?: string) => {
	const params = new URLSearchParams();
	if (inviteCode) params.append("inviteCode", inviteCode);
	const response = await fetcher(`/launches/gate?${params.toString()}`, "GET");
	return response?.data || response;
};

export const getAdminStats = async () => {
	// Map to admin launches for now
	try {
		const response = await fetcher("/admin/launches", "GET");
		const data = response?.data || response;
		return {
			totalTokens: data.total || 0,
			userCount: 0,
			tokenCount: data.total || 0,
			activeModerators: 0,
			volume24h: 0,
			totalUsers: 0,
			totalVolume: "0",
		};
	} catch (error) {
		return {
			totalTokens: 0,
			userCount: 0,
			tokenCount: 0,
			activeModerators: 0,
			volume24h: 0,
			totalUsers: 0,
			totalVolume: "0",
		};
	}
};

export const getAdminTokens = async (params: {
	page?: number;
	limit?: number;
	search?: string;
	sortBy?: string;
	sortOrder?: string;
	hideImported?: number;
	chain?: string;
	chainId?: string;
}) => {
	// Map to /admin/launches for now
	try {
		const response = await fetcher("/admin/launches", "GET");
		const data = response?.data || response;
		const items = data.items || [];
		const total = data.total || 0;
		const limit = params.limit || 20;
		const page = params.page || 1;
		const totalPages = Math.ceil(total / limit);

		return {
			docs: items,
			tokens: items,
			total,
			totalPages,
			page,
			limit,
		};
	} catch (error) {
		return {
			docs: [],
			tokens: [],
			total: 0,
			totalPages: 0,
			page: params.page || 1,
			limit: params.limit || 20,
		};
	}
};

// ========== STUBBED (NOT READY IN WAIFU-CORE) ==========

export const isCurveCompleted = async ({
	chain,
	chainId,
	contractAddress,
}: ITokenLookUp): Promise<{ curveCompleted: boolean }> => {
	console.warn("[waifu-core] Curve completion check not implemented yet");
	return { curveCompleted: false };
};

export const getAddressBalances = async ({
	address,
}: {
	address: AddressLike;
}) => {
	// Could potentially use on-chain RPC, but stub for now
	console.warn("[waifu-core] Address balances endpoint not implemented yet");
	return { user: null, balances: [] as any[] };
};

export const getChatHistory = async ({
	room,
	contractAddress,
	chain,
	chainId,
}: {
	room: string;
	contractAddress: string;
	chain: TChain;
	chainId: string | number;
}) => {
	console.warn("[waifu-core] Chat history not implemented yet");
	return [];
};

export const generateMedia = async ({
	prompt,
	width,
	height,
	type,
}: {
	prompt: string;
	width: number;
	height: number;
	type: "audio" | "video" | "image";
	contractAddress?: string;
}): Promise<{ mediaUrl: string }> => {
	// Generate deterministic placeholder based on prompt
	const seed = encodeURIComponent(prompt || "waifu");
	const size = Math.min(width || 512, height || 512);
	const mediaUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${seed}&size=${size}`;

	console.log("[waifu-core] Generated placeholder media:", mediaUrl);
	return { mediaUrl };
};

export const generateMediaForToken = async ({
	prompt,
	width,
	height,
	type,
	contractAddress,
	chain,
	chainId,
}: {
	prompt: string;
	width: number;
	height: number;
	type: "audio" | "video" | "image";
	contractAddress: string;
	chain: TChain;
	chainId: SolanaNetworkIds;
}): Promise<{ mediaUrl: string }> => {
	// Generate deterministic placeholder based on prompt and contract address
	const seed = encodeURIComponent(`${contractAddress}-${prompt || "waifu"}`);
	const size = Math.min(width || 512, height || 512);
	const mediaUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${seed}&size=${size}`;

	console.log("[waifu-core] Generated placeholder token media:", mediaUrl);
	return { mediaUrl };
};

export const generateMetadata = async ({
	mediaType,
	prompt,
	contractAddress,
}: { mediaType: "image" | "audio" | "video"; prompt?: string | undefined; contractAddress?: string | undefined }) => {
	// Generate basic metadata from prompt
	const name = prompt?.substring(0, 64) || "Waifu Token";
	const ticker =
		name
			.substring(0, 6)
			.toUpperCase()
			.replace(/[^A-Z]/g, "") || "WAIFU";
	const description = prompt || "A waifu.fun token";

	console.log("[waifu-core] Generated placeholder metadata:", { name, ticker, description });
	return {
		metadata: {
			name,
			symbol: ticker,
			description,
			prompt: prompt || "",
			image: "",
		},
	};
};

export const generateRemoteMetadata = async ({
	imageUrl,
	image,
	metadata: { name, description, symbol },
	manual,
}: {
	imageUrl?: string | undefined;
	image?: string | undefined;
	metadata: {
		name: string;
		description: string;
		symbol: string;
	};
	manual?: boolean | undefined;
}) => {
	// MVP: skip IPFS upload, use image URL directly as metadata reference.
	// The meta field on-chain will contain the image URL or description.
	const resolvedImage = imageUrl || image || "";
	return {
		metadataUrl: resolvedImage || `${name} - ${description}`,
		imageUrl: resolvedImage,
	};
};

export const importToken = async ({ chain, chainId, contractAddress }: ITokenLookUp): Promise<IToken> => {
	console.warn("[waifu-core] Token import not implemented yet: /tokens/import");
	throw new Error("Import feature coming soon! Check back later for this functionality.");
};

export const claimFees = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}) => {
	console.warn("[waifu-core] Fee claiming not implemented yet: /transactions/claim");
	return null as any;
};

export const getHolders = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}) => {
	console.warn("[waifu-core] Token holders not implemented yet: /tokens/holders");
	return [];
};

export const sendChatMessage = async ({
	message,
	chain,
	chainId,
	room,
	contractAddress,
	attachment,
}: {
	message: string;
	chain: TChain;
	chainId: string | number;
	room: string;
	contractAddress: string;
	attachment?: string | undefined;
}) => {
	console.warn("[waifu-core] Chat messaging not implemented yet: /chat/message");
	return null as any;
};

export const getTransaction = async ({
	chain,
	chainId,
	txId,
}: {
	chain: TChain;
	chainId: string | number;
	txId: string;
}) => {
	console.warn("[waifu-core] Transaction lookup not implemented yet");
	return null as any;
};

export const getPrices = async () => {
	console.warn("[waifu-core] Price feed not implemented yet: /prices");
	return {};
};

export const getTrades = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}) => {
	// Alias for getTokenTrades
	return getTokenTrades({ chain, chainId: chainId as any, contractAddress: contractAddress as any });
};

export const connectAgent = async ({
	agentId,
	chain,
	chainId,
	contractAddress,
}: {
	agentId: string;
	contractAddress: string;
	chain: TChain;
	chainId: TChainId;
}) => {
	console.warn("[waifu-core] Agent connection not implemented yet: /agent/connect-agent");
	return null as any;
};

export const getAgent = async ({
	chain,
	chainId,
	contractAddress,
	page = 1,
	limit = 50,
}: {
	chain: TChain;
	chainId: TChainId;
	contractAddress: string;
	page?: number;
	limit?: number;
}) => {
	console.warn("[waifu-core] Agent lookup not implemented yet: /agent/get-agents");
	return {
		docs: [],
		agents: [],
		total: 0,
		page,
		limit,
	};
};

export const uploadAvatar = async ({
	image,
}: {
	image: string;
}) => {
	console.warn("[waifu-core] Avatar upload not implemented yet: /user/upload-profile-image");
	return null as any;
};

export const getAddressPoints = async ({
	address,
}: {
	address: string;
}) => {
	console.warn("[waifu-core] Address points not implemented yet: /user/get-address-points");
	return {
		points: 0,
		totalPoints: 0,
		weeklyPoints: 0,
	};
};

export const getSwaps = async ({
	address,
	page = 1,
	limit = 25,
}: {
	address: string;
	page?: number;
	limit?: number;
}) => {
	console.warn("[waifu-core] User swaps not implemented yet: /user/get-swaps");
	return {
		docs: [] as any[],
		swaps: [] as any[],
		total: 0,
		totalDocs: 0,
		totalPages: 0,
		hasNextPage: false,
		page,
		limit,
	};
};

export const getTokensCreated = async ({
	address,
	page = 1,
	limit = 25,
}: {
	address: string;
	page?: number;
	limit?: number;
}) => {
	console.warn("[waifu-core] Tokens created lookup not implemented yet: /user/get-tokens-created");
	return {
		docs: [] as any[],
		tokens: [] as any[],
		total: 0,
		totalDocs: 0,
		totalPages: 0,
		hasNextPage: false,
		page,
		limit,
	};
};

// ========== ADMIN ENDPOINTS ==========

export const getAdminStatus = async () => {
	try {
		const response = await fetcher("/admin/status", "GET");
		const data = unwrapApiData<any>(response) ?? {};
		const isAdmin = Boolean(data?.isAdmin);
		return {
			success: data?.success ?? true,
			isAdmin,
			adminInfo: isAdmin ? data?.adminInfo : undefined,
		};
	} catch (error) {
		return {
			success: false,
			isAdmin: false,
			error: "Not authenticated or not an admin",
		};
	}
};

export const getAdminTokenStats = async () => {
	try {
		const response = await fetcher("/admin/launches", "GET");
		const data = response?.data || response;
		return {
			totalTokens: data.total || 0,
			verifiedCount: 0,
			featuredCount: 0,
			hiddenCount: 0,
			totalVolume: 0,
			totalBonded: 0,
		};
	} catch (error) {
		return {
			totalTokens: 0,
			verifiedCount: 0,
			featuredCount: 0,
			hiddenCount: 0,
			totalVolume: 0,
			totalBonded: 0,
		};
	}
};

export const getAdmins = async () => {
	console.warn("[waifu-core] Admin list not implemented yet: /admin/list");
	return [];
};

export const addAdmin = async ({
	address,
	role,
	permissions,
}: {
	address: string;
	role: string;
	permissions: string[];
}) => {
	console.warn("[waifu-core] Add admin not implemented yet: /admin/add");
	return null as any;
};

export const updateAdminPermissions = async ({
	address,
	permissions,
}: {
	address: string;
	permissions: string[];
}) => {
	console.warn("[waifu-core] Update admin permissions not implemented yet");
	return null as any;
};

export const removeAdmin = async (address: string) => {
	console.warn("[waifu-core] Remove admin not implemented yet");
	return null as any;
};

export const getAdminUsers = async ({
	search = "",
	page = 1,
	limit = 20,
}: { search?: string; page?: number; limit?: number }) => {
	console.warn("[waifu-core] Admin users list not implemented yet");
	return {
		users: [],
		total: 0,
		totalPages: 0,
		page,
		limit,
	};
};

export const suspendUser = async ({ address, suspended }: { address: string; suspended: boolean }) => {
	console.warn("[waifu-core] User suspension not implemented yet");
	return null as any;
};

export const setTokenVerified = async (tokenAddress: string, verified: boolean) => {
	console.warn("[waifu-core] Token verification not implemented yet");
	return null as any;
};

export const setTokenHidden = async ({
	chain,
	chainId,
	contractAddress,
	hidden,
}: {
	chain: string;
	chainId: string;
	contractAddress: string;
	hidden: boolean;
}) => {
	console.warn("[waifu-core] Token hidden flag not implemented yet");
	return null as any;
};

export const setTokenFeatured = async ({
	chain,
	chainId,
	contractAddress,
	featured,
}: {
	chain: string;
	chainId: string;
	contractAddress: string;
	featured: boolean;
}) => {
	console.warn("[waifu-core] Token featured flag not implemented yet");
	return null as any;
};

export const updateTokenSocials = async ({
	chain,
	chainId,
	contractAddress,
	socials,
}: {
	chain: string;
	chainId: string;
	contractAddress: string;
	socials: Record<string, string>;
}) => {
	console.warn("[waifu-core] Admin token socials update not implemented yet");
	return null as any;
};

export const updateTokenMetadata = async ({
	chain,
	chainId,
	contractAddress,
	metadata,
}: {
	chain: string;
	chainId: string;
	contractAddress: string;
	metadata: Record<string, unknown>;
}) => {
	console.warn("[waifu-core] Admin token metadata update not implemented yet");
	return null as any;
};

export const updateTokenSocialsOwner = async ({
	chain,
	chainId,
	contractAddress,
	socials,
}: {
	chain: string;
	chainId: string;
	contractAddress: string;
	socials: Record<string, string>;
}) => {
	// Map to /creators/:address PUT
	try {
		await fetcher(`/creators/${contractAddress}`, "PUT", {
			twitter: socials.twitter,
			telegram: socials.telegram,
			website: socials.website,
		});
		return { success: true };
	} catch (error) {
		console.error("Failed to update token socials:", error);
		return null as any;
	}
};

export const claimTokenOwnership = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}) => {
	return fetcher(`/owner/tokens/${chain}/${chainId}/${contractAddress}/claim`, "POST");
};

export const getOwnerTokenRuntime = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}): Promise<OwnerTokenRuntimeResponse> => {
	const response = await fetcher(`/owner/tokens/${chain}/${chainId}/${contractAddress}/runtime`, "GET");
	const data = unwrapApiData<any>(response) ?? response ?? {};
	const runtimeSource = unwrapApiData<any>(data?.runtime) ?? data?.runtime ?? {};
	return {
		success: data?.success !== false,
		runtime: {
			mint: runtimeSource?.mint,
			chain: runtimeSource?.chain,
			chainId: runtimeSource?.chainId,
			claimStatus: runtimeSource?.claimStatus,
			claimedAt: runtimeSource?.claimedAt ?? null,
			creatorWallet: runtimeSource?.creatorWallet ?? null,
			cloudAgentId: runtimeSource?.cloudAgentId,
			agentStatus: runtimeSource?.agentStatus,
			agentLifecycleState: runtimeSource?.agentLifecycleState,
			webUiUrl: runtimeSource?.webUiUrl,
			billingMode: runtimeSource?.billingMode,
			infraReserveUsd:
				typeof runtimeSource?.infraReserveUsd === "number"
					? runtimeSource.infraReserveUsd
					: toNumber(runtimeSource?.infraReserveUsd, Number.NaN),
			lastHeartbeatAt: runtimeSource?.lastHeartbeatAt ?? null,
			suspendedReason: runtimeSource?.suspendedReason ?? null,
			hasAgent: Boolean(runtimeSource?.hasAgent ?? runtimeSource?.cloudAgentId),
		},
		message: data?.message,
		error: data?.error,
	};
};

export const getTokenChatSession = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}): Promise<TokenChatSessionResponse> => {
	const response = await fetcher(`/owner/tokens/${chain}/${chainId}/${contractAddress}/chat-session`, "GET");
	const data = unwrapApiData<any>(response) ?? response ?? {};
	return {
		success: data?.success !== false,
		chatUrl: data?.chatUrl,
		role: data?.role,
		balanceTokens: typeof data?.balanceTokens === "number" ? data.balanceTokens : (data?.balanceTokens ?? null),
		expiresInSeconds: typeof data?.expiresInSeconds === "number" ? data.expiresInSeconds : undefined,
		thresholds: data?.thresholds,
		message: data?.message,
		error: data?.error,
	};
};

export const activateOwnerTokenRuntime = async ({
	chain,
	chainId,
	contractAddress,
	billingMode,
	character,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
	billingMode?: OwnerTokenRuntime["billingMode"];
	character?: OwnerRuntimeCharacterInput;
}) => {
	return fetcher(`/owner/tokens/${chain}/${chainId}/${contractAddress}/runtime/activate`, "POST", {
		...(billingMode ? { billingMode } : {}),
		...(character ? { character } : {}),
	});
};

export const suspendOwnerTokenRuntime = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}) => {
	return fetcher(`/owner/tokens/${chain}/${chainId}/${contractAddress}/runtime/suspend`, "POST");
};

export const resumeOwnerTokenRuntime = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}) => {
	return fetcher(`/owner/tokens/${chain}/${chainId}/${contractAddress}/runtime/resume`, "POST");
};

export const restartOwnerTokenRuntime = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}) => {
	return fetcher(`/owner/tokens/${chain}/${chainId}/${contractAddress}/runtime/restart`, "POST");
};

export const topUpOwnerTokenRuntime = async ({
	chain,
	chainId,
	contractAddress,
	amountUsdCents = 500,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
	amountUsdCents?: number;
}): Promise<OwnerTokenTopUpResponse> => {
	const response = await fetcher(`/owner/tokens/${chain}/${chainId}/${contractAddress}/billing/top-up`, "POST", {
		amountUsdCents,
	});
	const data = unwrapApiData<any>(response) ?? response ?? {};
	const runtimeSource = unwrapApiData<any>(data?.runtime) ?? data?.runtime;
	const result: OwnerTokenTopUpResponse = {
		success: data?.success !== false,
		message: data?.message,
		error: data?.error,
	};
	if (typeof data?.creditsAmount === "number") result.creditsAmount = data.creditsAmount;
	if (data?.creditsUnit === "usd_cents") result.creditsUnit = "usd_cents";
	if (typeof data?.checkoutUrl === "string") result.checkoutUrl = data.checkoutUrl;
	else if (typeof data?.checkout?.url === "string") result.checkoutUrl = data.checkout.url;
	else if (typeof data?.checkout?.checkoutUrl === "string") result.checkoutUrl = data.checkout.checkoutUrl;
	if (runtimeSource) {
		result.runtime = {
			mint: runtimeSource?.mint,
			chain: runtimeSource?.chain,
			chainId: runtimeSource?.chainId,
			claimStatus: runtimeSource?.claimStatus,
			claimedAt: runtimeSource?.claimedAt ?? null,
			creatorWallet: runtimeSource?.creatorWallet ?? null,
			cloudAgentId: runtimeSource?.cloudAgentId,
			agentStatus: runtimeSource?.agentStatus,
			agentLifecycleState: runtimeSource?.agentLifecycleState,
			webUiUrl: runtimeSource?.webUiUrl,
			billingMode: runtimeSource?.billingMode,
			infraReserveUsd:
				typeof runtimeSource?.infraReserveUsd === "number"
					? runtimeSource.infraReserveUsd
					: toNumber(runtimeSource?.infraReserveUsd, Number.NaN),
			lastHeartbeatAt: runtimeSource?.lastHeartbeatAt ?? null,
			suspendedReason: runtimeSource?.suspendedReason ?? null,
			hasAgent: Boolean(runtimeSource?.hasAgent ?? runtimeSource?.cloudAgentId),
		};
	}
	return result;
};

export const getOwnerTokenBilling = async ({
	chain,
	chainId,
	contractAddress,
}: {
	chain: TChain;
	chainId: string | number;
	contractAddress: string;
}): Promise<OwnerTokenBillingResponse> => {
	const response = await fetcher(`/owner/tokens/${chain}/${chainId}/${contractAddress}/billing`, "GET");
	const data = unwrapApiData<any>(response) ?? response ?? {};
	const estimatedDailyBurnUsd =
		typeof data?.estimatedDailyBurnUsd === "number"
			? data.estimatedDailyBurnUsd
			: typeof data?.estimatedDailyBurn === "number"
				? data.estimatedDailyBurn
				: undefined;
	return {
		success: data?.success !== false,
		billingMode: data?.billingMode,
		infraReserveUsd:
			typeof data?.infraReserveUsd === "number" ? data.infraReserveUsd : toNumber(data?.infraReserveUsd, Number.NaN),
		agentStatus: data?.agentStatus,
		estimatedDailyBurnUsd,
		currentPeriodCostUsd:
			typeof data?.currentPeriodCostUsd === "number" ? data.currentPeriodCostUsd : (data?.currentPeriodCostUsd ?? null),
		fundingSource: typeof data?.fundingSource === "string" ? data.fundingSource : null,
		message: data?.message,
		error: data?.error,
	};
};

// ========== AGENT PROVISIONING ==========

export interface AgentAvailability {
	totalSlots: number;
	availableSlots: number;
	nodes: Array<{ id: string; name: string; capacity: number; used: number }>;
}

export interface AgentCreateInput {
	agentName: string;
	agentBio?: string | undefined;
	tokenAddress?: string | undefined;
	platforms?: string[] | undefined;
	config?: Record<string, unknown> | undefined;
}

export type ProvisioningJobState = "queued" | "requested" | "provisioning" | "running" | "completed" | "failed";

export interface AgentProvisionRequest {
	tokenAddress: string;
	agentName: string;
	chain?: TChain;
	chainId?: number;
	tokenName?: string;
	tokenTicker?: string;
	launchId?: string;
	agentConfig?: {
		bio?: string;
		avatar?: string;
		config?: Record<string, unknown>;
	};
}

export interface AgentProvisionResponse {
	jobId: string;
	status: ProvisioningJobState;
	cloudAgentId?: string;
	message?: string;
	webUiUrl?: string;
}

export interface AgentProvisionStatusResponse {
	jobId: string;
	status: ProvisioningJobState;
	cloudAgentId?: string;
	progress?: number;
	message?: string;
	webUiUrl?: string;
}

export interface AgentCreateResponse {
	agentId: string;
	jobId: string;
}

export interface AgentStatus {
	agentId: string;
	agentName: string;
	status: "queued" | "provisioning" | "running" | "stopped" | "failed" | "deleted";
	tokenAddress?: string;
	containerUrl?: string;
	webUiUrl?: string;
	platforms?: string[];
	createdAt?: string;
	updatedAt?: string;
}

export interface AgentJobStatus {
	jobId: string;
	state: "queued" | "provisioning" | "running" | "completed" | "failed";
	progress?: number;
	message?: string;
}

export interface UserAgent {
	agentId: string;
	agentName: string;
	status: "queued" | "provisioning" | "running" | "stopped" | "failed" | "deleted";
	tokenAddress?: string;
	containerUrl?: string;
	webUiUrl?: string;
	platforms?: string[];
	createdAt?: string;
}

export const getAgentAvailability = async (): Promise<AgentAvailability> => {
	const response = await fetcher("/agents/availability", "GET");
	return response?.data || response;
};

export const provisionAgent = async (data: AgentProvisionRequest): Promise<AgentProvisionResponse> => {
	const response = await fetcher("/agents/provision", "POST", data);
	return response?.data || response;
};

export const getProvisioningStatus = async (jobId: string): Promise<AgentProvisionStatusResponse> => {
	const response = await fetcher(`/agents/provision-status/${encodeURIComponent(jobId)}`, "GET");
	return response?.data || response;
};

export const createAgentForToken = async (data: AgentCreateInput): Promise<AgentCreateResponse> => {
	const response = await fetcher("/agents", "POST", data);
	return response?.data || response;
};

export const getAgentStatus = async (agentId: string): Promise<AgentStatus> => {
	const response = await fetcher(`/agents/${agentId}`, "GET");
	return response?.data || response;
};

export const getAgentJobStatus = async (jobId: string): Promise<AgentJobStatus> => {
	const response = await fetcher(`/jobs/${jobId}`, "GET");
	return response?.data || response;
};

export const getUserAgents = async (): Promise<UserAgent[]> => {
	const response = await fetcher("/agents", "GET");
	return response?.data?.items || response?.data || response?.items || [];
};

export const getAgentByToken = async (tokenAddress: string): Promise<AgentStatus | null> => {
	try {
		const response = await fetcher(`/agents/by-token/${tokenAddress}`, "GET");
		return response?.data || response || null;
	} catch (error) {
		if (error instanceof ApiError && error.status === 404) return null;
		throw error;
	}
};

export const restartAgent = async (agentId: string): Promise<void> => {
	await fetcher(`/agents/${agentId}/restart`, "POST");
};

export const stopAgent = async (agentId: string): Promise<void> => {
	await fetcher(`/agents/${agentId}/stop`, "POST");
};

export const deleteAgent = async (agentId: string): Promise<void> => {
	await fetcher(`/agents/${agentId}`, "DELETE");
};

// ========== LEGACY EXPORTS (deprecated: Solana RPC removed) ==========

/** @deprecated BSC uses wagmi/viem public client instead */
export const HELIUS_RPC_URL = "";
