import { z } from "zod";

import {
	type ChainKey,
	type ChainNetwork,
	DEFAULT_CHAIN_ID,
	type HexAddress,
	type SupportedChainId,
	getChainConfig,
	isSupportedChainId,
} from "./chains.js";

const hexAddressSchema = z
	.string()
	.regex(/^0x[a-fA-F0-9]{40}$/)
	.transform((value) => value.toLowerCase() as HexAddress);

const booleanFromEnvSchema = z.preprocess((value) => {
	if (typeof value === "boolean") {
		return value;
	}

	if (typeof value === "number") {
		return value !== 0;
	}

	if (typeof value === "string") {
		const normalized = value.trim().toLowerCase();

		if (["1", "true", "yes", "on"].includes(normalized)) {
			return true;
		}

		if (["0", "false", "no", "off", ""].includes(normalized)) {
			return false;
		}
	}

	return value;
}, z.boolean());

const nodeEnvSchema = z.enum(["development", "test", "production"]);
const positivePortSchema = z.coerce.number().int().min(1).max(65_535);
const positiveIntSchema = z.coerce.number().int().positive();
const nonNegativeBigIntSchema = z.coerce.bigint().refine((value) => value >= 0n, {
	message: "Expected a non-negative bigint",
});
const supportedChainIdFromEnvSchema = z.coerce
	.number()
	.int()
	.refine(isSupportedChainId, { message: "Unsupported BSC chain id" })
	.transform((value) => value as SupportedChainId);

const rawEnvSchema = z.object({
	NODE_ENV: nodeEnvSchema.default("development"),
	APP_NAME: z.string().min(1).default("waifu-core"),
	API_HOST: z.string().min(1).default("0.0.0.0"),
	API_PORT: positivePortSchema.default(3_100),
	CORS_ORIGIN: z.string().default("https://waifu.fun,https://www.waifu.fun,https://waifufun.pages.dev"),
	DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/waifu_core"),
	REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
	BSC_CHAIN_ID: supportedChainIdFromEnvSchema.default(DEFAULT_CHAIN_ID),
	BSC_RPC_URL: z.string().url().optional(),
	FLAP_PORTAL_ADDRESS: hexAddressSchema.optional(),
	FLAP_UPLOAD_API_URL: z.string().url().optional(),
	FLAP_UPLOAD_API_KEY: z.string().default(""),
	INDEXER_START_BLOCK: nonNegativeBigIntSchema.default(0n),
	INDEXER_POLL_INTERVAL: positiveIntSchema.default(2_000),
	JWT_SECRET: z.string().min(1).default("change-me"),
	JWT_ACCESS_TTL: positiveIntSchema.default(900),
	JWT_REFRESH_TTL: positiveIntSchema.default(2_592_000),
	JWT_ISSUER: z.string().min(1).default("waifu-core"),
	CURATED_LAUNCH_ONLY: booleanFromEnvSchema.default(true),
});

type RawEnv = z.infer<typeof rawEnvSchema>;

export interface Env {
	NODE_ENV: z.infer<typeof nodeEnvSchema>;
	APP_NAME: string;
	API_HOST: string;
	API_PORT: number;
	CORS_ORIGIN: string;
	DATABASE_URL: string;
	REDIS_URL: string;
	BSC_CHAIN_ID: SupportedChainId;
	BSC_RPC_URL: string;
	FLAP_PORTAL_ADDRESS: HexAddress;
	FLAP_UPLOAD_API_URL: string;
	FLAP_UPLOAD_API_KEY: string;
	INDEXER_START_BLOCK: bigint;
	INDEXER_POLL_INTERVAL: number;
	JWT_SECRET: string;
	JWT_ACCESS_TTL: number;
	JWT_REFRESH_TTL: number;
	JWT_ISSUER: string;
	CURATED_LAUNCH_ONLY: boolean;
}

