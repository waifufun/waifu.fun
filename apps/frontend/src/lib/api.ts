import type { IToken, ITokenLookUp } from "@autofun/types";

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

export const getHolders = async ({ chain, chainId, contractAddress }) => {
	return await fetcher("/tokens/holders", "POST", { chain, chainId, contractAddress });
};
