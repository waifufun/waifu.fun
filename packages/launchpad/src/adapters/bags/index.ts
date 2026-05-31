import { createHash } from "node:crypto";

import { getDefaultPlatformCutBps, validatePlatformCutBps } from "../../platform-cut.js";
import type {
	BagsFeeConfig,
	CreateTokenParams,
	LaunchpadAdapter,
	LaunchpadDescriptor,
	LaunchpadFeeConfig,
} from "../../types.js";

const SOLANA_MAINNET_CHAIN_ID = 101;
const MOCK_BAGS_PROGRAM = "BAGS111111111111111111111111111111111111111";
const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const bagsDescriptor: LaunchpadDescriptor = {
	id: "bags",
	// coming-soon until the executor + bags api auth land. buildCreateTokenTx
	// currently returns a mock plan; nothing posts to bags / solana yet.
	status: "coming-soon",
	chain: "solana",
	displayName: "Bags",
	shortDescription: "Solana launch path through Bags token-launch v2 with explicit creator fee sharing.",
	feeSummary: "Bags creator fee sharing with waifu split accounting.",
	graduationTarget: "Meteora DLMM",
	badges: ["advanced"],
};

function mockBase58(prefix: string, seed: string, length = 44): string {
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
	const bytes = createHash("sha256").update(`${prefix}:${seed}`).digest();
	let out = prefix;
	for (let i = 0; out.length < length; i++) out += alphabet[(bytes[i % bytes.length] ?? 0) % alphabet.length];
	return out.slice(0, length);
}

export const bagsAdapter: LaunchpadAdapter = {
	descriptor: bagsDescriptor,

	getDefaultFeeConfig(): BagsFeeConfig {
		const platformCutBps = getDefaultPlatformCutBps();
		return {
			kind: "bags",
			platformCutBps,
			creatorFeeBps: 10_000 - platformCutBps,
			initialBuyLamports: 10_000_000,
		};
	},

	validateFeeConfig(c: LaunchpadFeeConfig, env: "prod" | "dev" = "prod"): { ok: boolean; errors: string[] } {
		const errors: string[] = [];
		if (c.kind !== "bags") return { ok: false, errors: ["feeConfig.kind must be bags"] };
		const platformCheck = validatePlatformCutBps(c.platformCutBps, { env });
		errors.push(...platformCheck.errors);
		if (!Number.isInteger(c.creatorFeeBps) || c.creatorFeeBps < 0 || c.creatorFeeBps > 10_000) {
			errors.push("creatorFeeBps must be between 0 and 10000");
		}
		if (c.creatorFeeBps + c.platformCutBps !== 10_000) {
			errors.push("creatorFeeBps + platformCutBps must equal 10000");
		}
		if (!Number.isInteger(c.initialBuyLamports) || c.initialBuyLamports < 0) {
			errors.push("initialBuyLamports must be a non-negative integer");
		}
		return { ok: errors.length === 0, errors };
	},

	async buildCreateTokenTx(params: CreateTokenParams) {
		if (params.feeConfig.kind !== "bags") throw new Error("feeConfig.kind must be bags");
		const validation = this.validateFeeConfig(params.feeConfig, "prod");
		if (!validation.ok) throw new Error(validation.errors.join("; "));
		if (!SOLANA_ADDRESS_RE.test(params.founderAddress)) throw new Error("founderAddress must be a Solana address");
		const tokenMint = mockBase58("Bag", `${params.name}:${params.ticker}:${params.founderAddress}`);
		const configKey = mockBase58("Cfg", tokenMint);
		const tokenMetadata = `ipfs://bags/${tokenMint}`;
		return {
			to: MOCK_BAGS_PROGRAM,
			data: `0x${createHash("sha256").update(`bags:${tokenMint}`).digest("hex")}`,
			value: 0n,
			chainId: SOLANA_MAINNET_CHAIN_ID,
			external: {
				kind: "bags",
				baseUrl: "https://public-api-v2.bags.fm/api/v1",
				steps: [
					{
						endpoint: "/token-launch/create-token-info",
						method: "POST",
						contentType: "multipart/form-data",
						body: {
							name: params.name,
							symbol: params.ticker.toUpperCase().replace("$", ""),
							description: params.description,
							imageUrl: params.logoUrl,
							...(params.socials?.website ? { website: params.socials.website } : {}),
							...(params.socials?.twitter ? { twitter: params.socials.twitter } : {}),
							...(params.socials?.telegram ? { telegram: params.socials.telegram } : {}),
						},
					},
					{
						endpoint: "/fee-share/config",
						method: "POST",
						body: {
							payer: params.founderAddress,
							baseMint: tokenMint,
							claimersArray: [params.founderAddress, params.founderAddress],
							basisPointsArray: [params.feeConfig.creatorFeeBps, params.feeConfig.platformCutBps],
						},
					},
					{
						endpoint: "/token-launch/create-launch-transaction",
						method: "POST",
						body: {
							ipfs: tokenMetadata,
							tokenMint,
							wallet: params.founderAddress,
							initialBuyLamports: params.feeConfig.initialBuyLamports,
							configKey,
						},
					},
					{ endpoint: "/solana/send-transaction", method: "POST", body: { transaction: "<signed-base58-tx>" } },
				],
				auth: { header: "x-api-key", agentAuthEndpoints: ["/agent/v2/auth/init", "/agent/v2/auth/callback"] },
				mockResponse: {
					tokenMint,
					tokenMetadata,
					configKey,
					signature: mockBase58("Sig", tokenMint, 88),
				},
			},
		};
	},

	parseCreateTokenReceipt(receipt: { tokenMint?: string; signature?: string }) {
		if (!receipt.tokenMint || !receipt.signature)
			throw new Error("Bags launch response missing tokenMint or signature");
		return { tokenAddress: receipt.tokenMint, curveAddress: receipt.signature };
	},

	async getCurveProgress(): Promise<{ raisedWei: bigint; targetWei: bigint }> {
		throw new Error("Bags curve progress reads require Solana/Bags indexer credentials");
	},
	async getGraduationStatus(): Promise<{ graduated: boolean; lpAddress?: string }> {
		throw new Error("Bags graduation reads require Solana/Bags indexer credentials");
	},
	async getTradeFeeBps(): Promise<number> {
		return 0;
	},
	async getTreasuryAddress(): Promise<string | null> {
		return null;
	},
};