export interface AppConfig {
	app: {
		name: string;
		env: Env["NODE_ENV"];
		host: string;
		port: number;
		corsOrigins: string[];
	};
	db: {
		url: string;
	};
	redis: {
		url: string;
	};
	auth: {
		issuer: string;
		accessTokenTtlSeconds: number;
		refreshTokenTtlSeconds: number;
	};
	jwt: {
		secret: string;
		issuer: string;
		accessTokenTtlSeconds: number;
		refreshTokenTtlSeconds: number;
	};
	chain: {
		key: ChainKey;
		chainId: SupportedChainId;
		network: ChainNetwork;
		name: string;
		rpcUrl: string;
		portalAddress: HexAddress;
		nativeSymbol: string;
		explorerUrl: string;
	};
	flap: {
		portalAddress: HexAddress;
		uploadApiUrl: string;
		uploadApiKey: string;
		standardTokenImplementation: HexAddress;
		taxTokenV1Implementation: HexAddress;
		taxTokenV2Implementation: HexAddress;
		taxTokenV3Implementation: HexAddress | undefined;
		vanitySuffix: {
			standard: "8888";
			tax: "7777";
		};
	};
	indexer: {
		startBlock: bigint;
		pollIntervalMs: number;
	};
	features: {
		curatedLaunchOnly: boolean;
	};
}

function resolveEnvDefaults(parsed: RawEnv): Env {
	const chain = getChainConfig(parsed.BSC_CHAIN_ID);

	return {
		...parsed,
		BSC_RPC_URL: parsed.BSC_RPC_URL ?? chain.defaultRpcUrl,
		FLAP_PORTAL_ADDRESS: parsed.FLAP_PORTAL_ADDRESS ?? chain.flap.portalAddress,
		FLAP_UPLOAD_API_URL: parsed.FLAP_UPLOAD_API_URL ?? chain.flap.uploadApiUrl,
	};
}

function parseCorsOrigins(value: string): string[] {
	return value
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
}

export const envSchema = rawEnvSchema.transform(resolveEnvDefaults);

export function parseEnv(input: NodeJS.ProcessEnv): Env {
	return envSchema.parse(input);
}

export function getConfig(input: NodeJS.ProcessEnv = process.env): AppConfig {
	const parsed = parseEnv(input);
	const chain = getChainConfig(parsed.BSC_CHAIN_ID);
	const taxTokenV3Implementation =
		"taxTokenV3Implementation" in chain.flap ? chain.flap.taxTokenV3Implementation : undefined;

	return {
		app: {
			name: parsed.APP_NAME,
			env: parsed.NODE_ENV,
			host: parsed.API_HOST,
			port: parsed.API_PORT,
			corsOrigins: parseCorsOrigins(parsed.CORS_ORIGIN),
		},
		db: {
			url: parsed.DATABASE_URL,
		},
		redis: {
			url: parsed.REDIS_URL,
		},
		auth: {
			issuer: parsed.JWT_ISSUER,
			accessTokenTtlSeconds: parsed.JWT_ACCESS_TTL,
			refreshTokenTtlSeconds: parsed.JWT_REFRESH_TTL,
		},
		jwt: {
			secret: parsed.JWT_SECRET,
			issuer: parsed.JWT_ISSUER,
			accessTokenTtlSeconds: parsed.JWT_ACCESS_TTL,
			refreshTokenTtlSeconds: parsed.JWT_REFRESH_TTL,
		},
		chain: {
			key: chain.key,
			chainId: chain.id,
			network: chain.network,
			name: chain.name,
			rpcUrl: parsed.BSC_RPC_URL,
			portalAddress: parsed.FLAP_PORTAL_ADDRESS,
			nativeSymbol: chain.nativeCurrency.symbol,
			explorerUrl: chain.explorerUrl,
		},
		flap: {
			portalAddress: parsed.FLAP_PORTAL_ADDRESS,
			uploadApiUrl: parsed.FLAP_UPLOAD_API_URL,
			uploadApiKey: parsed.FLAP_UPLOAD_API_KEY,
			standardTokenImplementation: chain.flap.standardTokenImplementation,
			taxTokenV1Implementation: chain.flap.taxTokenV1Implementation,
			taxTokenV2Implementation: chain.flap.taxTokenV2Implementation,
			taxTokenV3Implementation,
			vanitySuffix: chain.flap.vanitySuffix,
		},
		indexer: {
			startBlock: parsed.INDEXER_START_BLOCK,
			pollIntervalMs: parsed.INDEXER_POLL_INTERVAL,
		},
		features: {
			curatedLaunchOnly: parsed.CURATED_LAUNCH_ONLY,
		},
	};
}

export const env = parseEnv(process.env);
export const config = getConfig(process.env);
