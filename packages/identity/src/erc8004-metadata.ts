export const ERC8004_REGISTRATION_TYPE = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1" as const;
export const ERC8004_REGISTRATION_VERSION = "1.0" as const;
export const BSC_MAINNET_CHAIN_ID = 56 as const;
export const BSC_MAINNET_ERC8004_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

export const SOL_ELIZA_RUNTIME_ENDPOINT =
	"https://api.elizacloud.ai/v1/eliza/agents/d52e90f4-9fd6-402f-9ad3-9b5caade1bb8" as const;
export const SOL_STEWARD_TRADING_WALLET = "0xCF3104986C4ef45326A918A9F7F80DE57953Fc21" as const;
export const SOL_TOKEN_ADDRESS = "0x15fc6086064Afe50cCf4c70000C55CECb6E17777" as const;
export const SOL_AGENT_SAFE_ADDRESS = "0x440e903C5BB2C78dE33d839613316D95Ca2009E9" as const;

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const DATA_JSON_RE = /^data:application\/(json|[^;,]+\+json)(;charset=[^;,]+)?(;base64)?,/i;

export function isFirstWaifuAgentAddress(address: string): boolean {
	return address.toLowerCase() === SOL_TOKEN_ADDRESS.toLowerCase();
}

export type Erc8004Service = {
	type: string;
	endpoint: string;
	name?: string;
	version?: string;
	platform?: string;
	handle?: string;
};

export type Erc8004Registration = {
	namespace: "eip155" | string;
	chainId: number;
	registry: string;
	agentRegistry?: string;
	agentId?: string | number;
};

export type WaifuIdentityExtension = {
	tokenAddress: string;
	agentSafeAddress?: string;
	treasuryWallet?: string;
	launchDate?: string;
	stewardWallet?: string;
	agentAddress?: string;
	httpsMirror?: string;
	ipfsUri?: string;
};

export type Erc8004RegistrationFile = {
	type: typeof ERC8004_REGISTRATION_TYPE | "agent-card";
	version: typeof ERC8004_REGISTRATION_VERSION;
	name: string;
	description: string;
	image: string;
	services: Erc8004Service[];
	active: boolean;
	registrations: Erc8004Registration[];
	x402Support?: boolean;
	supportedTrust?: string[];
	waifu: WaifuIdentityExtension;
};

export type WaifuAgentRowLike = {
	address?: string | null;
	tokenAddress?: string | null;
	name?: string | null;
	bio?: string | null;
	avatarUrl?: string | null;
	twitterHandle?: string | null;
	discord?: string | null;
	cloudAgentId?: string | null;
	agentId?: string | null;
	launchedAt?: Date | string | null;
	createdAt?: Date | string | null;
};

export type WaifuAgentPersonaLike = {
	name?: string | null;
	bio?: string | null;
	avatarUrl?: string | null;
	twitterHandle?: string | null;
	discord?: string | null;
	metadata?: unknown;
	agentId?: string | null;
	tokenAddress?: string | null;
	launchedAt?: Date | string | null;
	createdAt?: Date | string | null;
};

export type BuildErc8004RegistrationFileInput = {
	agent: WaifuAgentRowLike;
	persona?: WaifuAgentPersonaLike | null;
	chainId?: number;
	registry?: string;
	agentIdOnchain?: string | number | null;
	runtimeEndpoint?: string | null;
	mcpEndpoint?: string | null;
	webUrl?: string | null;
	image?: string | null;
	waifu?: Partial<WaifuIdentityExtension>;
	services?: Erc8004Service[];
	active?: boolean;
};

export class Erc8004MetadataValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Erc8004MetadataValidationError";
	}
}

function metadataRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringFromMetadata(metadata: Record<string, unknown>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = metadata[key];
		if (typeof value === "string" && value.trim().length > 0) return value.trim();
	}
	return undefined;
}

function isoDate(value: Date | string | null | undefined): string | undefined {
	if (!value) return undefined;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return undefined;
	return date.toISOString();
}

function cleanHandle(handle: string | null | undefined): string | undefined {
	if (!handle) return undefined;
	const cleaned = handle.trim().replace(/^@/, "");
	return cleaned.length > 0 ? cleaned : undefined;
}

