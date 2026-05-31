import { getAddress, isAddress, keccak256, toBytes } from "viem";

import type {
	BankrFeeConfig,
	CreateTokenParams,
	LaunchpadAdapter,
	LaunchpadDescriptor,
	LaunchpadFeeConfig,
} from "../../types.js";

const BASE_CHAIN_ID = 8453;
const MOCK_COORDINATOR = "0x0000000000000000000000000000000000008453";
const MOCK_BANKR_FEE_WALLET = "0x0000000000000000000000000000000000BaA001";
const MOCK_BANKR_ALT_WALLET = "0x0000000000000000000000000000000000BaA002";
const MOCK_DOPPLER_PROTOCOL_WALLET = "0x0000000000000000000000000000000000D0B105";

export const bankrDescriptor: LaunchpadDescriptor = {
	id: "bankr",
	// coming-soon until the executor + bankr api keys land. buildCreateTokenTx
	// currently returns a simulateOnly mock plan; nothing posts to bankr yet.
	status: "coming-soon",
	chain: "base",
	displayName: "Bankr",
	shortDescription: "Base launch path through Bankr's sponsored Doppler token-launch API.",
	feeSummary: "57% creator, partner fee share.",
	graduationTarget: "Uniswap v4 via Doppler",
	badges: ["advanced"],
};

function mockBaseAddress(seed: string): string {
	return getAddress(`0x${keccak256(toBytes(seed)).slice(26)}`);
}

export const bankrAdapter: LaunchpadAdapter = {
	descriptor: bankrDescriptor,

	getDefaultFeeConfig(): BankrFeeConfig {
		return { kind: "bankr", platformCutBps: 1805, creatorFeeBps: 5700, feeRecipientType: "wallet" };
	},

	validateFeeConfig(c: LaunchpadFeeConfig, env: "prod" | "dev" = "prod"): { ok: boolean; errors: string[] } {
		const errors: string[] = [];
		if (c.kind !== "bankr") return { ok: false, errors: ["feeConfig.kind must be bankr"] };
		if (!Number.isInteger(c.platformCutBps) || c.platformCutBps < 0 || c.platformCutBps > 3610) {
			errors.push("platformCutBps must be between 0 and 3610 for Bankr partner fee share");
		}
		if (c.creatorFeeBps !== 5700) {
			errors.push("creatorFeeBps must be 5700 for Bankr launches");
		}
		if (c.feeRecipientType !== "wallet") errors.push("feeRecipientType must be wallet");
		return { ok: errors.length === 0, errors };
	},

	async buildCreateTokenTx(params: CreateTokenParams) {
		if (params.feeConfig.kind !== "bankr") throw new Error("feeConfig.kind must be bankr");
		const validation = this.validateFeeConfig(params.feeConfig, "prod");
		if (!validation.ok) throw new Error(validation.errors.join("; "));
		if (!isAddress(params.founderAddress)) throw new Error("founderAddress must be an EVM address");
		const tokenAddress = mockBaseAddress(`bankr:${params.name}:${params.ticker}:${params.founderAddress}`);
		const bankrBps = 3610 - params.feeConfig.platformCutBps;
		return {
			to: MOCK_COORDINATOR,
			data: keccak256(toBytes(`bankr:${params.name}:${params.ticker}`)),
			value: 0n,
			chainId: BASE_CHAIN_ID,
			external: {
				kind: "bankr",
				baseUrl: "https://api.bankr.bot",
				endpoint: "/token-launches/deploy",
				method: "POST",
				simulateOnly: true,
				body: {
					tokenName: params.name,
					tokenSymbol: params.ticker.toUpperCase().replace("$", ""),
					description: params.description,
					imageUrl: params.logoUrl,
					feeRecipient: { type: "wallet", value: getAddress(params.founderAddress) },
					simulateOnly: true,
				},
				auth: { userHeader: "X-API-Key", partnerHeader: "X-Partner-Key" },
				mockResponse: {
					tokenAddress,
					poolId: `0x${keccak256(toBytes(`pool:${tokenAddress}`)).slice(2)}`,
					feeDistribution: {
						creator: { address: getAddress(params.founderAddress), bps: 5700 },
						bankr: { address: MOCK_BANKR_FEE_WALLET, bps: bankrBps },
						partner: { address: getAddress(params.founderAddress), bps: params.feeConfig.platformCutBps },
						alt: { address: MOCK_BANKR_ALT_WALLET, bps: 190 },
						protocol: { address: MOCK_DOPPLER_PROTOCOL_WALLET, bps: 500 },
					},
				},
			},
		};
	},

	parseCreateTokenReceipt(receipt: { tokenAddress?: string; poolId?: string }) {
		if (!receipt.tokenAddress || !receipt.poolId)
			throw new Error("Bankr deploy response missing tokenAddress or poolId");
		return { tokenAddress: receipt.tokenAddress, curveAddress: receipt.poolId };
	},

	async getCurveProgress(): Promise<{ raisedWei: bigint; targetWei: bigint }> {
		throw new Error("Bankr curve progress reads require Bankr/Doppler indexer credentials");
	},
	async getGraduationStatus(): Promise<{ graduated: boolean; lpAddress?: string }> {
		throw new Error("Bankr graduation reads require Bankr/Doppler indexer credentials");
	},
	async getTradeFeeBps(): Promise<number> {
		return 0;
	},
	async getTreasuryAddress(tokenAddress: string): Promise<string | null> {
		return isAddress(tokenAddress) ? null : null;
	},
};
