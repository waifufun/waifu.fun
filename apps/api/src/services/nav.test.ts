import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "@waifufun/db";
import { parseEther, parseUnits } from "viem";
import { buildNavSnapshot, enumeratorsFor } from "./nav/aggregator.js";
import { enumerateEvmErc20Balances } from "./nav/enumerators/evm-erc20.js";
import { enumerateEvmNativeBalance } from "./nav/enumerators/evm-native.js";
import { enumerateHyperliquid } from "./nav/enumerators/hyperliquid.js";
import { enumeratePcsV3Lp } from "./nav/enumerators/pancake-v3-lp.js";
import { clearCoinGeckoPriceCacheForTest, fetchCoinGeckoTokenPrices } from "./nav/pricing/coingecko.js";
import { clearDexScreenerPriceCacheForTest, fetchDexScreenerTokenPrice } from "./nav/pricing/dexscreener.js";
import { fetchPcsV3TwapPriceUsd } from "./nav/pricing/pcs-v3-twap.js";

const DB = {} as Database;
const AGENT = "0x15fc00000000000000000000000000000000abcd";
const WALLET = "0x0000000000000000000000000000000000000001";
const TOKEN = "0x0000000000000000000000000000000000000002";

test.afterEach(() => {
	clearCoinGeckoPriceCacheForTest();
	clearDexScreenerPriceCacheForTest();
});

test("NAV aggregator computes priced and unpriced holdings without failing whole snapshot", async () => {
	const snapshot = await buildNavSnapshot(AGENT, {
		db: DB,
		now: () => 1779435600000,
		getAgentTokenAddress: async () => AGENT,
		listWallets: async () => [{ id: "w1", address: WALLET, chain: "bsc", role: "agent-safe", label: "safe" }],
		enumerateNative: async () => ({
			holdings: [{ asset: "BNB", balance: 1, raw: parseEther("1").toString() }],
			stale: [],
		}),
		enumerateErc20: async () => ({
			holdings: [
				{ contract: TOKEN, symbol: "WAIFU", decimals: 18, balance: 100, raw: parseUnits("100", 18).toString() },
			],
			stale: [{ source: "bsc:scanner", reason: "rate-limit" }],
		}),
		fetchNativePrices: async () => ({ binancecoin: { priceUsd: 600, priced: true, source: "native" } }),
		fetchTokenPrices: async () => ({ [TOKEN]: { priceUsd: 0.01, priced: true, source: "coingecko" } }),
	});
	assert.equal(snapshot.navUsd, 601);
	assert.equal(snapshot.byChain.bsc, 601);
	assert.equal(snapshot.byWallet.w1, 601);
	assert.equal(snapshot.stale[0]?.reason, "rate-limit");
});

test("NAV aggregator combines native, ERC20, HyperLiquid, and PCS V3 LP enumerators", async () => {
	const wallet = {
		id: "w1",
		address: WALLET,
		chain: "bsc",
		role: "agent-safe",
		label: "safe",
		venue: "hyperliquid",
	} as const;
	assert.deepEqual(enumeratorsFor(wallet), ["native", "erc20", "pcs-v3-lp", "hyperliquid"]);
	const snapshot = await buildNavSnapshot(AGENT, {
		db: DB,
		now: () => 1779435600000,
		getAgentTokenAddress: async () => AGENT,
		listWallets: async () => [wallet],
		enumerateNative: async () => ({
			holdings: [{ asset: "BNB", balance: 1, raw: parseEther("1").toString() }],
			stale: [],
		}),
		enumerateErc20: async () => ({
			holdings: [{ contract: TOKEN, symbol: "WAIFU", decimals: 18, balance: 2, raw: parseUnits("2", 18).toString() }],
			stale: [],
		}),
		enumerateHyperliquid: async (base) => ({
			holdings: [
				{
					...base,
					asset: "USDC",
					contract: null,
					balance: 3,
					priceUsd: 1,
					valueUsd: 3,
					priced: true,
					kind: "spot",
					venue: "hyperliquid",
				},
			],
			stale: [],
		}),
		enumeratePcsV3Lp: async (base) => ({
			holdings: [
				{
					...base,
					asset: "PCS-V3-LP-1",
					contract: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364",
					balance: 1,
					priceUsd: null,
					valueUsd: null,
					priced: false,
					kind: "lp",
					venue: "pancakeswap-v3",
					tokenId: "1",
				},
			],
			stale: [],
		}),
		fetchNativePrices: async () => ({ binancecoin: { priceUsd: 10, priced: true, source: "native" } }),
		fetchTokenPrices: async () => ({ [TOKEN]: { priceUsd: 5, priced: true, source: "coingecko" } }),
	});
	assert.equal(snapshot.holdings.length, 4);
	assert.equal(snapshot.navUsd, 23);
	assert.deepEqual(snapshot.unpriced.assets, ["PCS-V3-LP-1"]);
});

