import {
	FLAP_BSC_MAINNET_CHAIN_ID,
	FLAP_PROGRESS_WAD_ONE,
	FLAP_TOKEN_STATUSES,
	buildNewTokenV5Params,
	buildNewTokenV5Write,
	buildNewTokenV6WithVaultParams,
	buildNewTokenV6WithVaultWrite,
	buildSplitVaultData,
	getDefaultSplitVaultFactoryAddress,
	getFlapMetadataUrl,
	getTokenV7,
	parsePortalReceiptEvents,
	parseVaultPortalReceiptEvents,
} from "@waifufun/flap";
import {
	type Address,
	type Hex,
	encodeFunctionData,
	getAddress,
	isAddress,
	keccak256,
	toBytes,
	zeroAddress,
} from "viem";
import type { PublicClient } from "viem";

import { getDefaultPlatformCutBps, validatePlatformCutBps } from "../../platform-cut.js";
import type {
	CreateTokenParams,
	FlapFeeConfig,
	LaunchpadAdapter,
	LaunchpadDescriptor,
	LaunchpadFeeConfig,
	UnsignedTx,
} from "../../types.js";

export class FlapAdapterError extends Error {
	constructor(
		public readonly code: "FlapNotConfigured" | "FlapContractUnavailable" | "FlapUnsupported" | "FlapValidationError",
		message: string,
	) {
		super(message);
		this.name = "FlapAdapterError";
	}
}

const ALLOWED_TAX_BPS = new Set([100, 300, 500, 1000]);
const DEFAULT_CHAIN_ID = FLAP_BSC_MAINNET_CHAIN_ID;

type FlapAdapterCreateTokenParams = CreateTokenParams & {
	/** Pre-uploaded Flap metadata CID returned by uploadFlapMetadata. Preferred. */
	flapMetadataCid?: string;
	/** Pre-uploaded Flap metadata URL. Used as newTokenV5 or newTokenV6WithVault params.meta. */
	flapMetadataUrl?: string;
	/** Raw Flap metadata string override for protocol-level tests/migrations. */
	flapMeta?: string;
	/** Vanity salt from findFlapVanitySalt. If omitted, a deterministic salt is derived. */
	flapSalt?: Hex;
	/** Override portal for tests, testnet, or emergency contract migrations. */
	flapPortalAddress?: Address;
	/** Override VaultPortal for tests, testnet, or emergency contract migrations. */
	flapVaultPortalAddress?: Address;
	/** Override Split Vault factory for tests or testnet. */
	flapSplitVaultFactoryAddress?: Address;
	/** Override chain id. Defaults to BSC mainnet. */
	flapChainId?: number;
};

export interface CreateFlapAdapterOptions {
	publicClient?: PublicClient;
	chainId?: number;
	portalAddress?: Address;
	vaultPortalAddress?: Address;
	splitVaultFactoryAddress?: Address;
	platformWalletAddress?: Address;
}

const unsupported = (message: string): never => {
	throw new FlapAdapterError("FlapUnsupported", message);
};

const requireAddress = (label: string, value: string): Address => {
	if (!isAddress(value)) {
		throw new FlapAdapterError("FlapValidationError", `${label} must be an EVM address`);
	}
	return getAddress(value) as Address;
};

const resolveBeneficiary = (params: CreateTokenParams, config: FlapFeeConfig): Address => {
	if (config.recipient === "custom-vault") {
		if (!config.customVaultAddress) {
			throw new FlapAdapterError("FlapValidationError", "customVaultAddress is required for custom-vault recipient");
		}
		return requireAddress("customVaultAddress", config.customVaultAddress);
	}

	return requireAddress("founderAddress", params.founderAddress);
};

const resolvePlatformWallet = (options: CreateFlapAdapterOptions): Address => {
	const configured = options.platformWalletAddress ?? process.env.WAIFU_PLATFORM_FEE_WALLET;
	if (!configured) {
		throw new FlapAdapterError(
			"FlapNotConfigured",
			"WAIFU_PLATFORM_FEE_WALLET is required for Flap agent-treasury launches so VaultPortal can deploy the Split Vault.",
		);
	}
	return requireAddress("WAIFU_PLATFORM_FEE_WALLET", configured);
};

