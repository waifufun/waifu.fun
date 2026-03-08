import type { AddressLike, IToken, ITokenLookUp, SolanaNetworkIds, TChain, TChainId } from "@waifufun/types";

const rawBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
const BASE_URL = rawBaseUrl ? rawBaseUrl.replace(/\/+$/, "") : undefined;

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
	cloudAgentId?: string;
	agentStatus?: "none" | "provisioning" | "running" | "suspended" | "failed" | "deleted";
	agentLifecycleState?: "birth" | "live" | "dormant" | "reviving";
	webUiUrl?: string;
	billingMode?: "owner_credits" | "waifu_treasury_subsidy" | "hybrid";
	infraReserveUsd?: number;
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
	estimatedDailyBurn?: number;
	message?: string;
	error?: string;
}

export const fetcher = async (
	endpoint: string,
	method: "GET" | "POST" | "PUT" | "DELETE",
	body?: object | undefined,
) => {
	try {
		const response = await fetch(getApiUrl(endpoint), {
			method,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: body ? JSON.stringify(body) : null,
			credentials: "include",
		});

		if (!response.ok) {
			if (response.status === 401) {
				console.warn(`Authentication required for ${endpoint}`);
				throw createApiError({
					message: "Authentication required. Please sign in to access this data.",
					code: "HTTP",
					endpoint,
					status: response.status,
				});
			}

			const errorBody = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
			throw createApiError({
				message: errorBody?.message || errorBody?.error || `Request failed with status ${response.status}`,
				code: "HTTP",
				endpoint,
				status: response.status,
				details: errorBody,
			});
		}

		if (response.status === 204) {
			return null as any;
		}

		const result = await response.json().catch((error: unknown) => {
			throw createApiError({
				message: "API returned an invalid response.",
				code: "PARSE",
				endpoint,
				status: response.status,
				cause: error,
			});
		});
		return result;
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
	let status = apiToken.status;
	if (status === "tradable") status = "active";
	else if (status === "dex") status = "migrated";
	// "staged" and others pass through as-is

	return {
		contractAddress: apiToken.address,
		chain: apiToken.chain || "evm",
		chainId: apiToken.chainId || 56,
		name: apiToken.name,
		ticker: apiToken.symbol,
		image: apiToken.image || "/waifus/default.png",
		description: apiToken.description || "",
		price: parseFloat(apiToken.price) || 0,
		totalSupply: 0,
		marketcap: parseFloat(apiToken.marketCap) || 0,
		volume24h: parseFloat(apiToken.volume24h) || 0,
		decimals: 18,
		holders: apiToken.holders || 0,
		status,
		curveProgress: apiToken.progressPercent || 0,
		featured: apiToken.featured || false,
		socials: {},
		version: 1,
		creator: apiToken.creatorAddress,
		createdAt: apiToken.createdAt,
	} as IToken;
}

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

		const response = await fetcher(`/tokens?${queryParams.toString()}`, "GET");
		// waifu-core wraps in { ok, data: { items, total, limit } }
		const items = response?.data?.items || response?.items || [];
		return items.map(mapApiTokenToIToken);
	} catch (error) {
		console.error("Error fetching tokens:", error);
		return [];
	}
};

export const getToken = async ({ chain: _chain, chainId: _chainId, contractAddress }: ITokenLookUp) => {
	// waifu-core uses just the contract address, not chain/chainId routing
	const response = await fetcher(`/tokens/${contractAddress}`, "GET");
	const raw = response?.data || response;
	return mapApiTokenToIToken(raw);
};

export const getChartData = async ({
	chain: _chain,
	chainId: _chainId,
	contractAddress,
	timeframe: _timeframe,
	limit: _limit,
}: ITokenLookUp & {
	timeframe?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
	limit?: number;
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
	// waifu-core placeholder - returns empty for now
	try {
		const response = await fetcher(`/tokens/${contractAddress}/chart`, "GET");
		return response?.data || response || [];
	} catch (error) {
		console.warn("[waifu-core] Chart endpoint not fully implemented yet");
		return [];
	}
};

export const getTokenTrades = async ({ chain, chainId, contractAddress }: ITokenLookUp) => {
	const response = await fetcher(`/tokens/${contractAddress}/trades`, "GET");
	return response?.data?.items || response?.items || [];
};

export const authenticate = async (address: AddressLike, signature: string, chain: TChain) => {
	// waifu-core uses SIWE endpoint
	return await fetcher("/auth/siwe", "POST", {
		address,
		signature,
		message: `Sign in to waifu.fun with ${address}`, // Placeholder SIWE message
	});
};

export const generateNonce = async (address: AddressLike) => {
	// waifu-core SIWE flow doesn't have separate nonce generation
	// Frontend should generate nonce client-side or use the combined SIWE flow
	console.warn("[waifu-core] Nonce generation is client-side in SIWE flow");
	return { nonce: `waifu-${Date.now()}-${Math.random().toString(36).slice(2)}` };
};

export const getAuthStatus = async (): Promise<AuthStatusResponse> => {
	try {
		const response = await fetcher("/auth/me", "GET");
		// Map waifu-core response to expected shape
		return {
			authenticated: !!response.auth,
			wallets: {
				solana: null,
				evm: response.auth ? { address: response.auth.address } : null,
			},
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
}) => {
	try {
		return await fetcher("/launches", "POST", {
			name,
			symbol,
			description,
			imageUrl,
			inviteCode,
		});
	} catch (error) {
		// Non-blocking: the on-chain tx already succeeded, backend registration is secondary
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
}: { prompt: string; width: number; height: number; type: "audio" | "video" | "image"; contractAddress?: string }): Promise<{ mediaUrl: string }> => {
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
	const ticker = name.substring(0, 6).toUpperCase().replace(/[^A-Z]/g, "") || "WAIFU";
	const description = prompt || "A waifu.fun token";
	
	console.log("[waifu-core] Generated placeholder metadata:", { name, ticker, description });
	return { 
		metadata: { 
			name, 
			symbol: ticker, 
			description, 
			prompt: prompt || "",
			image: "" 
		} 
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

export const getWallets = async () => {
	console.warn("[waifu-core] Wallet list not implemented yet: /auth/getWallets");
	return { wallets: [] };
};

export const getPrices = async () => {
	console.warn("[waifu-core] Price feed not implemented yet: /prices");
	return {};
};

export const logOut = async (chain: TChain) => {
	console.warn("[waifu-core] Logout not implemented yet: /auth/logout");
	return { success: true };
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
		const response = await fetcher("/auth/me", "GET");
		const isAdmin = response.auth?.role === "admin" || response.auth?.role === "superadmin";
		return {
			success: true,
			isAdmin,
			adminInfo: isAdmin ? { role: response.auth.role } : undefined,
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
	console.warn("[waifu-core] Token ownership claim not implemented yet");
	return null as any;
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
	console.warn("[waifu-core] Owner token runtime not implemented yet");
	return {
		success: false,
		runtime: {},
		message: "Runtime management not available in waifu-core yet",
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
	console.warn("[waifu-core] Runtime activation not implemented yet");
	return null as any;
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
	console.warn("[waifu-core] Runtime suspension not implemented yet");
	return null as any;
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
	console.warn("[waifu-core] Runtime resume not implemented yet");
	return null as any;
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
	console.warn("[waifu-core] Owner token billing not implemented yet");
	return {
		success: false,
		message: "Billing info not available in waifu-core yet",
	};
};

// ========== LEGACY EXPORTS (deprecated — Solana RPC removed) ==========

/** @deprecated BSC uses wagmi/viem public client instead */
export const HELIUS_RPC_URL = "";

