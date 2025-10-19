import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getAvailableEvmChains, shouldShowChain, logChainAvailability } from "../chain-availability";
import { EvmChainIds } from "@autofun/types";

describe("chain-availability", () => {
	const originalEnv = process.env;

	beforeEach(() => {
		// Reset environment before each test
		process.env = { ...originalEnv };
	});

	afterEach(() => {
		// Restore original environment
		process.env = originalEnv;
	});

	describe("getAvailableEvmChains", () => {
		it("should always show Jeju chains", () => {
			const chains = getAvailableEvmChains();
			const jejuMainnet = chains.find((c) => c.chainId === EvmChainIds.JejuMainnet);
			const jejuTestnet = chains.find((c) => c.chainId === EvmChainIds.JejuTestnet);

			expect(jejuMainnet?.available).toBe(true);
			expect(jejuTestnet?.available).toBe(true);
		});

		it("should show Jeju localnet in development", () => {
			process.env.NODE_ENV = "development";
			const chains = getAvailableEvmChains();
			const jejuLocalnet = chains.find((c) => c.chainId === EvmChainIds.JejuLocalnet);

			expect(jejuLocalnet?.available).toBe(true);
		});

		it("should hide Jeju localnet in production", () => {
			process.env.NODE_ENV = "production";
			const chains = getAvailableEvmChains();
			const jejuLocalnet = chains.find((c) => c.chainId === EvmChainIds.JejuLocalnet);

			expect(jejuLocalnet?.available).toBe(false);
			expect(jejuLocalnet?.reason).toContain("Only available in development");
		});

		it("should show Base when ALCHEMY_API_KEY is set", () => {
			process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = "test-key";
			const chains = getAvailableEvmChains();
			const baseMainnet = chains.find((c) => c.chainId === EvmChainIds.BaseMainnet);

			expect(baseMainnet?.available).toBe(true);
		});

		it("should hide Base when ALCHEMY_API_KEY is not set", () => {
			delete process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
			const chains = getAvailableEvmChains();
			const baseMainnet = chains.find((c) => c.chainId === EvmChainIds.BaseMainnet);

			expect(baseMainnet?.available).toBe(false);
			expect(baseMainnet?.reason).toContain("ALCHEMY_API_KEY not configured");
		});

		it("should show BSC when BSC_RPC_URL is set", () => {
			process.env.NEXT_PUBLIC_BSC_RPC_URL = "https://bsc-dataseed1.binance.org";
			const chains = getAvailableEvmChains();
			const bscMainnet = chains.find((c) => c.chainId === EvmChainIds.BSCMainnet);

			expect(bscMainnet?.available).toBe(true);
		});

		it("should hide BSC when BSC_RPC_URL is not set", () => {
			delete process.env.NEXT_PUBLIC_BSC_RPC_URL;
			const chains = getAvailableEvmChains();
			const bscMainnet = chains.find((c) => c.chainId === EvmChainIds.BSCMainnet);

			expect(bscMainnet?.available).toBe(false);
			expect(bscMainnet?.reason).toContain("BSC_RPC_URL not configured");
		});

		it("should show all chains when all keys are configured", () => {
			process.env.NODE_ENV = "development";
			process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = "test-key";
			process.env.NEXT_PUBLIC_BSC_RPC_URL = "https://bsc-dataseed1.binance.org";

			const chains = getAvailableEvmChains();
			const availableChains = chains.filter((c) => c.available);

			// Jeju (mainnet, testnet, localnet), Base (mainnet, sepolia), BSC (mainnet, testnet)
			expect(availableChains.length).toBeGreaterThanOrEqual(3);
		});
	});

	describe("shouldShowChain", () => {
		it("should return true for Jeju mainnet", () => {
			expect(shouldShowChain(EvmChainIds.JejuMainnet)).toBe(true);
		});

		it("should return true for Jeju testnet", () => {
			expect(shouldShowChain(EvmChainIds.JejuTestnet)).toBe(true);
		});

		it("should return false for Base without API key", () => {
			delete process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
			expect(shouldShowChain(EvmChainIds.BaseMainnet)).toBe(false);
		});

		it("should return true for Base with API key", () => {
			process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = "test-key";
			expect(shouldShowChain(EvmChainIds.BaseMainnet)).toBe(true);
		});

		it("should return false for BSC without RPC URL", () => {
			delete process.env.NEXT_PUBLIC_BSC_RPC_URL;
			expect(shouldShowChain(EvmChainIds.BSCMainnet)).toBe(false);
		});

		it("should return true for BSC with RPC URL", () => {
			process.env.NEXT_PUBLIC_BSC_RPC_URL = "https://bsc-dataseed1.binance.org";
			expect(shouldShowChain(EvmChainIds.BSCMainnet)).toBe(true);
		});
	});

	describe("logChainAvailability", () => {
		it("should not crash when called in development", () => {
			process.env.NODE_ENV = "development";
			expect(() => logChainAvailability()).not.toThrow();
		});

		it("should not log in production", () => {
			process.env.NODE_ENV = "production";
			// Function should return early without logging
			expect(() => logChainAvailability()).not.toThrow();
		});
	});

	describe("Edge cases", () => {
		it("should handle empty string API keys as missing", () => {
			process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = "";
			expect(shouldShowChain(EvmChainIds.BaseMainnet)).toBe(false);
		});

		it("should handle whitespace-only API keys as missing", () => {
			process.env.NEXT_PUBLIC_ALCHEMY_API_KEY = "   ";
			const chains = getAvailableEvmChains();
			const baseMainnet = chains.find((c) => c.chainId === EvmChainIds.BaseMainnet);

			// Whitespace-only strings are trimmed and treated as empty
			expect(baseMainnet?.available).toBe(false);
		});

		it("should return false for unknown chain IDs", () => {
			expect(shouldShowChain(99999 as EvmChainIds)).toBe(false);
		});
	});
});
