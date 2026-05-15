import { createHash } from "node:crypto";

import { isAddress } from "viem";

import { validatePlatformCutBps } from "@waifufun/launchpad";

import type { AgentLaunchInput } from "../agent-launch/index.js";

type ProvisionPersona = {
	name: string;
	ticker: string;
	bio: string;
	personaPrompt: string | null;
	avatarTemplateId: string | null;
	hasAvatarUpload: boolean;
};

type RuntimeKind = "hosted" | "webhook" | "pull";

export type ProvisionRuntime =
	| { kind: "hosted" }
	| { kind: "pull" }
	| { kind: "webhook"; webhookUrl: string; webhookSecret: string | null };

type ProvisionSafe = {
	taxAgentBps: number;
	taxPatronBps: number;
	owners: [`0x${string}`, ...`0x${string}`[]];
	threshold: number;
	firstBuyFundingSource: string | null;
	adapters: unknown;
};

export type FourMemeTaxLaunchpadConfig = {
	kind: "four-meme-tax";
	taxBps: 100 | 300 | 500 | 1000;
	platformCutBps: number;
	allocation: {
		founderBps: number;
		holderBps: number;
		burnBps: number;
		liquidityBps: number;
	};
	minHolderBalance: string;
};

type FourMemeRegularLaunchpadConfig = { kind: "four-meme-regular" };

export type FlapLaunchpadConfig = {
	kind: "flap";
	taxBps: 100 | 300 | 500 | 1000;
	platformCutBps: number;
	recipient: "agent-treasury" | "custom-vault";
	customVaultAddress?: `0x${string}`;
};

type ProvisionLaunchpad =
	| {
			launchpad_id: "four-meme-tax";
			chain: "bsc";
			launchpad_config: FourMemeTaxLaunchpadConfig;
			fee_mode: string | null;
	  }
	| {
			launchpad_id: "four-meme-regular";
			chain: "bsc";
			launchpad_config: FourMemeRegularLaunchpadConfig;
			fee_mode: string | null;
	  }
	| {
			launchpad_id: "flap";
			chain: "bsc";
			launchpad_config: FlapLaunchpadConfig;
			fee_mode: string | null;
	  };

export type ProvisionRequest = {
	inviteCode: string;
	persona: ProvisionPersona;
	runtime: ProvisionRuntime;
	safe: ProvisionSafe;
	launchpad: ProvisionLaunchpad | null;
};

export type PatronContext = { stewardUserId: string; primaryAddress: string | null };

export type ProvisionAdapterConfig = {
	platformWallet: `0x${string}` | null;
	fourMemePlatformBps: number;
	flapVaultPortalAddress?: `0x${string}`;
	flapSplitVaultFactoryAddress?: `0x${string}`;
};

export type ProvisionValidationResult =
	| { ok: true; body: ProvisionRequest; launchInput: AgentLaunchInput; pullRuntime: boolean }
	| { ok: false; message: string; code?: string };

function readString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNullableString(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	return readString(value);
}

function readNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function assertNever(value: never): never {
	throw new Error(`unhandled provision launchpad ${(value as { launchpad_id?: string }).launchpad_id ?? "unknown"}`);
}

function assertNoUnhandledFields(_value: Record<string, never>): void {}

function hashWebhookSecret(secret: string): string {
	return `sha256:${createHash("sha256").update(secret, "utf8").digest("hex")}`;
}

function parseTaxBps(value: unknown): 100 | 300 | 500 | 1000 | null {
	if (value === 100 || value === 300 || value === 500 || value === 1000) return value;
	return null;
}

function parseBps(value: unknown): number | null {
	const parsed = readNumber(value);
	if (parsed === null || !Number.isInteger(parsed) || parsed < 0 || parsed > 10000) return null;
	return parsed;
}

function nestedFeeConfig(value: Record<string, unknown>): Record<string, unknown> {
	return value.feeConfig && typeof value.feeConfig === "object" && !Array.isArray(value.feeConfig)
		? (value.feeConfig as Record<string, unknown>)
		: value;
}

function isValidFourMemeMinSharing(value: number): boolean {
	if (!Number.isFinite(value) || value <= 0) return false;
	let exponent = 0;
	let mantissa = value;
	while (mantissa >= 10 && Number.isInteger(mantissa / 10)) {
		mantissa /= 10;
		exponent += 1;
	}
	return Number.isInteger(mantissa) && mantissa >= 1 && mantissa <= 9 && exponent >= 5;
}

function normalizeFourMemeMinSharing(value: string): number | null {
	const parsed = Number(value);
	if (isValidFourMemeMinSharing(parsed)) return parsed;
	if (parsed === 10_000) return 100_000;
	return null;
}