const buildAgentTreasuryRecipients = (
	params: CreateTokenParams,
	config: FlapFeeConfig,
	options: CreateFlapAdapterOptions,
) => {
	const platform = resolvePlatformWallet(options);
	const treasury = requireAddress("founderAddress", params.founderAddress);
	return [
		{ recipient: platform, bps: config.platformCutBps },
		{ recipient: treasury, bps: 10_000 - config.platformCutBps },
	] as const;
};

const resolveMeta = (params: FlapAdapterCreateTokenParams): string => {
	if (params.flapMeta?.trim()) return params.flapMeta.trim();
	if (params.flapMetadataUrl?.trim()) return params.flapMetadataUrl.trim();
	if (params.flapMetadataCid?.trim()) return getFlapMetadataUrl(params.flapMetadataCid.trim());

	// W2 /v3 launch orchestration currently gives the launchpad adapter plain
	// token fields rather than a completed Flap upload job. Flap's newTokenV5
	// accepts a string `meta`, so keep the boundary deterministic and
	// protocol-shaped while docs steer production callers to pre-upload metadata.
	return JSON.stringify({
		description: params.description,
		image: params.logoUrl,
		socials: params.socials ?? {},
	});
};

const deriveSalt = (params: FlapAdapterCreateTokenParams, config: FlapFeeConfig): Hex => {
	if (params.flapSalt) return params.flapSalt;
	return keccak256(
		toBytes(
			JSON.stringify({
				founderAddress: getAddress(params.founderAddress),
				name: params.name,
				symbol: params.ticker,
				meta: resolveMeta(params),
				taxBps: config.taxBps,
				recipient: config.recipient,
				customVaultAddress: config.customVaultAddress ? getAddress(config.customVaultAddress) : undefined,
			}),
		),
	);
};

export const toFlapNewTokenV5TaxParams = (config: FlapFeeConfig) => ({
	taxRate: config.taxBps,
	mktBps: 10_000,
	deflationBps: 0,
	dividendBps: 0,
	lpBps: 0,
});

export const toFlapNewTokenV6TaxParams = (config: FlapFeeConfig) => ({
	buyTaxRate: config.taxBps,
	sellTaxRate: config.taxBps,
	mktBps: 10_000,
	deflationBps: 0,
	dividendBps: 0,
	lpBps: 0,
});

export const flapDescriptor: LaunchpadDescriptor = {
	id: "flap",
	status: "live",
	chain: "bsc",
	displayName: "Flap",
	shortDescription: "BSC-native Flap launchpad adapter.",
	feeSummary: "Configurable 1%, 3%, 5%, or 10% tax routed through Split Vault to treasury, or to a custom vault.",
	graduationTarget: "Flap-native graduation path.",
	badges: ["recommended"],
};

