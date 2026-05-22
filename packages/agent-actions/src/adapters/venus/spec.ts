import type { Address } from "viem";

import type { AdapterSpec } from "../../types.js";

export interface VenusHashOutput {
	hash: `0x${string}`;
}

export interface VenusSupplyInput {
	vToken: Address;
	amount: bigint;
}

export interface VenusRedeemInput {
	vToken: Address;
	amountUnderlying: bigint;
}

export interface VenusBorrowInput {
	vToken: Address;
	amount: bigint;
}

export interface VenusRepayInput {
	vToken: Address;
	amount: bigint;
}

export interface VenusEnterMarketsInput {
	vTokens: Address[];
}

export interface VenusAccountLiquidityInput {
	account: Address;
}

export interface VenusAccountLiquidityOutput {
	liquidity: bigint;
	shortfall: bigint;
}

export const VENUS_CHAIN_ID = 56;

export const venusContracts = {
	comptroller: "0xfD36E2c2a6789Db23113685031d7F16329158384",
	vBNB: "0xA07c5b74C9B40447a954e1466938b865b6BBea36",
	vBUSD: "0x95c78222B3D6e262426483D42CfA53685A67Ab9D",
	vUSDT: "0xfD5840Cd36d94D7229439859C0112a4185BC0255",
	vUSDC: "0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8",
	vETH: "0xf508fCbF6Daba4772C7d9e7f6C39fc6a14Cb60b5",
	BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
	USDT: "0x55d398326f99059fF775485246999027B3197955",
	USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
	ETH: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
} as const satisfies Record<string, Address>;

/**
 * Single source of truth for ERC20-backed Venus markets. Both the per-vToken
 * mint() permission list and the per-underlying approve() permission list
 * derive from this — adding a new market here wires both sides at once so
 * they can't drift.
 */
const venusVTokenUnderlyings = [
	{ vToken: venusContracts.vBUSD, underlying: venusContracts.BUSD },
	{ vToken: venusContracts.vUSDT, underlying: venusContracts.USDT },
	{ vToken: venusContracts.vUSDC, underlying: venusContracts.USDC },
	{ vToken: venusContracts.vETH, underlying: venusContracts.ETH },
] as const;

const erc20VTokenContracts = venusVTokenUnderlyings.map((m) => m.vToken);
const underlyingErc20Contracts = venusVTokenUnderlyings.map((m) => m.underlying);

const allVTokenContracts = [venusContracts.vBNB, ...erc20VTokenContracts] as const;

const permissionForVTokens = (label: string, selector: `0x${string}`) =>
	allVTokenContracts.map((target) => ({
		label,
		target,
		selectors: [selector],
	}));

export const venusSpec = {
	slug: "venus",
	name: "Venus",
	chains: [VENUS_CHAIN_ID],
	tier: "default",
	contracts: venusContracts,
	actions: {
		supply: {
			name: "supply",
			label: "Supply",
			description: "Supply BNB or an approved underlying asset to a Venus vToken market.",
			permissions: [
				{
					label: "Mint vBNB",
					target: venusContracts.vBNB,
					selectors: ["0x1249c58b"],
				},
				...erc20VTokenContracts.map((target) => ({
					label: "Mint vToken",
					target,
					selectors: ["0xa0712d68" as const],
				})),
				...underlyingErc20Contracts.map((target) => ({
					label: "Approve underlying for vToken supply",
					target,
					selectors: ["0x095ea7b3" as const],
				})),
			],
			cost: { gasEstimate: 260_000n },
		},
		redeem: {
			name: "redeem",
			label: "Redeem underlying",
			description: "Redeem an underlying asset amount from a Venus vToken market.",
			permissions: permissionForVTokens("Redeem underlying from vToken", "0x852a12e3"),
			cost: { gasEstimate: 220_000n },
		},
		borrow: {
			name: "borrow",
			label: "Borrow",
			description: "Borrow an underlying asset amount from a Venus vToken market.",
			permissions: permissionForVTokens("Borrow from vToken", "0xc5ebeaec"),
			cost: { gasEstimate: 280_000n },
		},
		repay: {
			name: "repay",
			label: "Repay borrow",
			description: "Repay a borrowed underlying asset amount to a Venus vToken market.",
			permissions: permissionForVTokens("Repay borrow to vToken", "0x0e752702"),
			cost: { gasEstimate: 180_000n },
		},
		enterMarkets: {
			name: "enterMarkets",
			label: "Enter markets",
			description: "Enable selected Venus vToken markets as collateral via the Comptroller.",
			permissions: [
				{
					label: "Enter Venus markets",
					target: venusContracts.comptroller,
					selectors: ["0xc2998238"],
				},
			],
			cost: { gasEstimate: 220_000n },
		},
		accountLiquidity: {
			name: "accountLiquidity",
			label: "Account liquidity",
			description: "Read account liquidity and shortfall from the Venus Comptroller.",
			permissions: [],
			cost: { gasEstimate: 0n },
		},
	},
} as const satisfies AdapterSpec;