export function isAllowedErc8004Uri(value: string): boolean {
	if (value.startsWith("ipfs://")) return value.length > "ipfs://".length;
	if (DATA_JSON_RE.test(value)) return true;
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

export function buildAgentRegistry(
	registration: Pick<Erc8004Registration, "namespace" | "chainId" | "registry">,
): string {
	return `${registration.namespace}:${registration.chainId}:${registration.registry}`;
}

export function buildErc8004RegistrationFile(input: BuildErc8004RegistrationFileInput): Erc8004RegistrationFile {
	const persona = input.persona ?? undefined;
	const metadata = metadataRecord(persona?.metadata);
	const tokenAddress =
		input.agent.tokenAddress ?? input.agent.address ?? persona?.tokenAddress ?? input.waifu?.tokenAddress;
	const name = persona?.name ?? input.agent.name;
	const description = persona?.bio ?? input.agent.bio ?? stringFromMetadata(metadata, "description", "bio");
	const image =
		input.image ??
		stringFromMetadata(metadata, "image_url", "imageUrl", "avatar_url", "avatarUrl") ??
		persona?.avatarUrl ??
		input.agent.avatarUrl;
	const registry = input.registry ?? BSC_MAINNET_ERC8004_REGISTRY;
	const chainId = input.chainId ?? BSC_MAINNET_CHAIN_ID;
	const registration: Erc8004Registration = {
		namespace: "eip155",
		chainId,
		registry,
		agentRegistry: buildAgentRegistry({ namespace: "eip155", chainId, registry }),
		...(input.agentIdOnchain !== null && input.agentIdOnchain !== undefined ? { agentId: input.agentIdOnchain } : {}),
	};

	const services: Erc8004Service[] = [];
	const runtimeEndpoint =
		input.runtimeEndpoint ??
		stringFromMetadata(metadata, "runtimeEndpoint", "runtime_endpoint", "elizaRuntimeEndpoint");
	if (runtimeEndpoint) services.push({ type: "a2a", name: "A2A", endpoint: runtimeEndpoint });
	if (input.mcpEndpoint) services.push({ type: "mcp", name: "MCP", endpoint: input.mcpEndpoint });
	if (input.webUrl) services.push({ type: "web", name: "web", endpoint: input.webUrl });
	const twitterHandle = cleanHandle(
		persona?.twitterHandle ?? input.agent.twitterHandle ?? stringFromMetadata(metadata, "twitter", "twitterHandle"),
	);
	if (twitterHandle)
		services.push({
			type: "social",
			name: "social",
			endpoint: `https://x.com/${twitterHandle}`,
			platform: "twitter",
			handle: twitterHandle,
		});
	const discord = persona?.discord ?? input.agent.discord ?? stringFromMetadata(metadata, "discord");
	if (discord)
		services.push({ type: "social", name: "social", endpoint: discord, platform: "discord", handle: discord });
	services.push(...(input.services ?? []));

	const file: Erc8004RegistrationFile = {
		type: ERC8004_REGISTRATION_TYPE,
		version: ERC8004_REGISTRATION_VERSION,
		name: name ?? "",
		description: description ?? "",
		image: image ?? "",
		services,
		active: input.active ?? true,
		registrations: [registration],
		x402Support: false,
		supportedTrust: ["reputation", "validation"],
		waifu: {
			tokenAddress: tokenAddress ?? "",
			...((input.waifu?.agentSafeAddress ?? stringFromMetadata(metadata, "agentSafeAddress", "agent_safe_address"))
				? {
						agentSafeAddress:
							input.waifu?.agentSafeAddress ?? stringFromMetadata(metadata, "agentSafeAddress", "agent_safe_address"),
					}
				: {}),
			...((input.waifu?.treasuryWallet ?? stringFromMetadata(metadata, "treasuryWallet", "treasury_wallet"))
				? {
						treasuryWallet:
							input.waifu?.treasuryWallet ?? stringFromMetadata(metadata, "treasuryWallet", "treasury_wallet"),
					}
				: {}),
			...((input.waifu?.stewardWallet ?? stringFromMetadata(metadata, "stewardWallet", "steward_wallet"))
				? {
						stewardWallet:
							input.waifu?.stewardWallet ?? stringFromMetadata(metadata, "stewardWallet", "steward_wallet"),
					}
				: {}),
			...(input.waifu?.agentAddress ? { agentAddress: input.waifu.agentAddress } : {}),
			...(input.waifu?.httpsMirror ? { httpsMirror: input.waifu.httpsMirror } : {}),
			...(input.waifu?.ipfsUri ? { ipfsUri: input.waifu.ipfsUri } : {}),
			...(input.waifu?.launchDate
				? { launchDate: input.waifu.launchDate }
				: {
						launchDate:
							isoDate(persona?.launchedAt ?? input.agent.launchedAt ?? persona?.createdAt ?? input.agent.createdAt) ??
							new Date(0).toISOString(),
					}),
		},
	};

	validateErc8004RegistrationFile(file);
	return file;
}

export function buildSolErc8004RegistrationFile(
	overrides: Partial<BuildErc8004RegistrationFileInput> = {},
): Erc8004RegistrationFile {
	return buildErc8004RegistrationFile({
		agent: {
			address: SOL_TOKEN_ADDRESS,
			name: "Sol",
			bio: "the architect — waifu.fun v0 agent",
			twitterHandle: "0xSolace_",
		},
		runtimeEndpoint: SOL_ELIZA_RUNTIME_ENDPOINT,
		image: "https://waifu.fun/agents/sol/avatar.png",
		waifu: {
			tokenAddress: SOL_TOKEN_ADDRESS,
			agentSafeAddress: SOL_AGENT_SAFE_ADDRESS,
			stewardWallet: SOL_STEWARD_TRADING_WALLET,
			treasuryWallet: SOL_STEWARD_TRADING_WALLET,
			launchDate: "2026-05-24T00:00:00.000Z",
			...(overrides.waifu ?? {}),
		},
		...overrides,
	});
}

export function validateErc8004RegistrationFile(value: unknown): asserts value is Erc8004RegistrationFile {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Erc8004MetadataValidationError("registration file must be an object");
	const file = value as Record<string, unknown>;
	const allowedTopLevel = new Set([
		"type",
		"version",
		"name",
		"description",
		"image",
		"services",
		"active",
		"registrations",
		"x402Support",
		"supportedTrust",
		"waifu",
	]);
	for (const key of Object.keys(file)) {
		if (!allowedTopLevel.has(key)) throw new Erc8004MetadataValidationError(`unknown top-level field: ${key}`);
	}
	for (const key of ["type", "version", "name", "description", "image"] as const) {
		if (typeof file[key] !== "string" || file[key].trim().length === 0) {
			throw new Erc8004MetadataValidationError(`${key} is required`);
		}
	}
	if (file.type !== ERC8004_REGISTRATION_TYPE && file.type !== "agent-card") {
		throw new Erc8004MetadataValidationError("type must be ERC-8004 registration-v1 or agent-card");
	}
	if (file.version !== ERC8004_REGISTRATION_VERSION) throw new Erc8004MetadataValidationError("version must be 1.0");
	if (!isAllowedErc8004Uri(file.image as string))
		throw new Erc8004MetadataValidationError("image must be http(s), ipfs://, or data: JSON URI");
	if (typeof file.active !== "boolean") throw new Erc8004MetadataValidationError("active must be boolean");
	if (!Array.isArray(file.services)) throw new Erc8004MetadataValidationError("services must be an array");
	for (const [idx, service] of file.services.entries()) {
		if (!service || typeof service !== "object" || Array.isArray(service))
			throw new Erc8004MetadataValidationError(`services[${idx}] must be an object`);
		const rec = service as Record<string, unknown>;
		if (typeof rec.type !== "string" || rec.type.trim().length === 0)
			throw new Erc8004MetadataValidationError(`services[${idx}].type is required`);
		if (typeof rec.endpoint !== "string" || rec.endpoint.trim().length === 0)
			throw new Erc8004MetadataValidationError(`services[${idx}].endpoint is required`);
	}
	if (!Array.isArray(file.registrations)) throw new Erc8004MetadataValidationError("registrations must be an array");
	if (file.registrations.length < 1) throw new Erc8004MetadataValidationError("at least one registration is required");
	for (const [idx, registration] of file.registrations.entries()) {
		if (!registration || typeof registration !== "object" || Array.isArray(registration))
			throw new Erc8004MetadataValidationError(`registrations[${idx}] must be an object`);
		const rec = registration as Record<string, unknown>;
		if (typeof rec.namespace !== "string" || rec.namespace.length === 0)
			throw new Erc8004MetadataValidationError(`registrations[${idx}].namespace is required`);
		if (typeof rec.chainId !== "number" || !Number.isInteger(rec.chainId) || rec.chainId <= 0)
			throw new Erc8004MetadataValidationError(`registrations[${idx}].chainId must be a positive integer`);
		if (typeof rec.registry !== "string" || !EVM_ADDRESS_RE.test(rec.registry))
			throw new Erc8004MetadataValidationError(`registrations[${idx}].registry must be an EVM address`);
	}
	const waifu = file.waifu;
	if (!waifu || typeof waifu !== "object" || Array.isArray(waifu))
		throw new Erc8004MetadataValidationError("waifu extension is required");
	if (
		typeof (waifu as Record<string, unknown>).tokenAddress !== "string" ||
		!EVM_ADDRESS_RE.test((waifu as Record<string, unknown>).tokenAddress as string)
	) {
		throw new Erc8004MetadataValidationError("waifu.tokenAddress must be an EVM address");
	}
}
