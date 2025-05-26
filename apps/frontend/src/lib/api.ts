import type { AddressLike, IToken, ITokenLookUp, TChain, TChatRooms } from "@autofun/types";

const BASE_URL = "http://localhost:3001";

export const fetcher = async (endpoint: string, method: "GET" | "POST" | "PUT" | "DELETE", body?: object) => {
	try {
		const response = await fetch(`${BASE_URL}${endpoint}`, {
			method,
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: body ? JSON.stringify(body) : undefined,
			credentials: "include",
		});

		if (!response.ok) {
			if (response.status === 401) {
				console.warn(`Authentication required for ${endpoint}`);
				throw new Error("Authentication required. Please sign in to access this data.");
			}

			const errorText = await response.text();
			console.error(`API Error (${response.status}): ${errorText}`);
			throw new Error(`${response.statusText}: ${errorText}`);
		}

		const result = await response.json();
		return result;
	} catch (error) {
		console.error(`API Request Failed: ${endpoint}`, error);
		throw error;
	}
};

export const getTokens = async ({ searchParams }) => {
	return await fetcher("/tokens", "POST", searchParams);
};

export const getToken = async ({ chain, chainId, contractAddress }: ITokenLookUp): Promise<IToken> => {
	return await fetcher(`/tokens/${chain}/${chainId}/${contractAddress}`, "GET");
};

export const importToken = async ({ chain, chainId, contractAddress }: ITokenLookUp): Promise<IToken> => {
	return await fetcher("/tokens/import", "POST", {
		contractAddress,
		chain,
		chainId,
	});
};

export const getTrades = async ({ chain, chainId, contractAddress }) => {
	return await fetcher("/tokens/trades", "POST", {
		chain,
		chainId,
		contractAddress,
	});
};

export const getHolders = async ({ chain, chainId, contractAddress }) => {
	return await fetcher("/tokens/holders", "POST", {
		chain,
		chainId,
		contractAddress,
	});
};

export const getChatHistory = async ({ room, contractAddress }) => {
	return await fetcher("/chat/history", "POST", {
		room,
		contractAddress,
	});
};

export const sendChatMessage = async ({
	message,
	room,
	contractAddress,
}: { message: string; room: TChatRooms; contractAddress: AddressLike }) => {
	return await fetcher("/chat/message", "POST", {
		message,
		room,
		contractAddress,
	});
};

export const getTransaction = async ({ chain, chainId, txId }) => {
	return await fetcher("/transactions/get-transaction", "POST", {
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

export const generateMetadata = async (prompt?: string) => {
	return await fetcher("/generation/generate-metadata", "POST", {
		prompt
	});
}

export const generateImage = async (body: object) => {
	return await fetcher("/generation/generate", "POST", body);
}

export const generateRemoteMetadata = async (
    {
        imageUrl,
        image,
        metadata: {
            name,
            description,
            symbol,
        },
        manual
    }: {
        imageUrl?: string | undefined; // Allow undefined
        image?: string | undefined;   // Allow undefined
        metadata: {
            name: string;
            description: string;
            symbol: string;
        };
        manual?: boolean | undefined; // Allow undefined
    }
) => {
    return await fetcher("/tokens/create-metadata", "POST", {
        imageUrl,
        image,
        metadata: {
            name,
            description,
            symbol,
        },
        manual
    });
}

export const createToken = async(
	{
		contractAddress,
		chain,
		chainId,
		pool,
		signature
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
		signature
	})
}