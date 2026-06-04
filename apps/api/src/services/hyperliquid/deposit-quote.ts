import { encodeFunctionData, getAddress, isAddress } from "viem";
import { type LifiBridgeKey, checkConditionalRules, isBridgeAllowed } from "../lifi/allowlist.js";
import { LIFI_INTEGRATOR_FEE, LIFI_SLIPPAGE_CAP, type LifiClient, type LifiQuoteResponse } from "../lifi/client.js";

export const HYPERLIQUID_ARBITRUM_CHAIN_ID = 42_161;
export const ARBITRUM_USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
export const HYPERLIQUID_ARBITRUM_BRIDGE = "0x2df1c51e09aECF9CaCb7bC98cB1742757f163dF7";
export const HYPERLIQUID_MIN_DEPOSIT_USDC_ATOMS = 5_000_000n;

const TOKEN_RE = /^(0x[0-9a-fA-F]{40}|NATIVE)$/i;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const AMOUNT_RE = /^[0-9]+$/;

const ERC20_ABI = [
	{
		type: "function",
		name: "transfer",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
	},
	{
		type: "function",
		name: "approve",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "spender", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
	},
] as const;

export type HyperliquidDepositQuoteInput = {
	fromChain: number;
	fromToken: string;
	fromAmount: string;
	fromAddress: string;
};

export type HyperliquidDepositTx = {
	kind: "hyperliquid-usdc-deposit";
	to: string;
	from: string;
	value: "0";
	data: `0x${string}`;
	chainId: typeof HYPERLIQUID_ARBITRUM_CHAIN_ID;
	amount: string;
	token: string;
	bridge: string;
};

export type PreparedTransaction = {
	to: string;
	from: string | null;
	value: string | null;
	data: string;
	chainId: number;
	gasLimit: string | null;
};

export type HyperliquidBridgeQuote = {
	kind: "lifi-bridge-to-arbitrum-usdc";
	fromChain: number;
	toChain: typeof HYPERLIQUID_ARBITRUM_CHAIN_ID;
	fromToken: string;
	toToken: string;
	fromAmount: string;
	toAmount: string;
	toAmountMin: string;
	tool: string;
	approvalAddress: string | null;
	approvalTx: PreparedTransaction | null;
	transactionRequest: PreparedTransaction | null;
	raw: LifiQuoteResponse;
};

export type HyperliquidDepositQuote = {
	mode: "patron-owns-hyperliquid-account";
	patronAddress: string;
	depositAccount: string;
	moneyPath: string[];
	bridgeQuote: HyperliquidBridgeQuote | null;
	depositTx: HyperliquidDepositTx;
	integrator: {
		name: "waifu";
		feeBps: number;
		slippageBps: number;
	};
	warnings: string[];
};

export class HyperliquidDepositQuoteError extends Error {
	readonly code: string;
	readonly status: number;
	constructor(code: string, message: string, status = 400) {
		super(message);
		this.name = "HyperliquidDepositQuoteError";
		this.code = code;
		this.status = status;
	}
}

export type HyperliquidDepositQuoteDeps = {
	lifi?: Pick<LifiClient, "getQuote"> | null;
};

function validateInput(input: HyperliquidDepositQuoteInput): { fromToken: string; fromAddress: string } {
	if (!Number.isFinite(input.fromChain) || input.fromChain <= 0) {
		throw new HyperliquidDepositQuoteError("CHAIN_NOT_SUPPORTED", "fromChain must be a positive chain id");
	}
	if (!TOKEN_RE.test(input.fromToken)) {
		throw new HyperliquidDepositQuoteError("INVALID_TOKEN", "fromToken must be NATIVE or a 0x token address");
	}
	if (!AMOUNT_RE.test(input.fromAmount) || input.fromAmount === "0") {
		throw new HyperliquidDepositQuoteError("INVALID_AMOUNT", "fromAmount must be a positive integer string");
	}
	if (!isAddress(input.fromAddress)) {
		throw new HyperliquidDepositQuoteError("INVALID_FROM_ADDRESS", "fromAddress must be a valid EVM address");
	}
	const token =
		input.fromToken.toUpperCase() === "NATIVE" || input.fromToken.toLowerCase() === ZERO_ADDRESS
			? "NATIVE"
			: getAddress(input.fromToken);
	return {
		fromToken: token,
		fromAddress: getAddress(input.fromAddress),
	};
}

