import type { AddressLike, IToken, ITokenLookUp, TChain, TChainId } from "@autofun/types";
import { Connection } from "@solana/web3.js";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const fetcher = async (
	endpoint: string,
	method: "GET" | "POST" | "PUT" | "DELETE",
	body?: object | undefined,
) => {
	try {
		const response = await fetch(`${BASE_URL}${endpoint}`, {
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
				throw new Error("Authentication required. Please sign in to access this data.");
			}

			const errorText = (await response.json()) as { message?: string };
			throw new Error(errorText?.message);
		}

		const result = await response.json();
		return result;
	} catch (error) {
		console.error(`API Request Failed: ${endpoint}`, error);
		throw error;
	}
};

export const getTokens = async ({
	searchParams,
}: { searchParams: { [key: string]: string | string[] | number | number[] | undefined } }) => {
	try {
		const body = {
			chain: (searchParams?.chain as TChain) || undefined,
			chainId: searchParams?.chainId ? Number(searchParams.chainId) : undefined,
			page: searchParams?.page ? Number(searchParams.page) : 1,
			category: (searchParams?.category as "new" | "trending" | "featured" | "marketcap" | "about-to-bond") || "new",
			search: searchParams?.search || "",
			limit: searchParams?.limit || 50,
		};

		const response = await fetcher("/tokens", "POST", body);
		return response.docs || [];
	} catch (error) {
		console.error("Error fetching tokens:", error);
		return [];
	}
};

export const getToken = async ({ chain, chainId, contractAddress }: ITokenLookUp) => {
	return await fetcher(`/tokens/${chain}/${chainId}/${contractAddress}`, "GET");
};

export const isCurveCompleted = async ({
	chain,
	chainId,
	contractAddress,
}: ITokenLookUp): Promise<{ curveCompleted: boolean }> => {
	return await fetcher("/tokens/curve-completed", "POST", {
		chain,
		chainId,
		contractAddress,
	});
};

export const getChartData = async ({
	chain,
	chainId,
	contractAddress,
	timeframe,
	limit,
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
	return await fetcher("/tokens/chart-data", "POST", {
		chain,
		chainId,
		contractAddress,
		timeframe,
		limit,
	});
};

export const getTokenTrades = async ({ chain, chainId, contractAddress }: ITokenLookUp) => {
	return await fetcher("/tokens/trades", "POST", {
		chain,
		chainId,
		contractAddress,
	});
};

export const getAddressBalances = async ({ address }: { address: AddressLike }) => {
	return await fetcher("/tokens/balances", "POST", {
		address,
	});
};

export const getChatHistory = async ({
	room,
	contractAddress,
	chain,
	chainId,
}: { room: string; contractAddress: string; chain: TChain; chainId: string | number }) => {
	return await fetcher("/chat/history", "POST", {
		room,
		contractAddress,
		chain,
		chainId,
	});
};

export const generateImage = async ({ prompt, width, height }: { prompt: string; width: number; height: number }) => {
	return await fetcher("/generation/generate", "POST", {
		prompt,
		width,
		height,
	});
};

export const generateMetadata = async (prompt?: string) => {
	return await fetcher("/generation/generate-metadata", "POST", {
		prompt,
	});
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
	return await fetcher("/tokens/create-metadata", "POST", {
		imageUrl,
		image,
		metadata: {
			name,
			description,
			symbol,
		},
		manual,
	});
};

export const importToken = async ({ chain, chainId, contractAddress }: ITokenLookUp): Promise<IToken> => {
	return await fetcher("/tokens/import", "POST", {
		contractAddress,
		chain,
		chainId,
	});
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
	return await fetcher("/tokens/holders", "POST", {
		chain,
		chainId,
		contractAddress,
	});
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
	return await fetcher("/chat/message", "POST", {
		message,
		chain,
		chainId,
		room,
		contractAddress,
		attachment,
	});
};

export const getTransaction = async ({
	chain,
	chainId,
	txId,
}: { chain: TChain; chainId: string | number; txId: string }) => {
	return await fetcher("/transaction", "POST", {
		chain,
		chainId,
		txId,
	});
};

export const generateNonce = async (address: AddressLike) => {
	return await fetcher("/auth/generateNonce", "POST", {
		address,
	});
};

export const authenticate = async (address: AddressLike, signature: string, chain: TChain) => {
	return await fetcher("/auth/authenticate", "POST", {
		address,
		signature,
		chain,
	});
};

export const getWallets = async () => {
	return await fetcher("/auth/getWallets", "GET");
};

export const getPrices = async () => {
	return await fetcher("/prices", "POST");
};

export const logOut = async (chain: TChain) => {
	return await fetcher("/auth/logout", "POST", {
		chain,
	});
};

export const createToken = async ({
	contractAddress,
	chain,
	chainId,
	pool,
	signature,
}: {
	contractAddress: string;
	chain: TChain;
	chainId: number;
	pool?: string;
	signature?: string;
}) => {
	return await fetcher("/tokens/create", "POST", {
		contractAddress,
		chain,
		chainId,
		pool,
		signature,
	});
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
	return await fetcher("/tokens/trades", "POST", {
		chain,
		chainId,
		contractAddress,
	});
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
	return await fetcher(`/agent/connect-agent/${chain}/${chainId}/${agentId}`, "POST", {
		contractAddress,
	});
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
	return await fetcher("/agent/get-agents", "POST", { chain, chainId, contractAddress, page, limit });
};

export const uploadAvatar = async ({
	address,
	image,
}: {
	address: string;
	image?: string; // base64 image string
}) => {
	return await fetcher("/generation/upload-profile-image", "POST", {
		address,
		image,
	});
};

export const HELIUS_RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`;

export const connection = new Connection(HELIUS_RPC_URL, "confirmed");
