import assert from "node:assert/strict";
import test from "node:test";
import {
	BONK_MINT,
	JUP_MINT,
	SOLANA_USDC_MINT,
	WSOL_MINT,
	clearSolanaSpotCachesForTest,
	enumerateSolanaSpot,
	fetchSolanaTokenPrice,
} from "./solana-spot.js";

const WALLET = "11111111111111111111111111111111";
const wallet = { id: "sol-wallet", address: WALLET, chain: "solana", role: "agent-hot", label: "Solana hot" } as const;

function tokenAccount(mint: string, amount: string, decimals: number, uiAmount?: number) {
	return {
		account: {
			data: {
				parsed: {
					info: {
						mint,
						tokenAmount: { amount, decimals, uiAmount: uiAmount ?? Number(amount) / 10 ** decimals },
					},
				},
			},
		},
	};
}

test.afterEach(clearSolanaSpotCachesForTest);

test("Solana spot enumerator returns priced SOL balance", async () => {
	const result = await enumerateSolanaSpot(wallet, {
		now: () => 1000,
		getConnection: () =>
			({
				getBalance: async () => 1_500_000_000,
				getParsedTokenAccountsByOwner: async () => ({ value: [] }),
			}) as any,
		fetch: (async (input: string | URL) => {
			const url = String(input);
			if (url.includes("tokens")) return new Response(JSON.stringify([]));
			assert.match(url, /price\.jup\.ag/);
			return new Response(JSON.stringify({ data: { [WSOL_MINT]: { price: 200 } } }));
		}) as any,
	});
	assert.deepEqual(result.stale, []);
	assert.equal(result.holdings.length, 1);
	assert.equal(result.holdings[0]?.asset, "SOL");
	assert.equal(result.holdings[0]?.balance, 1.5);
	assert.equal(result.holdings[0]?.priceUsd, 200);
	assert.equal(result.holdings[0]?.valueUsd, 300);
});

test("Solana spot enumerator returns multiple non-zero SPL tokens and skips zero balances", async () => {
	const result = await enumerateSolanaSpot(wallet, {
		now: () => 2000,
		getConnection: () =>
			({
				getBalance: async () => 0,
				getParsedTokenAccountsByOwner: async () => ({
					value: [
						tokenAccount(SOLANA_USDC_MINT, "2500000", 6, 2.5),
						tokenAccount(JUP_MINT, "3000000000", 6, 3000),
						tokenAccount(BONK_MINT, "0", 5, 0),
					],
				}),
			}) as any,
		fetch: (async (input: string | URL) => {
			const url = String(input);
			if (url.includes("tokens")) {
				return new Response(
					JSON.stringify([
						{ address: SOLANA_USDC_MINT, symbol: "USDC", name: "USD Coin" },
						{ address: JUP_MINT, symbol: "JUP", name: "Jupiter" },
					]),
				);
			}
			if (url.includes(`ids=${SOLANA_USDC_MINT}`)) {
				return new Response(JSON.stringify({ data: { [SOLANA_USDC_MINT]: { price: 1 } } }));
			}
			if (url.includes(`ids=${JUP_MINT}`)) {
				return new Response(JSON.stringify({ data: { [JUP_MINT]: { price: 0.5 } } }));
			}
			return new Response(JSON.stringify({ data: {} }));
		}) as any,
	});
	assert.deepEqual(
		result.holdings.map((holding) => holding.asset),
		["USDC", "JUP"],
	);
	assert.equal(result.holdings[0]?.valueUsd, 2.5);
	assert.equal(result.holdings[1]?.valueUsd, 1500);
	assert.equal(
		result.holdings.some((holding) => holding.asset === "BONK"),
		false,
	);
});

test("Solana pricing falls back Jupiter to CoinGecko to DEXScreener to unpriced", async () => {
	let coinGeckoCalls = 0;
	let dexCalls = 0;
	const cg = await fetchSolanaTokenPrice(JUP_MINT, {
		now: () => 3000,
		fetch: (async (input: string | URL) => {
			const url = String(input);
			if (url.includes("price.jup.ag")) return new Response(JSON.stringify({ data: {} }));
			if (url.includes("coingecko")) {
				coinGeckoCalls++;
				return new Response(JSON.stringify({ [JUP_MINT]: { usd: 0.75 } }));
			}
			throw new Error(`unexpected ${url}`);
		}) as any,
	});
	assert.equal(cg.source, "coingecko");
	assert.equal(cg.priceUsd, 0.75);
	assert.equal(coinGeckoCalls, 1);

	const unknownMint = "Unknown111111111111111111111111111111111111";
	const dex = await fetchSolanaTokenPrice(unknownMint, {
		now: () => 70_000,
		fetch: (async (input: string | URL) => {
			const url = String(input);
			if (url.includes("price.jup.ag")) return new Response(JSON.stringify({ data: {} }));
			if (url.includes("coingecko")) return new Response(JSON.stringify({}));
			if (url.includes("dexscreener")) {
				dexCalls++;
				return new Response(JSON.stringify({ pairs: [{ priceUsd: "0.001", liquidity: { usd: 100 } }] }));
			}
			throw new Error(`unexpected ${url}`);
		}) as any,
	});
	assert.equal(dex.source, "dexscreener");
	assert.equal(dex.priceUsd, 0.001);
	assert.equal(dexCalls, 1);

	const unpriced = await fetchSolanaTokenPrice("NoPrice111111111111111111111111111111111111", {
		now: () => 140_000,
		fetch: (async (input: string | URL) => {
			const url = String(input);
			if (url.includes("price.jup.ag")) return new Response(JSON.stringify({ data: {} }));
			if (url.includes("coingecko")) return new Response(JSON.stringify({}));
			if (url.includes("dexscreener")) return new Response(JSON.stringify({ pairs: [] }));
			throw new Error(`unexpected ${url}`);
		}) as any,
	});
	assert.equal(unpriced.source, "unpriced");
	assert.equal(unpriced.priced, false);
});

test.skip("manual Solana mainnet integration enumerates a known address", async () => {
	// Enable locally by removing .skip and setting SOLANA_RPC_URL (Helius recommended).
	// This is intentionally skipped in CI: unit coverage above mocks RPC and HTTP.
	const result = await enumerateSolanaSpot("7LkKcY4XVFgCXyiYdHG8v6PzQEn3Lro8o2QFciS5ScN5");
	assert.ok(Array.isArray(result.holdings));
});

test("Solana spot aggregator path accepts direct priced holdings", async () => {
	const { buildNavSnapshot } = await import("../aggregator.js");
	const snapshot = await buildNavSnapshot("0x15fc00000000000000000000000000000000abcd", {
		db: {} as any,
		now: () => 1779435600000,
		getAgentTokenAddress: async () => "0x15fc00000000000000000000000000000000abcd",
		listWallets: async () => [wallet],
		enumerateSolana: async () => ({
			holdings: [
				{
					walletId: wallet.id,
					walletAddress: wallet.address,
					walletLabel: wallet.label,
					walletRole: wallet.role,
					chain: "solana",
					asset: "JUP",
					contract: JUP_MINT,
					balance: 10,
					priceUsd: 0.5,
					valueUsd: 5,
					priced: true,
				},
			],
			stale: [],
		}),
	});
	assert.equal(snapshot.navUsd, 5);
	assert.equal(snapshot.byChain.solana, 5);
});