function parseFourMemeTaxConfig(value: unknown, config: ProvisionAdapterConfig): FourMemeTaxLaunchpadConfig | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const feeConfig = nestedFeeConfig(value as Record<string, unknown>);
	const taxBps = parseTaxBps(feeConfig.taxBps);
	if (!taxBps) return null;
	const platformCutBps = parseBps(feeConfig.platformCutBps) ?? config.fourMemePlatformBps;
	const platformCutCheck = validatePlatformCutBps(platformCutBps, { env: "prod" });
	if (!platformCutCheck.ok) return null;
	if (platformCutBps > 0 && !config.platformWallet) return null;
	const allocationValue = feeConfig.allocation;
	if (!allocationValue || typeof allocationValue !== "object" || Array.isArray(allocationValue)) return null;
	const allocation = allocationValue as Record<string, unknown>;
	const founderBps = parseBps(allocation.founderBps);
	const holderBps = parseBps(allocation.holderBps);
	const burnBps = parseBps(allocation.burnBps);
	const liquidityBps = parseBps(allocation.liquidityBps);
	const minHolderBalance = readString(feeConfig.minHolderBalance);
	if (founderBps === null || holderBps === null || burnBps === null || liquidityBps === null || !minHolderBalance) {
		return null;
	}
	if (founderBps + holderBps + burnBps + liquidityBps !== 10000 - platformCutBps) return null;
	try {
		if (BigInt(minHolderBalance) <= 0n) return null;
	} catch {
		return null;
	}
	if (normalizeFourMemeMinSharing(minHolderBalance) === null) return null;
	return {
		kind: "four-meme-tax",
		taxBps,
		platformCutBps,
		allocation: { founderBps, holderBps, burnBps, liquidityBps },
		minHolderBalance,
	};
}

function parseFlapConfig(value: unknown, fallbackPlatformBps: number): FlapLaunchpadConfig | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const feeConfig = nestedFeeConfig(value as Record<string, unknown>);
	const taxBps = parseTaxBps(feeConfig.taxBps);
	if (!taxBps) return null;
	const platformCutBps = parseBps(feeConfig.platformCutBps) ?? fallbackPlatformBps;
	const recipient = feeConfig.recipient;
	if (recipient !== "agent-treasury" && recipient !== "custom-vault") return null;
	const customVaultAddress = readString(feeConfig.customVaultAddress);
	if (recipient === "custom-vault" && (!customVaultAddress || !isAddress(customVaultAddress))) return null;
	if (recipient === "agent-treasury" && customVaultAddress && !isAddress(customVaultAddress)) return null;
	return {
		kind: "flap",
		taxBps,
		platformCutBps,
		recipient,
		...(customVaultAddress ? { customVaultAddress: customVaultAddress as `0x${string}` } : {}),
	};
}

function parseProvisionLaunchpad(
	value: unknown,
	config: ProvisionAdapterConfig,
): ProvisionLaunchpad | null | "unsupported" {
	if (value === null || value === undefined) return null;
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	const input = value as Record<string, unknown>;
	const launchpadId = input.launchpad_id;
	const chain = input.chain === undefined || input.chain === null ? "bsc" : input.chain;
	if (chain !== "bsc") return "unsupported";
	const feeMode = readNullableString(input.fee_mode);
	if (launchpadId === "four-meme-regular") {
		return {
			launchpad_id: "four-meme-regular",
			chain,
			launchpad_config: { kind: "four-meme-regular" },
			fee_mode: feeMode,
		};
	}
	if (launchpadId === "four-meme-tax") {
		const launchpadConfig = parseFourMemeTaxConfig(input.launchpad_config, config);
		if (!launchpadConfig) return null;
		return { launchpad_id: "four-meme-tax", chain, launchpad_config: launchpadConfig, fee_mode: feeMode };
	}
	if (launchpadId === "flap") return "unsupported";
	return "unsupported";
}

function mapFourMemeTaxSplit(
	safe: ProvisionSafe,
	launchpadConfig: FourMemeTaxLaunchpadConfig,
	config: ProvisionAdapterConfig,
): NonNullable<AgentLaunchInput["taxSplit"]> {
	const recipientBps = launchpadConfig.allocation.founderBps + launchpadConfig.platformCutBps;
	if (launchpadConfig.platformCutBps <= 0 || recipientBps <= 0) {
		return { agentBps: safe.taxAgentBps, patronBps: safe.taxPatronBps, patronAddress: safe.owners[0] };
	}
	if (!config.platformWallet) throw new Error("platform wallet is required for four.meme tax platform cut");
	const platformAddress = config.platformWallet;
	const platformBps = Math.round((launchpadConfig.platformCutBps * 10000) / recipientBps);
	const remainingBps = 10000 - platformBps;
	const agentBps = Math.round((remainingBps * safe.taxAgentBps) / 10000);
	const patronBps = remainingBps - agentBps;
	return {
		agentBps,
		patronBps,
		platformBps,
		platformAddress,
		patronAddress: safe.owners[0],
	};
}

