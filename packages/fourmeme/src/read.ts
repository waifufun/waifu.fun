import type { Address } from "viem";

import type { FourMemeClient } from "./client.js";
import type { AgentInfo, BuyQuote, SellQuote, TokenInfo, TokenInfoEx, TokenInfoEx1, TokenInfoRaw } from "./types.js";

/**
 * High-level `getTokenInfo` via TokenManagerHelper3. Works for both V1 and V2
 * tokens — the helper auto-routes based on the token's registry entry.
 */
export const getTokenInfo = async (client: FourMemeClient, tokenAddress: Address): Promise<TokenInfo> => {
	const raw = await client.publicClient.readContract({
		address: client.addresses.tokenManagerHelper3,
		abi: client.contracts.helper3.abi,
		functionName: "getTokenInfo",
		args: [tokenAddress],
	});

	const [
		version,
		tokenManager,
		quote,
		lastPrice,
		tradingFeeRate,
		minTradingFee,
		launchTime,
		offers,
		maxOffers,
		funds,
		maxFunds,
		liquidityAdded,
	] = raw as [bigint, Address, Address, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, boolean];

	return {
		version,
		tokenManager,
		quote,
		lastPrice,
		tradingFeeRate,
		minTradingFee,
		launchTime,
		offers,
		maxOffers,
		funds,
		maxFunds,
		liquidityAdded,
	};
};

/**
 * Raw storage slot read: `TokenManager2._tokenInfos(token)`. Exposes the bonding
 * curve params (k, t, template bits, status) that the higher-level helper3
 * reader does not return.
 */
