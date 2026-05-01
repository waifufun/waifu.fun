import type { Address, Hex } from "viem";

/**
 * Token status values returned by `TokenManager2._tokenInfos(address).status` and
 * reflected in Four.Meme's API. Numeric values match the on-chain constants
 * `STATUS_TRADING / STATUS_HALT / STATUS_ADDING_LIQUIDITY / STATUS_COMPLETED`.
 * Actual numeric values must be read from the contract at runtime — they are not
 * fixed in the ABI surface.
 */
export enum FourMemeTokenStatus {
	Trading = 0,
	Halt = 1,
	AddingLiquidity = 2,
	Completed = 3,
}

/** Four.Meme creator-type taxonomy (subset of `template` field, bits 10..15). */
export enum FourMemeCreatorType {
	Standard = 0,
	/** `creatorType = 5` → in-protocol tax/reflection token (see `TaxToken.abi.json`). */
	TaxToken = 5,
}

/** Four.Meme API labels accepted by `/v1/private/token/create`. */
export type FourMemeLabel =
	| "Meme"
	| "AI"
	| "Defi"
	| "Games"
	| "Infra"
	| "De-Sci"
	| "Social"
	| "Depin"
	| "Charity"
	| "Others";

/**
 * Tax-token config shape from Four.Meme's API (creatorType=5 only).
 * Rates are percentage integers that MUST sum to 100.
 */
export interface FourMemeTokenTaxInfo {
	feeRate: 1 | 3 | 5 | 10;
	burnRate: number;
	divideRate: number;
	liquidityRate: number;
	recipientRate: number;
	recipientAddress: Address;
	/** `d * 10^n` with `n >= 5` and `1 <= d <= 9` per Four.Meme API rules. */
	minSharing: bigint | string;
}

/**
 * Four.Meme `/v1/public/config` raised-token entry. Exact schema is server-owned;
 * we model the fields that feed into the create payload. Treat unknown keys as
 * opaque passthroughs.
 */
export interface FourMemeRaisedTokenConfig {
	symbol?: string;
	address?: Address;
	[key: string]: unknown;
}

/**
 * High-level create params accepted by the Four.Meme REST API. The on-chain
 * `createToken(bytes args, bytes signature)` call consumes the pre-signed
 * `{ createArg, signature }` tuple returned from the API — these params are not
 * passed on-chain directly. Kept here so waifu backend code has one canonical
 * shape to build toward before signing.
 */
export interface CreateTokenParams {
	name: string;
	shortName: string;
	desc: string;
	imgUrl: string;
	launchTime: number;
	label: FourMemeLabel;
	lpTradingFee?: number;
	webUrl?: string;
	twitterUrl?: string;
	telegramUrl?: string;
	/** Creator auto-buy at launch, denominated in BNB (e.g. "0.1"). */
	preSale?: string;
	/** X Mode: Binance-MPC-only trading bucket. */
	onlyMPC?: boolean;
	/** AntiSniper dynamic-fee decay. */
	feePlan?: boolean;
	tokenTaxInfo?: FourMemeTokenTaxInfo | null;
	raisedToken?: FourMemeRaisedTokenConfig;
}

/**
 * Tuple returned by Four.Meme's `/v1/private/token/create` endpoint. Consumed
 * directly by `TokenManager2.createToken(args, signature)`.
 */
export interface CreateTokenSignedPayload {
	createArg: Hex;
	signature: Hex;
}

/** Flattened shape of `TokenManagerHelper3.getTokenInfo(address)`. */
export interface TokenInfo {
	version: bigint;
	tokenManager: Address;
	quote: Address;
	lastPrice: bigint;
	tradingFeeRate: bigint;
	minTradingFee: bigint;
	launchTime: bigint;
	offers: bigint;
	maxOffers: bigint;
	funds: bigint;
	maxFunds: bigint;
	liquidityAdded: boolean;
}

/** Flattened shape of `TokenManager2._tokenInfos(address)`. */
export interface TokenInfoRaw {
	base: Address;
	quote: Address;
	template: bigint;
	totalSupply: bigint;
	maxOffers: bigint;
	maxRaising: bigint;
	launchTime: bigint;
	offers: bigint;
	funds: bigint;
	lastPrice: bigint;
	k: bigint;
	t: bigint;
	status: bigint;
}

/** `TokenManager2._tokenInfoEx1s(address)`. */
export interface TokenInfoEx1 {
	launchFee: bigint;
	pcFee: bigint;
	feeSetting: bigint;
	blockNumber: bigint;
	extraFee: bigint;
}

/** `TokenManager2._tokenInfoExs(address)`. */
export interface TokenInfoEx {
	creator: Address;
	founder: Address;
	reserves: bigint;
}

/** `TokenManagerHelper3.tryBuy(token, amount, funds)`. */
export interface BuyQuote {
	tokenManager: Address;
	quote: Address;
	estimatedAmount: bigint;
	estimatedCost: bigint;
	estimatedFee: bigint;
	amountMsgValue: bigint;
	amountApproval: bigint;
	amountFunds: bigint;
}

/** `TokenManagerHelper3.trySell(token, amount)`. */
export interface SellQuote {
	tokenManager: Address;
	quote: Address;
	funds: bigint;
	fee: bigint;
}

/** Minimal agent record derived from AgentIdentifier + upstream Four.Meme API. */
export interface AgentInfo {
	wallet: Address;
	isAgent: boolean;
	/** `balanceOf` across registered agent NFTs, if available. Not fetched by default. */
	nftHolding?: bigint;
}

// -- Event payloads ---------------------------------------------------------

export interface TokenCreateEvent {
	creator: Address;
	token: Address;
	requestId: bigint;
	name: string;
	symbol: string;
	totalSupply: bigint;
	launchTime: bigint;
	launchFee: bigint;
}

export interface TokenPurchaseEvent {
	token: Address;
	account: Address;
	price: bigint;
	amount: bigint;
	cost: bigint;
	fee: bigint;
	offers: bigint;
	funds: bigint;
}

export interface TokenSaleEvent {
	token: Address;
	account: Address;
	price: bigint;
	amount: bigint;
	cost: bigint;
	fee: bigint;
	offers: bigint;
	funds: bigint;
}

export interface LiquidityAddedEvent {
	base: Address;
	offers: bigint;
	quote: Address;
	funds: bigint;
}

export interface LpLockEvent {
	token: Address;
	nftId: bigint;
	lockId: bigint;
}
