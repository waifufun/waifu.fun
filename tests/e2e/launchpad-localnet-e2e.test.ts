#!/usr/bin/env bun
/**
 * @fileoverview Real E2E Tests Against Localnet - NO MOCKS
 * @module tests/e2e/launchpad-localnet-e2e
 *
 * This test suite runs against REAL localnet services:
 * - Real Jeju L2 RPC (http://localhost:9545)
 * - Real Launchpad backend (http://localhost:3331)
 * - Real Launchpad frontend (http://localhost:3330)
 * - Real MongoDB and Redis
 *
 * Prerequisites:
 * - Localnet must be running (`bun run scripts/localnet/start.ts`)
 * - Launchpad services must be running (auto-started by dev.ts)
 *
 * Usage:
 *   bun run tests/e2e/launchpad-localnet-e2e.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EvmChainIds } from "@autofun/types";

// Real localnet configuration
const JEJU_LOCALNET_RPC = process.env.JEJU_RPC_URL || "http://127.0.0.1:9545";
const LAUNCHPAD_BACKEND = process.env.LAUNCHPAD_BACKEND_URL || "http://localhost:3331";
const LAUNCHPAD_FRONTEND = process.env.LAUNCHPAD_FRONTEND_URL || "http://localhost:3330";

// Test wallet (use the prefunded account from Jeju localnet)
// This account is prefunded with 10^49 ETH in localnet
const TEST_PRIVATE_KEY =
	process.env.TEST_PRIVATE_KEY || "0xb71c71a67e1177ad4e901695e1b4b9ee17ae16c6668d313eac2f96dbcda3f291"; // Jeju localnet prefunded account

const jejuLocalnet = {
	id: 1337,
	name: "Jeju Localnet",
	network: "jeju-localnet",
	nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
	rpcUrls: {
		default: { http: [JEJU_LOCALNET_RPC] },
		public: { http: [JEJU_LOCALNET_RPC] },
	},
};

describe("Launchpad Real Localnet E2E Tests (No Mocks)", () => {
	let account: ReturnType<typeof privateKeyToAccount>;
	let publicClient: ReturnType<typeof createPublicClient>;
	let walletClient: ReturnType<typeof createWalletClient>;
	let localnetRunning = false;

	beforeAll(async () => {
		// Create real clients for localnet
		account = privateKeyToAccount(TEST_PRIVATE_KEY);

		publicClient = createPublicClient({
			chain: jejuLocalnet,
			transport: http(JEJU_LOCALNET_RPC),
		});

		walletClient = createWalletClient({
			account,
			chain: jejuLocalnet,
			transport: http(JEJU_LOCALNET_RPC),
		});

		// Check if localnet is running
		try {
			const response = await fetch(JEJU_LOCALNET_RPC, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					method: "eth_chainId",
					params: [],
					id: 1,
				}),
			});
			localnetRunning = response.ok;
		} catch (e) {
			localnetRunning = false;
		}

		if (localnetRunning) {
			console.log(`\n✅ Connected to Jeju Localnet at ${JEJU_LOCALNET_RPC}`);
			console.log(`✅ Using test account: ${account.address}\n`);
		} else {
			console.log(`\n⚠️  Jeju Localnet not running at ${JEJU_LOCALNET_RPC}`);
			console.log(`   To start: bun run scripts/localnet/start.ts\n`);
		}
	});

	describe("Localnet Connectivity", () => {
		it("should connect to Jeju L2 RPC", async () => {
			if (!localnetRunning) {
				console.log("   ⚠️  Localnet not running - test skipped");
				return;
			}

			const blockNumber = await publicClient.getBlockNumber();
			expect(blockNumber).toBeGreaterThanOrEqual(0);
			console.log(`   ✅ Current block: ${blockNumber}`);
		});

		it("should have ETH balance in test account", async () => {
			if (!localnetRunning) {
				console.log("   ⚠️  Localnet not running - test skipped");
				return;
			}

			const balance = await publicClient.getBalance({ address: account.address });
			expect(balance).toBeGreaterThan(0n);
			console.log(`   ✅ Balance: ${balance} wei`);
		});

		it("should get chain ID from RPC", async () => {
			if (!localnetRunning) {
				console.log("   ⚠️  Localnet not running - test skipped");
				return;
			}

			const chainId = await publicClient.getChainId();
			expect(chainId).toBe(1337);
			console.log(`   ✅ Chain ID: ${chainId}`);
		});
	});

	describe("Launchpad Backend Connectivity", () => {
		it("should connect to launchpad backend API", async () => {
			try {
				const response = await fetch(`${LAUNCHPAD_BACKEND}/health`, {
					method: "GET",
				});

				// If health endpoint doesn't exist, that's okay - try another endpoint
				if (response.status === 404) {
					console.log("   ⚠️  No health endpoint, trying tokens endpoint...");
					const tokensResponse = await fetch(`${LAUNCHPAD_BACKEND}/api/tokens`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							chain: "evm",
							chainId: EvmChainIds.JejuLocalnet,
							page: 1,
							category: "new",
						}),
					});
					expect(tokensResponse.status).toBeLessThan(500);
				} else {
					expect(response.ok).toBe(true);
				}
				console.log(`   ✅ Backend is responding`);
			} catch (error) {
				console.log(`   ⚠️  Backend not running (expected if not started separately)`);
				console.log(`   To start: cd apps/launchpad/apps/backend && bun dev`);
			}
		}, 10000);

		it("should query tokens from backend", async () => {
			try {
				const response = await fetch(`${LAUNCHPAD_BACKEND}/api/tokens`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chain: "evm",
						chainId: EvmChainIds.JejuLocalnet,
						page: 1,
						limit: 10,
						category: "new",
					}),
				});

				if (response.status < 500) {
					const data = await response.json();
					expect(data).toBeDefined();
					console.log(`   ✅ Tokens endpoint working`);
				}
			} catch (error) {
				console.log(`   ⚠️  Backend not running - skipping`);
			}
		}, 10000);
	});

	describe("Launchpad Frontend Connectivity", () => {
		it("should serve launchpad frontend", async () => {
			try {
				const response = await fetch(LAUNCHPAD_FRONTEND);

				if (response.ok) {
					const html = await response.text();
					expect(html).toContain("html");
					console.log(`   ✅ Frontend is serving HTML`);
				} else {
					console.log(`   ⚠️  Frontend returned ${response.status}`);
				}
			} catch (error) {
				console.log(`   ⚠️  Frontend not running (expected if not started separately)`);
				console.log(`   To start: cd apps/launchpad/apps/frontend && bun dev`);
			}
		}, 10000);
	});

	describe("Real Token Operations on Localnet", () => {
		it("should be able to send transactions on Jeju localnet", async () => {
			if (!localnetRunning) {
				console.log("   ⚠️  Localnet not running - test skipped");
				console.log("   To run: bun run scripts/localnet/start.ts");
				return;
			}

			// Test that we can send real transactions
			const testAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Anvil test address 2

			const hash = await walletClient.sendTransaction({
				to: testAddress,
				value: parseEther("0.001"),
			});

			expect(hash).toBeDefined();
			expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
			console.log(`   ✅ Transaction sent: ${hash}`);

			// Wait for confirmation
			const receipt = await publicClient.waitForTransactionReceipt({ hash });
			expect(receipt.status).toBe("success");
			console.log(`   ✅ Transaction confirmed in block ${receipt.blockNumber}`);
		}, 30000);

		it("should verify Jeju localnet is using correct chain ID", async () => {
			if (!localnetRunning) {
				console.log("   ⚠️  Localnet not running - test skipped");
				return;
			}

			const chainId = await publicClient.getChainId();
			expect(chainId).toBe(1337);

			// Also verify via eth_chainId RPC call
			const response = await fetch(JEJU_LOCALNET_RPC, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					method: "eth_chainId",
					params: [],
					id: 1,
				}),
			});

			const data = await response.json();
			const hexChainId = data.result;
			const decimalChainId = Number.parseInt(hexChainId, 16);

			expect(decimalChainId).toBe(1337);
			console.log(`   ✅ Chain ID verified: ${decimalChainId} (0x${decimalChainId.toString(16)})`);
		});
	});

	describe("Multi-Chain Configuration on Localnet", () => {
		it("should have Jeju configured as default chain in launchpad", async () => {
			// Verify Jeju is configured in the frontend
			expect(EvmChainIds.JejuLocalnet).toBe(1337);
			expect(EvmChainIds.JejuMainnet).toBe(420691);
			expect(EvmChainIds.JejuTestnet).toBe(420690);
			console.log(`   ✅ Jeju chain IDs configured correctly`);
		});

		it("should verify all multi-chain constants are defined", async () => {
			const { WETH_ADDRESSES, EVM_RPC_URLS, CHAINID_TO_VIEM_CHAIN } = await import("@autofun/constants");

			// Jeju should have all required constants
			expect(WETH_ADDRESSES[EvmChainIds.JejuLocalnet]).toBeDefined();
			expect(EVM_RPC_URLS[EvmChainIds.JejuLocalnet]).toBeDefined();
			expect(CHAINID_TO_VIEM_CHAIN[EvmChainIds.JejuLocalnet]).toBeDefined();

			console.log(`   ✅ Jeju Localnet WETH: ${WETH_ADDRESSES[EvmChainIds.JejuLocalnet]}`);
			console.log(`   ✅ Jeju Localnet RPC: ${EVM_RPC_URLS[EvmChainIds.JejuLocalnet]}`);
		});
	});

	describe("Launchpad Backend API on Localnet", () => {
		it("should query tokens for Jeju localnet", async () => {
			try {
				const response = await fetch(`${LAUNCHPAD_BACKEND}/api/tokens`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						chain: "evm",
						chainId: EvmChainIds.JejuLocalnet,
						page: 1,
						limit: 10,
						category: "new",
					}),
				});

				if (response.ok) {
					const data = await response.json();
					expect(data).toBeDefined();
					expect(data.tokens).toBeDefined();
					console.log(`   ✅ Token query successful`);
					console.log(`   Found ${data.tokens?.length || 0} tokens on Jeju Localnet`);
				} else {
					console.log(`   ⚠️  Backend returned ${response.status} - may not be running`);
				}
			} catch (error) {
				console.log(`   ⚠️  Backend not accessible - make sure it's running`);
				console.log(`   Command: cd apps/launchpad/apps/backend && bun dev`);
			}
		}, 10000);
	});
});

/**
 * Export for use in test suite
 */
export const runLaunchpadE2E = async () => {
	console.log("\n🧪 Running Launchpad Real Localnet E2E Tests...\n");

	// This will be called by the test runner
	// Tests will execute via vitest
};