export const getTokenInfoRaw = async (client: FourMemeClient, tokenAddress: Address): Promise<TokenInfoRaw> => {
	const raw = await client.publicClient.readContract({
		address: client.addresses.tokenManager2,
		abi: client.contracts.tokenManager2.abi,
		functionName: "_tokenInfos",
		args: [tokenAddress],
	});
	const [
		base,
		quote,
		template,
		totalSupply,
		maxOffers,
		maxRaising,
		launchTime,
		offers,
		funds,
		lastPrice,
		k,
		t,
		status,
	] = raw as [Address, Address, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
	return {
		base,
		quote,
		template,
		totalSupply,
		maxOffers,
		maxRaising,
		launchTime,
		offers,
		funds,
		lastPrice,
		k,
		t,
		status,
	};
};

export const getTokenInfoEx1 = async (client: FourMemeClient, tokenAddress: Address): Promise<TokenInfoEx1> => {
	const raw = await client.publicClient.readContract({
		address: client.addresses.tokenManager2,
		abi: client.contracts.tokenManager2.abi,
		functionName: "_tokenInfoEx1s",
		args: [tokenAddress],
	});
	const [launchFee, pcFee, feeSetting, blockNumber, extraFee] = raw as [bigint, bigint, bigint, bigint, bigint];
	return { launchFee, pcFee, feeSetting, blockNumber, extraFee };
};

export const getTokenInfoEx = async (client: FourMemeClient, tokenAddress: Address): Promise<TokenInfoEx> => {
	const raw = await client.publicClient.readContract({
		address: client.addresses.tokenManager2,
		abi: client.contracts.tokenManager2.abi,
		functionName: "_tokenInfoExs",
		args: [tokenAddress],
	});
	const [creator, founder, reserves] = raw as [Address, Address, bigint];
	return { creator, founder, reserves };
};

export const getTokenCount = async (client: FourMemeClient): Promise<bigint> => {
	return client.publicClient.readContract({
		address: client.addresses.tokenManager2,
		abi: client.contracts.tokenManager2.abi,
		functionName: "_tokenCount",
	}) as Promise<bigint>;
};

export const getTokenAt = async (client: FourMemeClient, index: bigint): Promise<Address> => {
	return client.publicClient.readContract({
		address: client.addresses.tokenManager2,
		abi: client.contracts.tokenManager2.abi,
		functionName: "_tokens",
		args: [index],
	}) as Promise<Address>;
};

/**
 * Returns TokenManager2's globally-set `_tokenCreator` address. Note: this is a
 * singleton storage slot, not a per-token creator lookup. For per-token creator
 * use `getTokenInfoEx(token).creator` instead.
 */
export const getGlobalTokenCreator = async (client: FourMemeClient): Promise<Address> => {
	return client.publicClient.readContract({
		address: client.addresses.tokenManager2,
		abi: client.contracts.tokenManager2.abi,
		functionName: "_tokenCreator",
	}) as Promise<Address>;
};

/**
 * Pancake pair for a migrated Four.Meme token. Returns zero address if the token
 * hasn't migrated to PCS yet.
 */
export const getPancakePair = async (client: FourMemeClient, tokenAddress: Address): Promise<Address> => {
	return client.publicClient.readContract({
		address: client.addresses.tokenManagerHelper3,
		abi: client.contracts.helper3.abi,
		functionName: "getPancakePair",
		args: [tokenAddress],
	}) as Promise<Address>;
};

/**
 * Simulate a buy. `amount` is the desired token-output amount (wei, 18-dec), `funds`
 * is an upper bound in the quote token. Pass `0n` to the side you are NOT pinning.
 *
 * Returns the tuple Four.Meme uses to size the on-chain call: `estimatedAmount`,
 * `estimatedCost`, `estimatedFee`, plus `amountMsgValue` (BNB to send) and
 * `amountApproval` (quote-token allowance the caller must grant).
 */
export const tryBuy = async (
	client: FourMemeClient,
	args: { token: Address; amount: bigint; funds: bigint },
): Promise<BuyQuote> => {
	const raw = (await client.publicClient.readContract({
		address: client.addresses.tokenManagerHelper3,
		abi: client.contracts.helper3.abi,
		functionName: "tryBuy",
		args: [args.token, args.amount, args.funds],
	})) as readonly [Address, Address, bigint, bigint, bigint, bigint, bigint, bigint];
	const [
		tokenManager,
		quote,
		estimatedAmount,
		estimatedCost,
		estimatedFee,
		amountMsgValue,
		amountApproval,
		amountFunds,
	] = raw;
	return {
		tokenManager,
		quote,
		estimatedAmount,
		estimatedCost,
		estimatedFee,
		amountMsgValue,
		amountApproval,
		amountFunds,
	};
};

export const trySell = async (client: FourMemeClient, args: { token: Address; amount: bigint }): Promise<SellQuote> => {
	const raw = (await client.publicClient.readContract({
		address: client.addresses.tokenManagerHelper3,
		abi: client.contracts.helper3.abi,
		functionName: "trySell",
		args: [args.token, args.amount],
	})) as readonly [Address, Address, bigint, bigint];
	const [tokenManager, quote, funds, fee] = raw;
	return { tokenManager, quote, funds, fee };
};

/**
 * BNB-denominated token-in/token-out calculators for BEP20-quoted tokens. These
 * go through `TOKEN_SWAP` inside the helper, so they cover the case where the
 * bonding curve is priced in a BEP20 (e.g. USDT) but the caller wants to reason
 * in BNB.
 */
export const calcEthIn = async (client: FourMemeClient, args: { token: Address; amount: bigint }): Promise<bigint> => {
	const { result } = await client.publicClient.simulateContract({
		address: client.addresses.tokenManagerHelper3,
		abi: client.contracts.helper3.abi,
		functionName: "calcEthIn",
		args: [args.token, args.amount],
	});
	return result as bigint;
};

export const calcEthOut = async (client: FourMemeClient, args: { token: Address; amount: bigint }): Promise<bigint> => {
	const { result } = await client.publicClient.simulateContract({
		address: client.addresses.tokenManagerHelper3,
		abi: client.contracts.helper3.abi,
		functionName: "calcEthOut",
		args: [args.token, args.amount],
	});
	return result as bigint;
};

export const calcTokenIn = async (
	client: FourMemeClient,
	args: { token: Address; amountEth: bigint },
): Promise<bigint> => {
	const { result } = await client.publicClient.simulateContract({
		address: client.addresses.tokenManagerHelper3,
		abi: client.contracts.helper3.abi,
		functionName: "calcTokenIn",
		args: [args.token, args.amountEth],
	});
	return result as bigint;
};

export const calcTokenOut = async (
	client: FourMemeClient,
	args: { token: Address; amountEth: bigint },
): Promise<bigint> => {
	const { result } = await client.publicClient.simulateContract({
		address: client.addresses.tokenManagerHelper3,
		abi: client.contracts.helper3.abi,
		functionName: "calcTokenOut",
		args: [args.token, args.amountEth],
	});
	return result as bigint;
};

/**
 * Back-compat alias for the task spec: a BNB-funds → token-out buy quote.
 * Internally routes through `tryBuy` with `amount=0`.
 */
export const getBuyAmount = async (
	client: FourMemeClient,
	args: { token: Address; funds: bigint },
): Promise<BuyQuote> => tryBuy(client, { token: args.token, amount: 0n, funds: args.funds });

/**
 * Back-compat alias for the task spec: a token-in → quote-out sell quote.
 * Internally routes through `trySell`.
 */
export const getSellAmount = async (
	client: FourMemeClient,
	args: { token: Address; amount: bigint },
): Promise<SellQuote> => trySell(client, args);

// -- AgentIdentifier --------------------------------------------------------

export const isAgentWallet = async (client: FourMemeClient, wallet: Address): Promise<boolean> => {
	return client.publicClient.readContract({
		address: client.addresses.agentIdentifier,
		abi: client.contracts.agentIdentifier.abi,
		functionName: "isAgent",
		args: [wallet],
	}) as Promise<boolean>;
};

export const getAgent = async (client: FourMemeClient, wallet: Address): Promise<AgentInfo> => {
	const isAgent = await isAgentWallet(client, wallet);
	return { wallet, isAgent };
};

export const getAgentNftCount = async (client: FourMemeClient): Promise<bigint> => {
	return client.publicClient.readContract({
		address: client.addresses.agentIdentifier,
		abi: client.contracts.agentIdentifier.abi,
		functionName: "nftCount",
	}) as Promise<bigint>;
};

export const getAgentNftAt = async (client: FourMemeClient, index: bigint): Promise<Address> => {
	return client.publicClient.readContract({
		address: client.addresses.agentIdentifier,
		abi: client.contracts.agentIdentifier.abi,
		functionName: "nftAt",
		args: [index],
	}) as Promise<Address>;
};

/**
 * NOTE: the Four.Meme API exposes `createArg` bytes only via the signed server
 * response from `/v1/private/token/create`. The on-chain contracts do NOT expose
 * a public `getCreateArgs(...)` view — launching without an off-chain signature
 * from Four.Meme's `signer()` key is impossible. Callers wanting that surface
 * should talk to the REST client, not this viem wrapper. Intentionally omitted.
 */
