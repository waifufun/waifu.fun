import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Database } from "@waifufun/db";
import { parseEther, parseUnits } from "viem";
import { buildNavSnapshot, enumeratorsFor } from "./nav/aggregator.js";
import { enumerateEvmErc20Balances } from "./nav/enumerators/evm-erc20.js";
import { enumerateEvmNativeBalance } from "./nav/enumerators/evm-native.js";
import { enumerateHyperliquid } from "./nav/enumerators/hyperliquid.js";
import { enumeratePcsV3Lp } from "./nav/enumerators/pancake-v3-lp.js";
import { enumeratePolymarket } from "./nav/enumerators/polymarket.js";
import { clearCoinGeckoPriceCacheForTest, fetchCoinGeckoTokenPrices } from "./nav/pricing/coingecko.js";
import { clearDexScreenerPriceCacheForTest, fetchDexScreenerTokenPrice } from "./nav/pricing/dexscreener.js";
import { fetchPcsV3TwapPriceUsd } from "./nav/pricing/pcs-v3-twap.js";

const DB = {} as Database;
const AGENT = "0x15fc00000000000000000000000000000000abcd";
const WALLET = "0x0000000000000000000000000000000000000001";
const TOKEN = "0x0000000000000000000000000000000000000002";
const POLY_WALLET = {
	id: "poly-1",
	address: "0x204f72f35326db932158cba6adff0b9a1da95e14",
	chain: "polygon" as const,
	role: "venue-bridge" as const,
	venue: "polymarket",
	label: "Polymarket",
};

function loadPolymarketFixture(): unknown {
	return JSON.parse(
		readFileSync(new URL("../../test/fixtures/polymarket-positions.sample.json", import.meta.url), "utf8"),
	);
}

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

test("HyperLiquid enumerator values the account line at full equity, not free collateral", async () => {
	const previousDexs = process.env.HL_BUILDER_DEXS;
	process.env.HL_BUILDER_DEXS = "";
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
					// Free collateral is 12.34 but the account also has margin
					// locked into the open BTC perp; accountValue (98.76) is the
					// true equity the NAV line must carry.
					withdrawable: "12.34",
					marginSummary: { accountValue: "98.76" },
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
	if (previousDexs === undefined) delete process.env.HL_BUILDER_DEXS;
	else process.env.HL_BUILDER_DEXS = previousDexs;
	assert.equal(result.holdings.length, 2);
	// The account line carries full equity (accountValue), NOT withdrawable.
	const account = result.holdings[0]!;
	assert.equal(account.asset, "USDC");
	assert.equal(account.kind, "spot");
	assert.equal(account.venue, "hyperliquid");
	assert.equal(account.priced, true);
	assert.equal(account.balance, 98.76);
	assert.equal(account.valueUsd, 98.76);
	// Free collateral is preserved on metadata for the health strip.
	assert.equal(account.metadata?.withdrawableUsd, 12.34);
	assert.equal(account.metadata?.accountValueUsd, 98.76);
	// The perp row stays unpriced (valueUsd: null) so it is DETAIL only and is
	// not double-counted on top of accountValue.
	assert.equal(result.holdings[1]?.valueUsd, null);
	assert.equal(result.holdings[1]?.kind, "perp");
	assert.equal(result.holdings[1]?.asset, "BTC-USD");
	assert.equal(result.holdings[1]?.balance, 0.5);
	assert.equal(result.holdings[1]?.side, "long");
	assert.equal(result.holdings[1]?.entryPriceUsd, 65000);
	assert.equal(result.holdings[1]?.unrealizedPnlUsd, 123.45);
	assert.equal(result.holdings[1]?.liquidationPriceUsd, 50000);
});

test("HyperLiquid enumerator marks failed builder-dex fetches stale", async () => {
	const previousDexs = process.env.HL_BUILDER_DEXS;
	process.env.HL_BUILDER_DEXS = "xyz,bad";
	try {
		const wallet = {
			walletId: "hl1",
			walletAddress: WALLET,
			walletLabel: "hl",
			walletRole: "agent-hot",
			chain: "bsc",
		} as const;
		const result = await enumerateHyperliquid(wallet, {
			fetch: async (_url, init) => {
				const body = JSON.parse(String((init as { body?: string } | undefined)?.body ?? "{}")) as { dex?: string };
				if (body.dex === "bad") return new Response("bad dex", { status: 500 }) as any;
				const state = body.dex
					? {
							marginSummary: { accountValue: "25" },
							assetPositions: [{ position: { coin: "xyz:SPCX", szi: "1", unrealizedPnl: "2" } }],
						}
					: { marginSummary: { accountValue: "100" }, assetPositions: [] };
				return new Response(JSON.stringify(state)) as any;
			},
		});
		assert.equal(result.holdings.some((holding) => holding.asset === "xyz:USDC"), true);
		assert.deepEqual(result.stale, [
			{ source: "hyperliquid:builder-dex:bad", reason: "empty-builder-dex-state" },
		]);
	} finally {
		if (previousDexs === undefined) delete process.env.HL_BUILDER_DEXS;
		else process.env.HL_BUILDER_DEXS = previousDexs;
	}
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
});

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
		enumeratePcsV3Lp: async () => ({ holdings: [], stale: [] }),
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

