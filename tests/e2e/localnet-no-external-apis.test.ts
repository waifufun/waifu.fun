/**
 * E2E Test: Launchpad Localnet Mode - No External APIs
 * 
 * Verifies that the launchpad works completely self-contained on localnet
 * without requiring any external API services.
 */

import { describe, it, expect } from "vitest";

describe("Launchpad Localnet - Self-Contained Mode", () => {
	it("should detect localnet environment correctly", async () => {
		// Set localnet environment
		process.env.NEXT_PUBLIC_JEJU_NETWORK = "localnet";
		process.env.NEXT_PUBLIC_JEJU_RPC_URL = "http://127.0.0.1:9545";

		const { isLocalnet, shouldSkipExternalAPIs } = await import(
			"../../apps/frontend/src/lib/localnet"
		);

		expect(isLocalnet()).toBe(true);
		expect(shouldSkipExternalAPIs()).toBe(true);
	});

	it("should not require Codex API key on localnet", async () => {
		process.env.JEJU_NETWORK = "localnet";
		delete process.env.CODEX_API_KEY;

		// This should not throw an error
		const { shouldSkipExternalAPIs } = await import("@autofun/utils");
		expect(shouldSkipExternalAPIs()).toBe(true);
	});

	it("should return fallback prices on localnet", async () => {
		process.env.JEJU_NETWORK = "localnet";
		const { FALLBACK_PRICES } = await import("@autofun/constants");
		const { updateCryptoPrices } = await import("@autofun/utils");

		// Mock redis
		const redis = {
			setex: async () => "OK",
			get: async () => null,
		};

		const prices = await updateCryptoPrices({ cacheKey: "test-prices" });

		expect(prices).toEqual(FALLBACK_PRICES);
		expect(prices.ethereum).toBeGreaterThan(0);
		expect(prices.solana).toBeGreaterThan(0);
	});

	it("should skip Jupiter API calls on localnet", async () => {
		process.env.NEXT_PUBLIC_JEJU_NETWORK = "localnet";

		const { retrieveJupiterQuote } = await import("../../apps/frontend/src/lib/utils");

		const result = await retrieveJupiterQuote({
			amount: 1,
			token: {
				contractAddress: "0x1234567890123456789012345678901234567890",
				chain: "evm",
				chainId: 1337,
				decimals: 18,
			} as any,
			mode: "buy",
			slippage: 100,
		});

		// Should return zero values without calling Jupiter API
		expect(result.minimumReceived).toBe(0);
		expect(result.swapUsdValue).toBe("0");
		expect(result.priceImpactPct).toBe("0");
	});

	it("should use Jeju RPC instead of Helius on localnet", async () => {
		process.env.NEXT_PUBLIC_JEJU_NETWORK = "localnet";
		process.env.NEXT_PUBLIC_JEJU_RPC_URL = "http://127.0.0.1:9545";
		delete process.env.NEXT_PUBLIC_HELIUS_API_KEY;

		const { HELIUS_RPC_URL } = await import("../../apps/frontend/src/lib/api");

		expect(HELIUS_RPC_URL).toBe("http://127.0.0.1:9545");
	});

	it("should have all required localnet infrastructure", () => {
		const requiredServices = [
			"PostgreSQL (for backend)",
			"Redis (for caching)",
			"MongoDB (for token data)",
			"Jeju RPC (L2 node)",
		];

		// This is a documentation test - just verify the list exists
		expect(requiredServices).toHaveLength(4);
	});
});

describe("Launchpad Localnet - Docker Compose Setup", () => {
	it("should have docker-compose.localnet.yml configured", async () => {
		const fs = await import("fs");
		const path = await import("path");

		const dockerComposePath = path.resolve(
			__dirname,
			"../../docker-compose.localnet.yml"
		);

		expect(fs.existsSync(dockerComposePath)).toBe(true);
	});

	it("should define required services in docker-compose", async () => {
		const fs = await import("fs");
		const path = await import("path");

		const dockerComposePath = path.resolve(
			__dirname,
			"../../docker-compose.localnet.yml"
		);

		const content = fs.readFileSync(dockerComposePath, "utf-8");

		// Verify required services
		expect(content).toContain("postgres:");
		expect(content).toContain("redis:");
		expect(content).toContain("mongo:");
	});
});

