import {
	FLAP_BSC_MAINNET_CHAIN_ID,
	FLAP_PROGRESS_WAD_ONE,
	FLAP_TOKEN_STATUSES,
	buildNewTokenV5Params,
	buildNewTokenV5Write,
	getFlapMetadataUrl,
	getTokenV7,
	parsePortalReceiptEvents,
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
	/** Pre-uploaded Flap metadata URL. Used as newTokenV5 params.meta. */
	flapMetadataUrl?: string;
	/** Raw Flap metadata string override for protocol-level tests/migrations. */
	flapMeta?: string;
	/** Vanity salt from findFlapVanitySalt. If omitted, a deterministic salt is derived. */
	flapSalt?: Hex;
	/** Override portal for tests, testnet, or emergency contract migrations. */
	flapPortalAddress?: Address;
	/** Override chain id. Defaults to BSC mainnet. */
	flapChainId?: number;
};

export interface CreateFlapAdapterOptions {
	publicClient?: PublicClient;
	chainId?: number;
	portalAddress?: Address;
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

/**
 * Map Waifu's option-3 fee model to Flap's current taxable-token params.
 *
 * Flap exposes one beneficiary for marketing tax revenue. Until a Waifu-owned
 * splitter/vault ABI is wired into launch orchestration, the on-chain launch
 * routes 100% of token tax to the selected beneficiary. That beneficiary should
 * be an agent treasury Safe or custom vault that enforces/settles
 * platformCutBps before creator routing.
 */
export const toFlapNewTokenV5TaxParams = (config: FlapFeeConfig) => ({
	taxRate: config.taxBps,
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
	feeSummary: "Configurable 1%, 3%, 5%, or 10% tax routed to agent treasury or custom vault.",
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
		const beneficiary = resolveBeneficiary(params, params.feeConfig);
		const taxParams = toFlapNewTokenV5TaxParams(params.feeConfig);
		const newTokenParams = buildNewTokenV5Params({
			name: params.name,
			symbol: params.ticker,
			meta: resolveMeta(flapParams),
			salt: deriveSalt(flapParams, params.feeConfig),
			beneficiary,
			quoteAmt: params.initialBuyWei ?? 0n,
			...taxParams,
		});
		const write = buildNewTokenV5Write({
			params: newTokenParams,
			value: params.initialBuyWei ?? 0n,
			chainId,
			portalAddress: flapParams.flapPortalAddress ?? options.portalAddress,
		});

		return {
			to: write.address,
			data: encodeFunctionData({
				abi: write.abi,
				functionName: write.functionName,
				args: write.args,
			}),
			value: write.value,
			chainId,
		};
	},

	parseCreateTokenReceipt(receipt: { logs?: unknown[] }): {
		tokenAddress: string;
		curveAddress: string;
	} {
		const logs = Array.isArray(receipt?.logs) ? receipt.logs : [];
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

		if (!tokenAddress) {
			throw new FlapAdapterError("FlapContractUnavailable", "TokenCreated event not found in Flap receipt");
		}

		return { tokenAddress, curveAddress: curveAddress ?? tokenAddress };
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
