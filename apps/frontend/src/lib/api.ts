import type { AddressLike, IToken, ITokenLookUp, TChain } from "@autofun/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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

export const getTokens = async ({ searchParams }: { searchParams: { [key: string]: string | string[] | undefined } }) => {
	return await fetcher("/tokens", "POST", searchParams);
};

export const getToken = async ({ chain, chainId, contractAddress }: ITokenLookUp) => {
	return await fetcher("/tokens/lookup", "POST", {
		chain,
		chainId,
		contractAddress,
	});
};

export const getTokenTrades = async ({ chain, chainId, contractAddress }: ITokenLookUp) => {
	return await fetcher("/tokens/trades", "POST", {
		chain,
		chainId,
		contractAddress,
	});
};

export const getChatHistory = async ({ room, contractAddress, chain, chainId }: { room: string; contractAddress: string; chain: TChain; chainId: string | number }) => {
	return await fetcher("/chat/history", "POST", {
		room,
		contractAddress,
		chain,
		chainId,
	});
};

export const generateImage = async ({ prompt, width, height }: { prompt: string; width: number; height: number }) => {
	return await fetcher("/generation/image", "POST", {
		prompt,
		width,
		height,
	});
};

export const generateMetadata = async (prompt?: string) => {
	return await fetcher("/generation/metadata", "POST", {
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

export const getHolders = async ({ chain, chainId, contractAddress }: { 
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
	attachment 
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

export const getTransaction = async ({ chain, chainId, txId }: { chain: TChain; chainId: string | number; txId: string }) => {
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

export const getTrades = async ({ chain, chainId, contractAddress }: { 
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