test("EVM native enumerator returns balance and degrades on RPC failure", async () => {
	const ok = await enumerateEvmNativeBalance(WALLET, "bsc", {
		getClient: () => ({ getBalance: async () => parseEther("1.5") }) as any,
	});
	assert.equal(ok.holdings[0]?.asset, "BNB");
	assert.equal(ok.holdings[0]?.balance, 1.5);
	const failed = await enumerateEvmNativeBalance(WALLET, "bsc", {
		getClient: () =>
			({
				getBalance: async () => {
					throw new Error("timeout");
				},
			}) as any,
	});
	assert.deepEqual(failed.stale, [{ source: "bsc:evm-native", reason: "timeout" }]);
});

test("EVM ERC20 enumerator handles scanner discovery and 429 manual fallback", async () => {
	const discovered = await enumerateEvmErc20Balances(WALLET, "bsc", undefined, {
		manualAllowlist: { bsc: [] },
		fetch: async () =>
			new Response(
				JSON.stringify({ result: [{ contractAddress: TOKEN, tokenSymbol: "TST", tokenDecimal: "18" }] }),
			) as any,
		getClient: () => ({ multicall: async () => [{ status: "success", result: parseUnits("42", 18) }] }) as any,
	});
	assert.equal(discovered.holdings[0]?.balance, 42);
	const fallback = await enumerateEvmErc20Balances(WALLET, "bsc", undefined, {
		manualAllowlist: { bsc: [{ contract: TOKEN, symbol: "TST", decimals: 18 }] },
		fetch: async () => new Response("rate limited", { status: 429 }) as any,
		getClient: () => ({ multicall: async () => [{ status: "success", result: parseUnits("1", 18) }] }) as any,
	});
	assert.equal(fallback.holdings[0]?.symbol, "TST");
	assert.equal(fallback.stale[0]?.reason, "rate-limit");
});

test("HyperLiquid enumerator parses USDC margin and open perps", async () => {
	const wallet = {
		walletId: "hl1",
		walletAddress: WALLET,
		walletLabel: "hl",
		walletRole: "agent-hot",
		chain: "bsc",
	} as const;
	const result = await enumerateHyperliquid(wallet, {
		fetch: async () =>
			new Response(
				JSON.stringify({
					withdrawable: "12.34",
					assetPositions: [
						{
							position: {
								coin: "BTC",
								szi: "0.5",
								entryPx: "65000",
								unrealizedPnl: "123.45",
								liquidationPx: "50000",
								leverage: { value: 2 },
							},
						},
					],
				}),
			) as any,
	});
	assert.equal(result.holdings.length, 2);
	assert.deepEqual(result.holdings[0], {
		...wallet,
		asset: "USDC",
		contract: null,
		balance: 12.34,
		priceUsd: 1,
		valueUsd: 12.34,
		priced: true,
		kind: "spot",
		venue: "hyperliquid",
	});
	assert.equal(result.holdings[1]?.kind, "perp");
	assert.equal(result.holdings[1]?.asset, "BTC-USD");
	assert.equal(result.holdings[1]?.balance, 0.5);
	assert.equal(result.holdings[1]?.side, "long");
	assert.equal(result.holdings[1]?.entryPriceUsd, 65000);
	assert.equal(result.holdings[1]?.unrealizedPnlUsd, 123.45);
	assert.equal(result.holdings[1]?.liquidationPriceUsd, 50000);
});