export const createFlapAdapter = (options: CreateFlapAdapterOptions = {}): LaunchpadAdapter => ({
	descriptor: flapDescriptor,

	getDefaultFeeConfig(): FlapFeeConfig {
		return {
			kind: "flap",
			taxBps: 300,
			platformCutBps: getDefaultPlatformCutBps(),
			recipient: "agent-treasury",
		};
	},

	validateFeeConfig(c: LaunchpadFeeConfig, env: "prod" | "dev" = "prod"): { ok: boolean; errors: string[] } {
		const errors: string[] = [];
		if (c.kind !== "flap") return { ok: false, errors: ["feeConfig.kind must be flap"] };
		if (!ALLOWED_TAX_BPS.has(c.taxBps)) {
			errors.push("taxBps must be one of 100, 300, 500, 1000");
		}
		const platformCheck = validatePlatformCutBps(c.platformCutBps, { env });
		errors.push(...platformCheck.errors);
		if (c.recipient !== "agent-treasury" && c.recipient !== "custom-vault") {
			errors.push("recipient must be agent-treasury or custom-vault");
		}
		if (c.recipient === "custom-vault") {
			if (!c.customVaultAddress) {
				errors.push("customVaultAddress is required for custom-vault recipient");
			} else if (!isAddress(c.customVaultAddress)) {
				errors.push("customVaultAddress must be an EVM address");
			}
		}
		if (c.recipient === "agent-treasury" && c.customVaultAddress && !isAddress(c.customVaultAddress)) {
			errors.push("customVaultAddress must be an EVM address when provided");
		}
		return { ok: errors.length === 0, errors };
	},

	async buildCreateTokenTx(params: CreateTokenParams): Promise<UnsignedTx> {
		if (params.feeConfig.kind !== "flap") {
			throw new FlapAdapterError("FlapValidationError", "feeConfig.kind must be flap");
		}
		const validation = this.validateFeeConfig(params.feeConfig, "prod");
		if (!validation.ok) {
			throw new FlapAdapterError("FlapValidationError", validation.errors.join("; "));
		}
		requireAddress("founderAddress", params.founderAddress);

		const flapParams = params as FlapAdapterCreateTokenParams;
		const chainId = flapParams.flapChainId ?? options.chainId ?? DEFAULT_CHAIN_ID;

		if (params.feeConfig.recipient === "custom-vault") {
			const beneficiary = resolveBeneficiary(params, params.feeConfig);
			const newTokenParams = buildNewTokenV5Params({
				name: params.name,
				symbol: params.ticker,
				meta: resolveMeta(flapParams),
				salt: deriveSalt(flapParams, params.feeConfig),
				beneficiary,
				quoteAmt: params.initialBuyWei ?? 0n,
				...toFlapNewTokenV5TaxParams(params.feeConfig),
			});
			const write = buildNewTokenV5Write({
				params: newTokenParams,
				value: params.initialBuyWei ?? 0n,
				chainId,
				portalAddress: flapParams.flapPortalAddress ?? options.portalAddress,
			});

			return {
				to: write.address,
				data: encodeFunctionData({ abi: write.abi, functionName: write.functionName, args: write.args }),
				value: write.value,
				chainId,
			};
		}

		const vaultFactory =
			flapParams.flapSplitVaultFactoryAddress ??
			options.splitVaultFactoryAddress ??
			getDefaultSplitVaultFactoryAddress({ chainId });
		const vaultData = buildSplitVaultData(buildAgentTreasuryRecipients(params, params.feeConfig, options));
		const newTokenParams = buildNewTokenV6WithVaultParams({
			name: params.name,
			symbol: params.ticker,
			meta: resolveMeta(flapParams),
			salt: deriveSalt(flapParams, params.feeConfig),
			quoteAmt: params.initialBuyWei ?? 0n,
			vaultFactory,
			vaultData,
			...toFlapNewTokenV6TaxParams(params.feeConfig),
		});
		const write = buildNewTokenV6WithVaultWrite({
			params: newTokenParams,
			value: params.initialBuyWei ?? 0n,
			chainId,
			vaultPortalAddress: flapParams.flapVaultPortalAddress ?? options.vaultPortalAddress,
		});

		return {
			to: write.address,
			data: encodeFunctionData({ abi: write.abi, functionName: write.functionName, args: write.args }),
			value: write.value,
			chainId,
		};
	},

	parseCreateTokenReceipt(receipt: { logs?: unknown[] }): {
		tokenAddress: string;
		curveAddress: string;
		vaultAddress?: string;
		vaultFactory?: string;
	} {
		const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];

		// VaultPortal launches emit FlapTaxVaultTokenCreated with token,
		// vault, and vaultFactory. Capture them but don't return yet:
		// the same receipt also carries the regular Portal events
		// (TokenCreated + TokenCurveSet), and the curve address comes
		// from the latter. Round 1 codex: previously we early-returned
		// here with curveAddress = tokenAddress, which broke any caller
		// relying on the real curve.
		let vaultAddress: Address | undefined;
		let vaultFactory: Address | undefined;
		let tokenFromVault: Address | undefined;
		const vaultEvents = parseVaultPortalReceiptEvents({ logs: logs as never });
		for (const event of vaultEvents) {
			const args = event.args as Record<string, unknown> | undefined;
			const token = args?.token;
			const vault = args?.vault;
			const factory = args?.vaultFactory;
			if (typeof token === "string" && isAddress(token)) {
				tokenFromVault ??= getAddress(token) as Address;
			}
			if (typeof vault === "string" && isAddress(vault)) {
				vaultAddress ??= getAddress(vault) as Address;
			}
			if (typeof factory === "string" && isAddress(factory)) {
				vaultFactory ??= getAddress(factory) as Address;
			}
		}

		const events = parsePortalReceiptEvents({ logs: logs as never });
		let tokenAddress: Address | undefined;
		let curveAddress: Address | undefined;

		for (const event of events) {
			const args = event.args as Record<string, unknown> | undefined;
			const token = args?.token;
			if (typeof token === "string" && isAddress(token)) tokenAddress ??= getAddress(token) as Address;
			if (event.eventName === "TokenCurveSet") {
				const curve = args?.curve;
				if (typeof curve === "string" && isAddress(curve)) curveAddress = getAddress(curve) as Address;
			}
		}

		// Prefer Portal's TokenCreated for the canonical token address,
		// fall back to the VaultPortal event if Portal events were filtered.
		const resolvedTokenAddress = tokenAddress ?? tokenFromVault;
		if (!resolvedTokenAddress) {
			throw new FlapAdapterError(
				"FlapContractUnavailable",
				"TokenCreated event not found in Flap receipt",
			);
		}

		return {
			tokenAddress: resolvedTokenAddress,
			curveAddress: curveAddress ?? resolvedTokenAddress,
			...(vaultAddress ? { vaultAddress } : {}),
			...(vaultFactory ? { vaultFactory } : {}),
		};
	},

	async getCurveProgress(tokenAddress: string): Promise<{ raisedWei: bigint; targetWei: bigint }> {
		if (!options.publicClient) {
			throw new FlapAdapterError(
				"FlapNotConfigured",
				"Flap public client required for curve progress reads. Configure BSC_RPC_URL or pass createFlapAdapter({ publicClient }).",
			);
		}
		const state = await getTokenV7(options.publicClient, {
			token: requireAddress("tokenAddress", tokenAddress),
			chainId: options.chainId ?? DEFAULT_CHAIN_ID,
			portalAddress: options.portalAddress,
		});
		return { raisedWei: state.progress, targetWei: FLAP_PROGRESS_WAD_ONE };
	},

	async getGraduationStatus(tokenAddress: string): Promise<{ graduated: boolean; lpAddress?: string }> {
		if (!options.publicClient) {
			throw new FlapAdapterError(
				"FlapNotConfigured",
				"Flap public client required for graduation reads. Configure BSC_RPC_URL or pass createFlapAdapter({ publicClient }).",
			);
		}
		const state = await getTokenV7(options.publicClient, {
			token: requireAddress("tokenAddress", tokenAddress),
			chainId: options.chainId ?? DEFAULT_CHAIN_ID,
			portalAddress: options.portalAddress,
		});
		const hasPool = state.pool !== zeroAddress;
		if (state.status === FLAP_TOKEN_STATUSES.DEX && hasPool) {
			return { graduated: true, lpAddress: state.pool };
		}
		return { graduated: false };
	},

	async getTradeFeeBps(tokenAddress: string): Promise<number> {
		if (!options.publicClient) {
			throw new FlapAdapterError(
				"FlapNotConfigured",
				"Flap public client required for trade fee reads. Configure BSC_RPC_URL or pass createFlapAdapter({ publicClient }).",
			);
		}
		const state = await getTokenV7(options.publicClient, {
			token: requireAddress("tokenAddress", tokenAddress),
			chainId: options.chainId ?? DEFAULT_CHAIN_ID,
			portalAddress: options.portalAddress,
		});
		return Number(state.taxRate);
	},

	async getTreasuryAddress(): Promise<string | null> {
		return unsupported(
			"Flap Portal ABI currently exposed in @waifufun/flap does not include a beneficiary/treasury read. Persist the launch beneficiary from buildCreateTokenTx or add the Flap token beneficiary ABI.",
		);
	},
});

export const flapAdapter = createFlapAdapter();

// Backwards-compatible export name for W1/W2 imports. This is now the real adapter.
export const flapAdapterPlaceholder = flapAdapter;
