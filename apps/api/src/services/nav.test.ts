import assert from "node:assert/strict";
import test from "node:test";
import type { Database } from "@waifufun/db";
import { parseEther, parseUnits } from "viem";
import { buildNavSnapshot } from "./nav/aggregator.js";
import { enumerateEvmErc20Balances } from "./nav/enumerators/evm-erc20.js";
import { enumerateEvmNativeBalance } from "./nav/enumerators/evm-native.js";
import { clearCoinGeckoPriceCacheForTest, fetchCoinGeckoTokenPrices } from "./nav/pricing/coingecko.js";
import { fetchPcsV3TwapPriceUsd } from "./nav/pricing/pcs-v3-twap.js";

const DB = {} as Database;
const AGENT = "0x15fc00000000000000000000000000000000abcd";
const WALLET = "0x0000000000000000000000000000000000000001";
const TOKEN = "0x0000000000000000000000000000000000000002";

test.afterEach(clearCoinGeckoPriceCacheForTest);

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