test("PCS V3 LP enumerator skips empty wallets and emits one holding per NFT", async () => {
	const wallet = {
		walletId: "pcs1",
		walletAddress: WALLET,
		walletLabel: "safe",
		walletRole: "agent-safe",
		chain: "bsc",
	} as const;
	const empty = await enumeratePcsV3Lp(wallet, {
		getClient: () => ({ readContract: async () => 0n }) as any,
	});
	assert.deepEqual(empty.holdings, []);

	const rich = await enumeratePcsV3Lp(wallet, {
		getClient: () =>
			({
				readContract: async ({ functionName, args }: any) => {
					if (functionName === "balanceOf") return 2n;
					if (functionName === "tokenOfOwnerByIndex") return args[1] === 0n ? 101n : 202n;
					return [
						0n,
						"0x0000000000000000000000000000000000000000",
						"0x0000000000000000000000000000000000000002",
						"0x0000000000000000000000000000000000000003",
						2500,
						-100,
						100,
						123n,
						0n,
						0n,
						4n,
						5n,
					];
				},
			}) as any,
	});
	assert.equal(rich.holdings.length, 2);
	assert.equal(rich.holdings[0]?.kind, "lp");
	assert.equal(rich.holdings[0]?.venue, "pancakeswap-v3");
	assert.equal(rich.holdings[0]?.tokenId, "101");
	assert.equal(rich.holdings[0]?.priced, false);

test("DEXScreener pricing selects deepest liquid pair", async () => {
	const price = await fetchDexScreenerTokenPrice("bsc", TOKEN, {
		fetch: (async () =>
			new Response(
				JSON.stringify({
					pairs: [
						{
							chainId: "bsc",
							priceUsd: "0.00015",
							liquidity: { usd: 5000 },
							baseToken: { address: TOKEN },
						},
						{
							chainId: "bsc",
							priceUsd: "0.00012",
							liquidity: { usd: 50000 },
							baseToken: { address: TOKEN },
						},
					],
				}),
			)) as any,
		now: () => 1000,
	});
	assert.deepEqual(price, { priceUsd: 0.00012, priced: true, source: "dexscreener" });
});

test("DEXScreener pricing returns unpriced for empty pairs and 404", async () => {
	const empty = await fetchDexScreenerTokenPrice("bsc", TOKEN, {
		fetch: (async () => new Response(JSON.stringify({ pairs: [] }))) as any,
		now: () => 1000,
	});
	assert.deepEqual(empty, { priceUsd: null, priced: false, source: "unpriced" });

	clearDexScreenerPriceCacheForTest();
	const missing = await fetchDexScreenerTokenPrice("bsc", TOKEN, {
		fetch: (async () => new Response("not found", { status: 404 })) as any,
		now: () => 1000,
	});
	assert.deepEqual(missing, { priceUsd: null, priced: false, source: "unpriced" });
});

test("DEXScreener pricing caches successful results", async () => {
	let calls = 0;
	const deps = {
		fetch: (async () => {
			calls++;
			return new Response(
				JSON.stringify({
					pairs: [{ chainId: "bsc", priceUsd: "0.00012", liquidity: { usd: 50000 }, baseToken: { address: TOKEN } }],
				}),
			);
		}) as any,
		now: () => 1000,
	};
	const first = await fetchDexScreenerTokenPrice("bsc", TOKEN, deps);
	const second = await fetchDexScreenerTokenPrice("bsc", TOKEN, deps);
	assert.equal(calls, 1);
	assert.equal(first.priceUsd, 0.00012);
	assert.deepEqual(second, first);
});

test("NAV aggregator falls back CoinGecko-unpriced tokens to DEXScreener before PCS", async () => {
	let pcsCalls = 0;
	const snapshot = await buildNavSnapshot(AGENT, {
		db: DB,
		now: () => 1779435600000,
		getAgentTokenAddress: async () => AGENT,
		listWallets: async () => [{ id: "w1", address: WALLET, chain: "bsc", role: "agent-safe", label: "safe" }],
		enumerateNative: async () => ({ holdings: [], stale: [] }),
		enumerateErc20: async () => ({
			holdings: [
				{
					contract: TOKEN,
					symbol: "WAIFU",
					decimals: 18,
					balance: 100_000_000,
					raw: parseUnits("100000000", 18).toString(),
				},
			],
			stale: [],
		}),
		fetchNativePrices: async () => ({ binancecoin: { priceUsd: 600, priced: true, source: "native" } }),
		fetchTokenPrices: async () => ({ [TOKEN]: { priceUsd: null, priced: false, source: "unpriced" } }),
		fetchDexScreenerPrice: async () => ({ priceUsd: 0.00012, priced: true, source: "dexscreener" }),
		fetchPcsPrice: async () => {
			pcsCalls++;
			return { priceUsd: null, priced: false, source: "unpriced" };
		},
	});
	assert.equal(snapshot.holdings[0]?.priceUsd, 0.00012);
	assert.equal(snapshot.holdings[0]?.valueUsd, 12_000);
	assert.equal(snapshot.navUsd, 12_000);
	assert.equal(pcsCalls, 0);
});

test("pricing services cache CoinGecko and derive PCS V3 TWAP fallback", async () => {
	let calls = 0;
	const cg = await fetchCoinGeckoTokenPrices("bsc", ["0xabc"], {
		fetch: (async () => {
			calls++;
			return new Response(JSON.stringify({ "0xabc": { usd: 2 } }));
		}) as any,
		now: () => 1000,
	});
	await fetchCoinGeckoTokenPrices("bsc", ["0xabc"], {
		fetch: (async () => {
			calls++;
			return new Response("{}");
		}) as any,
		now: () => 2000,
	});
	assert.equal(calls, 1);
	assert.equal(cg["0xabc"]?.priceUsd, 2);
	const pcs = await fetchPcsV3TwapPriceUsd(TOKEN, 18, 600, {
		getClient: () =>
			({
				readContract: async ({ functionName }: any) =>
					functionName === "getPool"
						? "0x0000000000000000000000000000000000000003"
						: functionName === "token0"
							? TOKEN
							: [2n ** 96n, 0, 0, 0, 0, 0, true],
			}) as any,
	});
	assert.equal(pcs.priceUsd, 600);
});