function sameToken(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

function withinSlippage(toAmount: string, toAmountMin: string): boolean {
	try {
		const a = BigInt(toAmount);
		const min = BigInt(toAmountMin);
		if (a === 0n) return false;
		const diff = a > min ? a - min : 0n;
		return diff * 1000n <= a * 5n;
	} catch {
		return false;
	}
}

function assertMinDeposit(amount: string): void {
	let parsed: bigint;
	try {
		parsed = BigInt(amount);
	} catch {
		throw new HyperliquidDepositQuoteError("INVALID_DEPOSIT_AMOUNT", "deposit amount is not an integer atom string");
	}
	if (parsed < HYPERLIQUID_MIN_DEPOSIT_USDC_ATOMS) {
		throw new HyperliquidDepositQuoteError(
			"DEPOSIT_TOO_SMALL",
			"Hyperliquid requires at least 5 USDC. Increase the source amount and retry.",
		);
	}
}

function isNativeToken(token: string): boolean {
	return token.toUpperCase() === "NATIVE" || token.toLowerCase() === ZERO_ADDRESS;
}

function shapeBridgeQuote(raw: LifiQuoteResponse): HyperliquidBridgeQuote {
	const tx = raw.transactionRequest;
	const approvalAddress = raw.estimate.approvalAddress ?? null;
	const approvalTx =
		approvalAddress && !isNativeToken(raw.action.fromToken.address)
			? {
					to: getAddress(raw.action.fromToken.address),
					from: raw.action.fromAddress ? getAddress(raw.action.fromAddress) : null,
					value: "0",
					data: encodeFunctionData({
						abi: ERC20_ABI,
						functionName: "approve",
						args: [getAddress(approvalAddress), BigInt(raw.estimate.fromAmount)],
					}),
					chainId: raw.action.fromChainId,
					gasLimit: null,
				}
			: null;
	return {
		kind: "lifi-bridge-to-arbitrum-usdc",
		fromChain: raw.action.fromChainId,
		toChain: HYPERLIQUID_ARBITRUM_CHAIN_ID,
		fromToken: raw.action.fromToken.address,
		toToken: raw.action.toToken.address,
		fromAmount: raw.estimate.fromAmount,
		toAmount: raw.estimate.toAmount,
		toAmountMin: raw.estimate.toAmountMin,
		tool: raw.tool,
		approvalAddress,
		approvalTx,
		transactionRequest: tx
			? {
					to: tx.to,
					from: tx.from ?? null,
					value: tx.value ?? null,
					data: tx.data,
					chainId: tx.chainId ?? raw.action.fromChainId,
					gasLimit: tx.gasLimit ?? null,
				}
			: null,
		raw,
	};
}

function validateBridgeTool(tool: string, ctx: Parameters<typeof checkConditionalRules>[1], step = false): void {
	if (!isBridgeAllowed(tool)) {
		throw new HyperliquidDepositQuoteError(
			step ? "BRIDGE_STEP_NOT_ALLOWED" : "BRIDGE_NOT_ALLOWED",
			step ? `Li.Fi included a non-allowlisted step: ${tool}` : `Li.Fi returned non-allowlisted bridge: ${tool}`,
		);
	}
	const conditional = checkConditionalRules(tool as LifiBridgeKey, ctx);
	if (conditional) {
		throw new HyperliquidDepositQuoteError(
			step ? "BRIDGE_STEP_REFUSED" : "ROUTE_REFUSED",
			step
				? `Li.Fi included a step refused by conditional policy (${conditional})`
				: `route refused by conditional policy (${conditional})`,
		);
	}
}

function validateLifiRoute(raw: LifiQuoteResponse, patronAddress: string): void {
	const routeCtx = {
		fromChain: raw.action.fromChainId,
		toChain: raw.action.toChainId,
		fromTokenSymbol: raw.action.fromToken.symbol,
		toTokenSymbol: raw.action.toToken.symbol,
		estimatedUsd: Number.parseFloat(raw.estimate.fromAmountUSD ?? ""),
	};
	validateBridgeTool(raw.tool, routeCtx);
	for (const step of raw.includedSteps ?? []) {
		validateBridgeTool(step.tool, routeCtx, true);
	}
	if (raw.action.toChainId !== HYPERLIQUID_ARBITRUM_CHAIN_ID) {
		throw new HyperliquidDepositQuoteError("DESTINATION_CHAIN_MISMATCH", "Li.Fi route did not end on Arbitrum");
	}
	if (!sameToken(raw.action.toToken.address, ARBITRUM_USDC_ADDRESS)) {
		throw new HyperliquidDepositQuoteError("DESTINATION_TOKEN_MISMATCH", "Li.Fi route did not end in Arbitrum USDC");
	}
	if (raw.action.toAddress.toLowerCase() !== patronAddress.toLowerCase()) {
		throw new HyperliquidDepositQuoteError(
			"RECIPIENT_MISMATCH",
			"Li.Fi route recipient must be the patron wallet so Hyperliquid credits the patron account",
		);
	}
	if (!withinSlippage(raw.estimate.toAmount, raw.estimate.toAmountMin)) {
		throw new HyperliquidDepositQuoteError(
			"SLIPPAGE_EXCEEDED",
			`quoted slippage exceeds the ${LIFI_SLIPPAGE_CAP * 100}% cap. refresh and retry.`,
		);
	}
}

function buildDepositTransfer(fromAddress: string, amount: string): HyperliquidDepositTx {
	assertMinDeposit(amount);
	return {
		kind: "hyperliquid-usdc-deposit",
		to: getAddress(ARBITRUM_USDC_ADDRESS),
		from: getAddress(fromAddress),
		value: "0",
		data: encodeFunctionData({
			abi: ERC20_ABI,
			functionName: "transfer",
			args: [getAddress(HYPERLIQUID_ARBITRUM_BRIDGE), BigInt(amount)],
		}),
		chainId: HYPERLIQUID_ARBITRUM_CHAIN_ID,
		amount,
		token: getAddress(ARBITRUM_USDC_ADDRESS),
		bridge: getAddress(HYPERLIQUID_ARBITRUM_BRIDGE),
	};
}

export async function buildHyperliquidDepositQuote(
	input: HyperliquidDepositQuoteInput,
	deps: HyperliquidDepositQuoteDeps,
): Promise<HyperliquidDepositQuote> {
	const normalized = validateInput(input);
	const directArbitrumUsdc =
		input.fromChain === HYPERLIQUID_ARBITRUM_CHAIN_ID && sameToken(normalized.fromToken, ARBITRUM_USDC_ADDRESS);

	let bridgeQuote: HyperliquidBridgeQuote | null = null;
	let depositAmount = input.fromAmount;
	const moneyPath = directArbitrumUsdc
		? [
				"patron Arbitrum USDC",
				"patron signs ERC20 transfer to Hyperliquid bridge",
				"Hyperliquid credits patron address",
			]
		: [
				"patron source token",
				"patron signs ERC20 approval if Li.Fi requires one",
				"patron signs Li.Fi route to Arbitrum USDC in their own wallet",
				"patron signs ERC20 transfer to Hyperliquid bridge",
				"Hyperliquid credits patron address",
			];

	if (!directArbitrumUsdc) {
		if (!deps.lifi) {
			throw new HyperliquidDepositQuoteError("LIFI_NOT_CONFIGURED", "Li.Fi quote client is not configured", 503);
		}
		const raw = await deps.lifi.getQuote({
			fromChain: input.fromChain,
			toChain: HYPERLIQUID_ARBITRUM_CHAIN_ID,
			fromToken: normalized.fromToken,
			toToken: ARBITRUM_USDC_ADDRESS,
			fromAmount: input.fromAmount,
			fromAddress: normalized.fromAddress,
			toAddress: normalized.fromAddress,
		});
		validateLifiRoute(raw, normalized.fromAddress);
		bridgeQuote = shapeBridgeQuote(raw);
		depositAmount = raw.estimate.toAmountMin;
	}

	return {
		mode: "patron-owns-hyperliquid-account",
		patronAddress: normalized.fromAddress,
		depositAccount: normalized.fromAddress,
		moneyPath,
		bridgeQuote,
		depositTx: buildDepositTransfer(normalized.fromAddress, depositAmount),
		integrator: {
			name: "waifu",
			feeBps: LIFI_INTEGRATOR_FEE * 10_000,
			slippageBps: LIFI_SLIPPAGE_CAP * 10_000,
		},
		warnings: [
			"Hyperliquid credits the sender of the Arbitrum USDC transfer. The final deposit transaction must be signed by the patron wallet, not the agent Safe or platform wallet.",
		],
	};
}
