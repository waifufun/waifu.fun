import type { Address, Hex } from "viem";

import { type FourMemeClient, requireWallet } from "./client.js";

/**
 * Submit a pre-signed token creation. `createArg` + `signature` come from
 * Four.Meme's `/v1/private/token/create` REST endpoint — this wrapper does not
 * build them locally because the on-chain contract verifies the signature
 * against Four.Meme's `signer()` key.
 *
 * `value` MUST include the launch fee (0.01 BNB on mainnet) + any `preSale`
 * auto-buy amount. Caller is responsible for computing this from the API
 * response.
 */
export const createToken = async (
	client: FourMemeClient,
	args: { createArg: Hex; signature: Hex; value: bigint },
): Promise<Hex> => {
	const w = requireWallet(client);
	return w.walletClient.writeContract({
		account: w.account,
		chain: w.chain,
		address: w.addresses.tokenManager2,
		abi: w.contracts.tokenManager2.abi,
		functionName: "createToken",
		args: [args.createArg, args.signature],
		value: args.value,
	});
};

/**
 * Buy `amount` tokens, capped at `maxFunds` quote-token spend. Use for BNB-paired
 * tokens — pass `value` equal to `maxFunds` (+ safety). For BEP20-paired tokens
 * the quote token must be pre-approved to `TokenManager2` and `value` should be
 * `0n`.
 */
export const buyToken = async (
	client: FourMemeClient,
	args: {
		token: Address;
		amount: bigint;
		maxFunds: bigint;
		value?: bigint;
		to?: Address;
	},
): Promise<Hex> => {
	const w = requireWallet(client);

	if (args.to) {
		return w.walletClient.writeContract({
			account: w.account,
			chain: w.chain,
			address: w.addresses.tokenManager2,
			abi: w.contracts.tokenManager2.abi,
			functionName: "buyToken",
			args: [args.token, args.to, args.amount, args.maxFunds],
			value: args.value ?? 0n,
		});
	}

	return w.walletClient.writeContract({
		account: w.account,
		chain: w.chain,
		address: w.addresses.tokenManager2,
		abi: w.contracts.tokenManager2.abi,
		functionName: "buyToken",
		args: [args.token, args.amount, args.maxFunds],
		value: args.value ?? 0n,
	});
};

/**
 * "As Much As Possible" buy: spend exactly `funds` quote token, receive at least
 * `minAmount` tokens. Preferred entry point for BNB-denominated slippage control
 * because `value` maps 1:1 to `funds` for BNB-paired tokens.
 */
export const buyTokenAMAP = async (
	client: FourMemeClient,
	args: {
		token: Address;
		funds: bigint;
		minAmount: bigint;
		value?: bigint;
		to?: Address;
	},
): Promise<Hex> => {
	const w = requireWallet(client);

	if (args.to) {
		return w.walletClient.writeContract({
			account: w.account,
			chain: w.chain,
			address: w.addresses.tokenManager2,
			abi: w.contracts.tokenManager2.abi,
			functionName: "buyTokenAMAP",
			args: [args.token, args.to, args.funds, args.minAmount],
			value: args.value ?? 0n,
		});
	}

	return w.walletClient.writeContract({
		account: w.account,
		chain: w.chain,
		address: w.addresses.tokenManager2,
		abi: w.contracts.tokenManager2.abi,
		functionName: "buyTokenAMAP",
		args: [args.token, args.funds, args.minAmount],
		value: args.value ?? 0n,
	});
};

/**
 * X Mode buy (onlyMPC tokens). `args` is an ABI-encoded `BuyTokenParams` tuple
 * signed by Four.Meme's backend alongside a `time` deadline and `signature`.
 * This wrapper does not encode the params — that shape is owned by the
 * Four.Meme REST response.
 */
export const buyTokenSigned = async (
	client: FourMemeClient,
	args: { buyArgs: Hex; time: bigint; signature: Hex; value: bigint },
): Promise<Hex> => {
	const w = requireWallet(client);
	return w.walletClient.writeContract({
		account: w.account,
		chain: w.chain,
		address: w.addresses.tokenManager2,
		abi: w.contracts.tokenManager2.abi,
		functionName: "buyToken",
		args: [args.buyArgs, args.time, args.signature],
		value: args.value,
	});
};

/**
 * Sell with optional router-fee split. If `feeRecipient` is supplied along with a
 * non-zero `feeRate` and an `origin` routing tag, this routes through the
 * fee-aware variant; otherwise the plain `sellToken(token, amount, minFunds)` is
 * used.
 *
 * `origin` is Four.Meme's router-identifier tag — set it when the sell is
 * initiated via a third-party router (0 for direct calls).
 */
export const sellToken = async (
	client: FourMemeClient,
	args: {
		token: Address;
		amount: bigint;
		minFunds?: bigint;
		feeRate?: bigint;
		feeRecipient?: Address;
		origin?: bigint;
	},
): Promise<Hex> => {
	const w = requireWallet(client);
	const minFunds = args.minFunds ?? 0n;

	if (args.feeRecipient && args.feeRate !== undefined) {
		return w.walletClient.writeContract({
			account: w.account,
			chain: w.chain,
			address: w.addresses.tokenManager2,
			abi: w.contracts.tokenManager2.abi,
			functionName: "sellToken",
			args: [args.origin ?? 0n, args.token, args.amount, minFunds, args.feeRate, args.feeRecipient],
		});
	}

	if (args.origin !== undefined) {
		return w.walletClient.writeContract({
			account: w.account,
			chain: w.chain,
			address: w.addresses.tokenManager2,
			abi: w.contracts.tokenManager2.abi,
			functionName: "sellToken",
			args: [args.origin, args.token, args.amount, minFunds],
		});
	}

	return w.walletClient.writeContract({
		account: w.account,
		chain: w.chain,
		address: w.addresses.tokenManager2,
		abi: w.contracts.tokenManager2.abi,
		functionName: "sellToken",
		args: [args.token, args.amount, minFunds],
	});
};

/**
 * Helper3 convenience: spend BNB to buy a BEP20-quoted token (helper performs the
 * WBNB wrap + routing internally).
 */
export const buyWithEth = async (
	client: FourMemeClient,
	args: {
		token: Address;
		funds: bigint;
		minAmount: bigint;
		to?: Address;
		origin?: bigint;
		value: bigint;
	},
): Promise<Hex> => {
	const w = requireWallet(client);
	return w.walletClient.writeContract({
		account: w.account,
		chain: w.chain,
		address: w.addresses.tokenManagerHelper3,
		abi: w.contracts.helper3.abi,
		functionName: "buyWithEth",
		args: [args.origin ?? 0n, args.token, args.to ?? w.account.address, args.funds, args.minAmount],
		value: args.value,
	});
};

/**
 * Helper3 convenience: sell a BEP20-quoted token and receive BNB, with optional
 * router-fee split.
 */
export const sellForEth = async (
	client: FourMemeClient,
	args: {
		token: Address;
		amount: bigint;
		minFunds: bigint;
		feeRate: bigint;
		feeRecipient: Address;
		origin?: bigint;
	},
): Promise<Hex> => {
	const w = requireWallet(client);
	return w.walletClient.writeContract({
		account: w.account,
		chain: w.chain,
		address: w.addresses.tokenManagerHelper3,
		abi: w.contracts.helper3.abi,
		functionName: "sellForEth",
		args: [args.origin ?? 0n, args.token, args.amount, args.minFunds, args.feeRate, args.feeRecipient],
	});
};