function mapFourMemeTaxConfig(config: FourMemeTaxLaunchpadConfig): NonNullable<AgentLaunchInput["tax"]> {
	const onChainFounderBps = config.allocation.founderBps + config.platformCutBps;
	const onChainTotal =
		onChainFounderBps + config.allocation.holderBps + config.allocation.burnBps + config.allocation.liquidityBps;
	if (onChainTotal !== 10000) throw new Error(`tax allocation must sum to 10000, got ${onChainTotal}`);
	const minSharing = normalizeFourMemeMinSharing(config.minHolderBalance);
	if (minSharing === null) throw new Error("minHolderBalance is not four.meme compatible");
	return {
		feeRate: (config.taxBps / 100) as 1 | 3 | 5 | 10,
		burnRate: config.allocation.burnBps / 100,
		divideRate: config.allocation.holderBps / 100,
		liquidityRate: config.allocation.liquidityBps / 100,
		recipientRate: onChainFounderBps / 100,
		minSharing,
	};
}

function buildProvisionPersonaMetadata(payload: ProvisionRequest, patron: PatronContext) {
	const { inviteCode, persona, runtime, safe, launchpad, ...unhandled } = payload;
	assertNoUnhandledFields(unhandled);
	return {
		inviteCode,
		personaPrompt: persona.personaPrompt,
		avatarTemplateId: persona.avatarTemplateId,
		hasAvatarUpload: persona.hasAvatarUpload,
		runtimeKind: runtime.kind,
		webhookUrl: runtime.kind === "webhook" ? runtime.webhookUrl : null,
		runtimeWebhookSecretHash:
			runtime.kind === "webhook" && runtime.webhookSecret ? hashWebhookSecret(runtime.webhookSecret) : null,
		ownerStewardUserId: patron.stewardUserId,
		ownerAddress: patron.primaryAddress ?? safe.owners[0] ?? null,
		safe: {
			owners: safe.owners,
			threshold: safe.threshold,
			firstBuyFundingSource: safe.firstBuyFundingSource,
			adapters: safe.adapters,
		},
		launchpad,
	};
}

export function provisionPayloadToLaunchInput(
	payload: ProvisionRequest,
	patron: PatronContext,
	config: ProvisionAdapterConfig,
	slugifyAgentId: (name: string) => string,
	defaultImageUrl: string,
): AgentLaunchInput {
	const { inviteCode: _inviteCode, persona, runtime: _runtime, safe, launchpad, ...unhandled } = payload;
	assertNoUnhandledFields(unhandled);
	const base: AgentLaunchInput = {
		agentId: slugifyAgentId(persona.name),
		name: persona.name,
		symbol: persona.ticker,
		description: persona.bio,
		imageUrl: defaultImageUrl,
		persona: buildProvisionPersonaMetadata(payload, patron),
		taxSplit: {
			agentBps: safe.taxAgentBps,
			patronBps: safe.taxPatronBps,
			patronAddress: safe.owners[0],
		},
	};

	if (!launchpad) return base;
	const {
		launchpad_id: launchpadId,
		chain: _chain,
		launchpad_config: launchpadConfig,
		fee_mode: _feeMode,
		...padRest
	} = launchpad;
	assertNoUnhandledFields(padRest);
	switch (launchpadId) {
		case "four-meme-regular":
			return { ...base, launchpad: { id: "four-meme-regular", feeConfig: launchpadConfig } };
		case "four-meme-tax":
			return {
				...base,
				tax: mapFourMemeTaxConfig(launchpadConfig),
				taxSplit: mapFourMemeTaxSplit(safe, launchpadConfig, config),
				launchpad: { id: "four-meme-tax", feeConfig: launchpadConfig },
			};
		case "flap":
			return {
				...base,
				launchpad: {
					id: "flap",
					feeConfig: launchpadConfig,
					...(config.platformWallet ? { platformWalletAddress: config.platformWallet } : {}),
					...(config.flapVaultPortalAddress ? { flapVaultPortalAddress: config.flapVaultPortalAddress } : {}),
					...(config.flapSplitVaultFactoryAddress
						? { flapSplitVaultFactoryAddress: config.flapSplitVaultFactoryAddress }
						: {}),
				},
			};
		default:
			return assertNever(launchpadId);
	}
}

