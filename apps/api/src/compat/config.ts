import type { AppConfig } from "../contracts/services.js";
import { logger } from "../lib/logger.js";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
	if (value == null) return fallback;
	return value === "1" || value.toLowerCase() === "true";
}

function parseNumber(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function getConfig(): AppConfig {
	// Warn (don't crash) if steward auth is not configured
	if (!process.env.STEWARD_JWT_SECRET) {
		logger.warn("STEWARD_JWT_SECRET not set; steward JWT auth will be disabled");
	}

	return {
		app: {
			name: "waifu-api",
			env: process.env.NODE_ENV ?? "development",
			host: process.env.API_HOST ?? "0.0.0.0",
			port: parseNumber(process.env.API_PORT, 3100),
			corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:3000")
				.split(",")
				.map((origin) => origin.trim())
				.filter(Boolean),
		},
		auth: {
			accessTokenTtlSeconds: parseNumber(process.env.JWT_ACCESS_TTL, 900),
			refreshTokenTtlSeconds: parseNumber(process.env.JWT_REFRESH_TTL, 2_592_000),
		},
		chain: {
			chainId: parseNumber(process.env.BSC_CHAIN_ID, 56),
			rpcUrl: process.env.BSC_RPC_URL ?? "https://bsc-dataseed.binance.org",
			portalAddress: process.env.FLAP_PORTAL_ADDRESS ?? "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
			nativeQuoteTokenSymbol: "BNB",
		},
		flap: {
			uploadApiUrl: process.env.FLAP_UPLOAD_API_URL ?? "https://funcs.flap.sh/api/upload",
			metadataGatewayBaseUrl: process.env.FLAP_METADATA_GATEWAY_BASE_URL ?? "https://flap.mypinata.cloud/ipfs",
		},
		features: {
			curatedLaunchOnly: parseBoolean(process.env.CURATED_LAUNCH_ONLY, true),
		},
		steward: {
			jwtSecret: process.env.STEWARD_JWT_SECRET ?? "",
			apiUrl: process.env.STEWARD_API_URL ?? "https://eliza.steward.fi",
			tenantId: process.env.STEWARD_TENANT_ID ?? "waifu",
			tenantApiKey: process.env.STEWARD_TENANT_API_KEY ?? "",
		},
	};
}
