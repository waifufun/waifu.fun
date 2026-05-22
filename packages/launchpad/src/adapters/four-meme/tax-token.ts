import type { FourMemeClient } from "@waifufun/fourmeme";
import { getAddress, isAddress } from "viem";

import { getDefaultPlatformCutBps, validatePlatformCutBps } from "../../platform-cut.js";
import type {
	CreateTokenParams,
	FourMemeTaxFeeConfig,
	LaunchpadAdapter,
	LaunchpadDescriptor,
	LaunchpadFeeConfig,
	UnsignedTx,
} from "../../types.js";
import { createFourMemeRegularAdapter } from "./regular.js";

export { default as TaxTokenAbi } from "./abis/TaxToken.abi.json" with { type: "json" };
export { default as AgentIdentifierAbi } from "./abis/AgentIdentifier.abi.json" with { type: "json" };

const ALLOWED_TAX_BPS = new Set([100, 300, 500, 1000]);

export const fourMemeTaxDescriptor: LaunchpadDescriptor = {
	id: "four-meme-tax",
	status: "live",
	chain: "bsc",
	displayName: "four.meme Tax Token",
	shortDescription: "four.meme creatorType=5 launch with configurable tax allocations.",
	feeSummary:
		"Creator chooses 1%, 3%, 5%, or 10% tax. Waifu takes a flat platform cut off the top; the rest is split across founder, holders, burn, and auto-LP however the creator wants.",
	graduationTarget: "Four.meme graduation to PancakeSwap liquidity, retaining post-grad tax behavior.",
	badges: ["advanced"],
};

const validateTaxConfigShape = (c: LaunchpadFeeConfig): c is FourMemeTaxFeeConfig => c.kind === "four-meme-tax";

const isWholePercentBps = (value: number): boolean => value % 100 === 0;

/**
 * Map our (platformCut + 4-way) model to four.meme's on-chain TaxToken rates,
 * which must sum to 100.
 *
 * The platform cut is added to the founder wallet's on-chain rate. Off-chain
 * (or via splitter contract — see W2.A), the founder wallet routes
 * platformCut/(platformCut+founderBps) of inflows to the waifu fee wallet and
 * the rest to the agent treasury.
 *
 * NOTE: When the founder wallet is a splitter contract, the chain enforces the
 * cut at the source. When it's a plain Safe, settlement is off-chain. W2.A
 * decides which based on agent profile.
 */
export const toFourMemeTokenTaxInfo = (config: FourMemeTaxFeeConfig, founderAddress: string) => {
	const onChainFounderBps = config.allocation.founderBps + config.platformCutBps;
	const onChainTotal =
		onChainFounderBps + config.allocation.holderBps + config.allocation.burnBps + config.allocation.liquidityBps;
	if (onChainTotal !== 10000) {
		throw new Error(
			`on-chain tax allocation must sum to 10000 (got ${onChainTotal}); platformCutBps + 4-way must equal 10000`,
		);
	}
	return {
		feeRate: (config.taxBps / 100) as 1 | 3 | 5 | 10,
		burnRate: config.allocation.burnBps / 100,
		divideRate: config.allocation.holderBps / 100,
		liquidityRate: config.allocation.liquidityBps / 100,
		recipientRate: onChainFounderBps / 100,
		recipientAddress: getAddress(founderAddress),
		minSharing: config.minHolderBalance,
	};
};

export const createFourMemeTaxTokenAdapter = (client?: FourMemeClient): LaunchpadAdapter => {
	const regular = createFourMemeRegularAdapter(client);

	return {
		...regular,
		descriptor: fourMemeTaxDescriptor,

		getDefaultFeeConfig(): FourMemeTaxFeeConfig {
			const platformCutBps = getDefaultPlatformCutBps();
			const remaining = 10000 - platformCutBps;
			const holderBps = 2000;
			const burnBps = 1000;
			const liquidityBps = 1000;
			const founderBps = remaining - holderBps - burnBps - liquidityBps;
			return {
				kind: "four-meme-tax",
				taxBps: 300,
				platformCutBps,
				allocation: {
					founderBps,
					holderBps,
					burnBps,
					liquidityBps,
				},
				minHolderBalance: "1000000000000000000",
			};
		},

		validateFeeConfig(c: LaunchpadFeeConfig, env: "prod" | "dev"): { ok: boolean; errors: string[] } {
			const errors: string[] = [];
			if (!validateTaxConfigShape(c)) return { ok: false, errors: ["feeConfig.kind must be four-meme-tax"] };

			if (!ALLOWED_TAX_BPS.has(c.taxBps)) {
				errors.push("taxBps must be one of 100, 300, 500, 1000");
			}
			if (env === "prod" && c.taxBps <= 0) {
				errors.push("taxBps must be greater than 0 in prod");
			}

			const platformCheck = validatePlatformCutBps(c.platformCutBps, { env });
			errors.push(...platformCheck.errors);

			const { founderBps, holderBps, burnBps, liquidityBps } = c.allocation;
			const allocationEntries = { founderBps, holderBps, burnBps, liquidityBps };
			for (const [name, value] of Object.entries(allocationEntries)) {
				if (!Number.isInteger(value) || value < 0 || value > 10000) {
					errors.push(`${name} must be an integer between 0 and 10000`);
				}
			}
			const total = founderBps + holderBps + burnBps + liquidityBps;
			const expectedSum = 10000 - c.platformCutBps;
			if (total !== expectedSum) {
				errors.push(`allocation bps must sum to ${expectedSum} (10000 - platformCutBps); got ${total}`);
			}
			if (!isWholePercentBps(c.taxBps)) {
				errors.push("taxBps must serialize to a whole percent");
			}
			if (!isWholePercentBps(c.platformCutBps + founderBps)) {
				errors.push("platformCutBps + founderBps must serialize to a whole percent");
			}
			for (const [name, value] of Object.entries({ holderBps, burnBps, liquidityBps })) {
				if (!isWholePercentBps(value)) {
					errors.push(`${name} must serialize to a whole percent`);
				}
			}

			try {
				const minHolderBalance = BigInt(c.minHolderBalance);
				if (minHolderBalance < 0n) errors.push("minHolderBalance must be non-negative");
			} catch {
				errors.push("minHolderBalance must be a bigint string");
			}

			return { ok: errors.length === 0, errors };
		},

		async buildCreateTokenTx(params: CreateTokenParams): Promise<UnsignedTx> {
			if (params.feeConfig.kind !== "four-meme-tax") {
				throw new Error("feeConfig.kind must be four-meme-tax");
			}
			if (!isAddress(params.founderAddress)) throw new Error("founderAddress must be an EVM address");
			const validation = this.validateFeeConfig(params.feeConfig, "prod");
			if (!validation.ok) throw new Error(validation.errors.join("; "));
			return regular.buildCreateTokenTx(params);
		},
	};
};

export const fourMemeTaxTokenAdapter = createFourMemeTaxTokenAdapter();