test("Polymarket enumerator maps live-shaped fixture positions", async () => {
	let requestedUrl = "";
	const result = await enumeratePolymarket(POLY_WALLET, {
		fetch: (async (url: URL | string) => {
			requestedUrl = String(url);
			return new Response(JSON.stringify(loadPolymarketFixture()));
		}) as typeof fetch,
		logger: { warn() {} },
	});
	assert.equal(result.stale.length, 0);
	assert.equal(result.holdings.length, 3);
	assert.match(requestedUrl, /data-api\.polymarket\.com\/positions/);
	assert.match(requestedUrl, /sizeThreshold=0\.01/);
	const first = result.holdings[0]!;
	assert.equal(first.walletId, "poly-1");
	assert.equal(first.walletAddress, POLY_WALLET.address);
	assert.equal(first.chain, "polygon");
	assert.equal(first.kind, "prediction");
	assert.equal(first.venue, "polymarket");
	assert.equal(first.asset, "nba-okc-sas-2026-05-22-thunder");
	assert.equal(first.contract, "0xb199b50c41036d63dbf69a754810f580daf37cfdcaa0ff16c9f7d9e8c2f6eb24");
	assert.equal(first.balance, 27156.0119);
	assert.equal(first.valueUsd, 11812.8651);
	assert.equal(first.priceUsd, 0.435);
	assert.equal(first.priced, true);
	assert.equal(first.metadata?.marketSlug, "nba-okc-sas-2026-05-22");
	assert.equal(first.metadata?.outcomeIndex, 0);
	assert.equal(first.metadata?.outcome, "Thunder");
	assert.equal(first.metadata?.shares, 27156.0119);
	assert.equal(first.metadata?.avgPrice, 0.406);
	assert.equal(first.metadata?.pnlUsd, 784.9715);
	assert.equal(first.metadata?.pnlPct, 7.118);
});

test("Polymarket enumerator returns empty holdings for empty response", async () => {
	const result = await enumeratePolymarket(POLY_WALLET, {
		fetch: (async () => new Response(JSON.stringify([]))) as typeof fetch,
		logger: { warn() {} },
	});
	assert.deepEqual(result, { holdings: [], stale: [] });
});

test("Polymarket enumerator skips malformed responses and logs warning", async () => {
	const warnings: unknown[] = [];
	const notArray = await enumeratePolymarket(POLY_WALLET, {
		fetch: (async () => new Response(JSON.stringify({ nope: true }))) as typeof fetch,
		logger: { warn: (...args: unknown[]) => warnings.push(args) },
	});
	assert.deepEqual(notArray, { holdings: [], stale: [] });
	assert.equal(warnings.length, 1);

	const malformedRows = await enumeratePolymarket(POLY_WALLET, {
		fetch: (async () =>
			new Response(JSON.stringify([{ size: 0 }, { size: 1, slug: "ok", outcome: "Yes" }]))) as typeof fetch,
		logger: { warn: (...args: unknown[]) => warnings.push(args) },
	});
	assert.equal(malformedRows.holdings.length, 1);
	assert.equal(warnings.length, 2);
});

test("Polymarket pricing uses current value per share and preserves positive pnl", async () => {
	const result = await enumeratePolymarket(POLY_WALLET, {
		fetch: (async () =>
			new Response(
				JSON.stringify([
					{
						conditionId: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
						asset: "123",
						slug: "edge-case-market",
						outcome: "Yes",
						outcomeIndex: 0,
						size: 10,
						avgPrice: 0.5,
						currentValue: 6,
						cashPnl: 1,
						percentPnl: 20,
					},
				]),
			)) as typeof fetch,
		logger: { warn() {} },
	});
	assert.equal(result.holdings[0]?.priceUsd, 0.6);
	assert.equal(result.holdings[0]?.valueUsd, 6);
	assert.equal(result.holdings[0]?.entryPriceUsd, 0.5);
	assert.equal(result.holdings[0]?.unrealizedPnlUsd, 1);
	assert.equal(result.holdings[0]?.metadata?.pnlPct, 20);
});

test("NAV aggregator routes polymarket venue wallets to prediction enumerator", async () => {
	const snapshot = await buildNavSnapshot(AGENT, {
		db: DB,
		now: () => 1779435600000,
		getAgentTokenAddress: async () => AGENT,
		listWallets: async () => [POLY_WALLET],
		enumeratePolymarket: async (wallet) => ({
			holdings: [
				{
					walletId: wallet.id,
					walletAddress: wallet.address,
					walletLabel: wallet.label,
					walletRole: wallet.role,
					chain: "polygon",
					asset: "market-yes",
					contract: "0xcondition",
					balance: 10,
					priceUsd: 0.6,
					valueUsd: 6,
					priced: true,
					kind: "prediction",
					venue: "polymarket",
				},
			],
			stale: [],
		}),
		fetchNativePrices: async () => {
			throw new Error("should not price polymarket as polygon spot");
		},
	});
	assert.equal(snapshot.navUsd, 6);
	assert.equal(snapshot.byChain.polygon, 6);
	assert.equal(snapshot.holdings[0]?.kind, "prediction");
});

test(
	"Polymarket live smoke returns public positions when explicitly enabled",
	{ skip: !process.env.POLYMARKET_LIVE_TEST },
	async () => {
		const result = await enumeratePolymarket(POLY_WALLET);
		assert.ok(result.holdings.length > 0 || result.stale.length > 0);
	},
);