export function validateProvisionRequest(
	body: unknown,
	patron: PatronContext,
	config: ProvisionAdapterConfig,
	slugifyAgentId: (name: string) => string,
	defaultImageUrl: string,
): ProvisionValidationResult {
	if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "body must be an object" };
	const input = body as Record<string, unknown>;
	const inviteCode = readString(input.inviteCode);
	if (!inviteCode) return { ok: false, message: "inviteCode is required" };

	const personaInput = input.persona;
	if (!personaInput || typeof personaInput !== "object" || Array.isArray(personaInput)) {
		return { ok: false, message: "persona is required" };
	}
	const personaRecord = personaInput as Record<string, unknown>;
	const name = readString(personaRecord.name);
	if (!name || name.length < 2 || name.length > 48) return { ok: false, message: "persona.name must be 2-48 chars" };
	const ticker = readString(personaRecord.ticker);
	if (!ticker || !/^[A-Z0-9]{2,10}$/.test(ticker)) {
		return { ok: false, message: "persona.ticker must be 2-10 uppercase letters or digits" };
	}
	const bio = readString(personaRecord.bio);
	if (!bio || bio.length > 240) return { ok: false, message: "persona.bio must be 1-240 chars" };
	const persona: ProvisionPersona = {
		name,
		ticker,
		bio,
		personaPrompt: readNullableString(personaRecord.personaPrompt),
		avatarTemplateId: readNullableString(personaRecord.avatarTemplateId),
		hasAvatarUpload: Boolean(personaRecord.hasAvatarUpload),
	};

	const runtimeInput = input.runtime;
	if (!runtimeInput || typeof runtimeInput !== "object" || Array.isArray(runtimeInput)) {
		return { ok: false, message: "runtime.kind is required" };
	}
	const runtimeRecord = runtimeInput as Record<string, unknown>;
	const kind = runtimeRecord.kind;
	if (typeof kind !== "string" || (kind !== "hosted" && kind !== "webhook" && kind !== "pull")) {
		return { ok: false, message: typeof kind === "string" ? "runtime.kind is invalid" : "runtime.kind is required" };
	}
	let runtime: ProvisionRuntime;
	if (kind === "webhook") {
		const webhookUrl = readString(runtimeRecord.webhookUrl);
		if (!webhookUrl) return { ok: false, message: "runtime.webhookUrl is required for webhook runtime" };
		try {
			const parsed = new URL(webhookUrl);
			if (parsed.protocol !== "https:") return { ok: false, message: "runtime.webhookUrl must be https" };
		} catch {
			return { ok: false, message: "runtime.webhookUrl is invalid" };
		}
		runtime = { kind, webhookUrl, webhookSecret: readNullableString(runtimeRecord.webhookSecret) };
	} else if (kind === "pull") {
		runtime = { kind };
	} else {
		runtime = { kind };
	}

	const safeInput = input.safe;
	if (!safeInput || typeof safeInput !== "object" || Array.isArray(safeInput))
		return { ok: false, message: "safe is required" };
	const safeRecord = safeInput as Record<string, unknown>;
	const taxAgentBps = readNumber(safeRecord.taxAgentBps);
	const taxPatronBps = readNumber(safeRecord.taxPatronBps);
	if (taxAgentBps === null || taxPatronBps === null) return { ok: false, message: "safe tax bps are required" };
	if (taxAgentBps < 0 || taxPatronBps < 0 || taxAgentBps + taxPatronBps !== 10000) {
		return { ok: false, message: "safe tax bps must sum to 10000" };
	}
	if (!Array.isArray(safeRecord.owners) || safeRecord.owners.length === 0) {
		return { ok: false, message: "safe.owners must include at least one address" };
	}
	const owners = safeRecord.owners.filter(
		(owner): owner is `0x${string}` => typeof owner === "string" && isAddress(owner),
	);
	if (owners.length !== safeRecord.owners.length)
		return { ok: false, message: "safe.owners contains an invalid address" };
	const [firstOwner, ...restOwners] = owners;
	if (!firstOwner) return { ok: false, message: "safe.owners must include at least one address" };
	const safe: ProvisionSafe = {
		taxAgentBps,
		taxPatronBps,
		owners: [firstOwner, ...restOwners],
		threshold: readNumber(safeRecord.threshold) ?? 1,
		firstBuyFundingSource: readNullableString(safeRecord.firstBuyFundingSource),
		adapters: safeRecord.adapters,
	};

	const launchpad = parseProvisionLaunchpad(input.launchpad, config);
	if (launchpad === "unsupported") {
		return { ok: false, message: "launchpad not supported", code: "LAUNCHPAD_NOT_SUPPORTED" };
	}
	if (input.launchpad !== undefined && input.launchpad !== null && launchpad === null) {
		return { ok: false, message: "launchpad config is invalid" };
	}

	const payload: ProvisionRequest = { inviteCode, persona, runtime, safe, launchpad };
	return {
		ok: true,
		body: payload,
		launchInput: provisionPayloadToLaunchInput(payload, patron, config, slugifyAgentId, defaultImageUrl),
		pullRuntime: runtime.kind === "pull",
	};
}
