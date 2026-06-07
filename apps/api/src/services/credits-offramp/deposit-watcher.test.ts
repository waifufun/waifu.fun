import assert from "node:assert/strict";
import test from "node:test";

import { BSC_USDT_CONTRACT, BscDepositWatcher } from "./deposit-watcher.js";

const SAFE = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const NOW_MS = 1_700_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

function ankrResponse(transactions: unknown[]) {
	return {
		ok: true,
		status: 200,
		async json() {
			return { result: { transactions } };
		},
	} as unknown as Response;
}

function nodeRealResponse(transfers: unknown[]) {
	return {
		ok: true,
		status: 200,
		async json() {
			return { result: { transfers } };
		},
	} as unknown as Response;
}

function withEnv<T>(updates: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
	const prev = Object.fromEntries(Object.keys(updates).map((key) => [key, process.env[key]]));
	for (const [key, value] of Object.entries(updates)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	return fn().finally(() => {
		for (const [key, value] of Object.entries(prev)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	});
}

function withAnkrKey<T>(fn: () => Promise<T>): Promise<T> {
	return withEnv({ ANKR_API_KEY: "test-ankr-key", ALCHEMY_BSC_URL: undefined }, fn);
}

function withNodeReal<T>(fn: () => Promise<T>): Promise<T> {
	return withEnv(
		{
			ALCHEMY_BSC_URL: "https://bsc-mainnet.nodereal.io/v1/test",
			ANKR_API_KEY: undefined,
			ANKR_MULTICHAIN_API_KEY: undefined,
			ANKR_RPC_KEY: undefined,
			BSCSCAN_API_KEY: undefined,
			BSC_SCAN_API_KEY: undefined,
			BSC_API_KEY: undefined,
		},
		fn,
	);
}

test("detectDeposits returns inbound BNB transfers to the safe, ignoring outbound and self", async () => {
	await withAnkrKey(async () => {
		const watcher = new BscDepositWatcher({
			fetchImpl: (async () =>
				ankrResponse([
					{ hash: "0xaaa", to: SAFE, from: OTHER, value: "1000000000000000000", timestamp: NOW_S - 100 }, // 1 BNB inbound
					{ hash: "0xbbb", to: OTHER, from: SAFE, value: "500000000000000000", timestamp: NOW_S - 100 }, // outbound, ignore
					{ hash: "0xccc", to: SAFE, from: SAFE, value: "500000000000000000", timestamp: NOW_S - 100 }, // self, ignore
				])) as unknown as typeof fetch,
			now: () => NOW_MS,
			logger: console,
		});
		const deposits = await watcher.detectDeposits({ safeAddress: SAFE, lookbackSeconds: 3600 });
		assert.equal(deposits.length, 1);
		assert.equal(deposits[0]?.depositTxHash, "0xaaa");
		assert.equal(deposits[0]?.valueBnb, 1);
		assert.equal(deposits[0]?.from.toLowerCase(), OTHER);
	});
});

test("detectDeposits returns canonical BSC USDT transfers from NodeReal as USD-native candidates", async () => {
	await withNodeReal(async () => {
		let requestBody: unknown;
		const watcher = new BscDepositWatcher({
			fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
				requestBody = JSON.parse(String((init as RequestInit).body));
				return nodeRealResponse([
					{
						hash: "0xusdt",
						to: SAFE,
						from: OTHER,
						contractAddress: BSC_USDT_CONTRACT,
						value: "0x8ac7230489e80000", // 10 USDT, 18 decimals
						decimal: "18",
						blockTimeStamp: NOW_S - 60,
						category: "20",
					},
				]);
			}) as unknown as typeof fetch,
			now: () => NOW_MS,
			logger: console,
		});
		const deposits = await watcher.detectDeposits({ safeAddress: SAFE, lookbackSeconds: 3600, minDepositBnb: 100 });
		assert.equal(deposits.length, 1);
		assert.equal(deposits[0]?.asset, "USDT");
		assert.equal(deposits[0]?.valueUsd, 10);
		assert.equal(deposits[0]?.valueBnb, 0);
		assert.deepEqual(
			(requestBody as { params: Array<{ category: string[]; addressType: string }> }).params[0]?.category,
			["20"],
		);
		assert.equal((requestBody as { params: Array<{ addressType: string }> }).params[0]?.addressType, "to");
		assert.equal((requestBody as { params: Array<{ pageKey?: string }> }).params[0]?.pageKey, undefined);
	});
});

test("detectDeposits paginates NodeReal before filtering to canonical USDT", async () => {
	await withNodeReal(async () => {
		const pageKeys: Array<string | undefined> = [];
		const watcher = new BscDepositWatcher({
			fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
				const body = JSON.parse(String(init?.body)) as { params: Array<{ pageKey?: string }> };
				const pageKey = body.params[0]?.pageKey;
				pageKeys.push(pageKey);
				if (!pageKey) {
					return {
						ok: true,
						status: 200,
						async json() {
							return {
								result: {
									pageKey: "page-2",
									transfers: [
										{
											hash: "0xspam-newer",
											to: SAFE,
											from: OTHER,
											contractAddress: "0xcE24439F2D9C6a2289F741120FE202248B666666",
											value: "0x8ac7230489e80000",
											decimal: "18",
											blockTimeStamp: NOW_S - 10,
										},
									],
								},
							};
						},
					} as unknown as Response;
				}
				return nodeRealResponse([
					{
						hash: "0xusdt-page2",
						to: SAFE,
						from: OTHER,
						contractAddress: BSC_USDT_CONTRACT,
						value: "0x8ac7230489e80000",
						decimal: "18",
						blockTimeStamp: NOW_S - 20,
					},
				]);
			}) as unknown as typeof fetch,
			now: () => NOW_MS,
			logger: console,
		});
		const deposits = await watcher.detectDeposits({ safeAddress: SAFE, lookbackSeconds: 3600 });
		assert.deepEqual(pageKeys, [undefined, "page-2"]);
		assert.equal(deposits[0]?.asset, "USDT");
		assert.equal(deposits[0]?.valueUsd, 10);
	});
});

test("detectDeposits merges NodeReal USDT with BNB fallback deposits", async () => {
	await withEnv(
		{ ALCHEMY_BSC_URL: "https://bsc-mainnet.nodereal.io/v1/test", ANKR_API_KEY: "test-ankr-key" },
		async () => {
			const watcher = new BscDepositWatcher({
				fetchImpl: (async (url: string | URL | Request) => {
					if (String(url).includes("nodereal")) {
						return nodeRealResponse([
							{
								hash: "0xusdt",
								to: SAFE,
								from: OTHER,
								contractAddress: BSC_USDT_CONTRACT,
								value: "0x8ac7230489e80000",
								decimal: "18",
								blockTimeStamp: NOW_S - 60,
							},
						]);
					}
					return ankrResponse([
						{ hash: "0xbnb", to: SAFE, from: OTHER, value: "1000000000000000000", timestamp: NOW_S - 60 },
					]);
				}) as unknown as typeof fetch,
				now: () => NOW_MS,
				logger: console,
			});
			const deposits = await watcher.detectDeposits({ safeAddress: SAFE, lookbackSeconds: 3600 });
			assert.deepEqual(
				deposits.map((deposit) => deposit.asset),
				["USDT", "BNB"],
			);
		},
	);
});

test("detectDeposits rejects spam BEP20 tokens from NodeReal", async () => {
	await withNodeReal(async () => {
		const watcher = new BscDepositWatcher({
			fetchImpl: (async () =>
				nodeRealResponse([
					{
						hash: "0xspam",
						to: SAFE,
						from: OTHER,
						contractAddress: "0xcE24439F2D9C6a2289F741120FE202248B666666",
						value: "0x8ac7230489e80000",
						decimal: "18",
						blockTimeStamp: NOW_S - 60,
					},
				])) as unknown as typeof fetch,
			now: () => NOW_MS,
			logger: console,
		});
		const deposits = await watcher.detectDeposits({ safeAddress: SAFE, lookbackSeconds: 3600 });
		assert.deepEqual(deposits, []);
	});
});

test("detectDeposits respects the minDepositBnb floor and the seen set (idempotency)", async () => {
	await withAnkrKey(async () => {
		const watcher = new BscDepositWatcher({
			fetchImpl: (async () =>
				ankrResponse([
					{ hash: "0xsmall", to: SAFE, from: OTHER, value: "10000000000000000", timestamp: NOW_S - 50 }, // 0.01 BNB
					{ hash: "0xbig", to: SAFE, from: OTHER, value: "2000000000000000000", timestamp: NOW_S - 50 }, // 2 BNB
					{ hash: "0xseen", to: SAFE, from: OTHER, value: "3000000000000000000", timestamp: NOW_S - 50 }, // 3 BNB, already seen
				])) as unknown as typeof fetch,
			now: () => NOW_MS,
			logger: console,
		});
		const deposits = await watcher.detectDeposits({
			safeAddress: SAFE,
			lookbackSeconds: 3600,
			minDepositBnb: 0.1,
			seenTxHashes: new Set(["0xseen"]),
		});
		assert.equal(deposits.length, 1);
		assert.equal(deposits[0]?.depositTxHash, "0xbig");
	});
});

test("detectDeposits drops transfers outside the lookback window", async () => {
	await withAnkrKey(async () => {
		const watcher = new BscDepositWatcher({
			fetchImpl: (async () =>
				ankrResponse([
					{ hash: "0xold", to: SAFE, from: OTHER, value: "1000000000000000000", timestamp: NOW_S - 10_000 },
					{ hash: "0xrecent", to: SAFE, from: OTHER, value: "1000000000000000000", timestamp: NOW_S - 100 },
				])) as unknown as typeof fetch,
			now: () => NOW_MS,
			logger: console,
		});
		const deposits = await watcher.detectDeposits({ safeAddress: SAFE, lookbackSeconds: 3600 });
		assert.equal(deposits.length, 1);
		assert.equal(deposits[0]?.depositTxHash, "0xrecent");
	});
});

test("detectDeposits returns [] when no provider key is configured", async () => {
	const prevAnkr = process.env.ANKR_API_KEY;
	const prevAnkr2 = process.env.ANKR_MULTICHAIN_API_KEY;
	const prevAnkr3 = process.env.ANKR_RPC_KEY;
	const prevBsc = process.env.BSCSCAN_API_KEY;
	const prevBsc2 = process.env.BSC_SCAN_API_KEY;
	const prevBsc3 = process.env.BSC_API_KEY;
	const prevNodeReal = process.env.ALCHEMY_BSC_URL;
	delete process.env.ANKR_API_KEY;
	delete process.env.ANKR_MULTICHAIN_API_KEY;
	delete process.env.ANKR_RPC_KEY;
	delete process.env.BSCSCAN_API_KEY;
	delete process.env.BSC_SCAN_API_KEY;
	delete process.env.BSC_API_KEY;
	delete process.env.ALCHEMY_BSC_URL;
	try {
		const watcher = new BscDepositWatcher({
			fetchImpl: (async () => {
				throw new Error("should not fetch without a key");
			}) as unknown as typeof fetch,
			now: () => NOW_MS,
			logger: { warn() {} },
		});
		const deposits = await watcher.detectDeposits({ safeAddress: SAFE, lookbackSeconds: 3600 });
		assert.deepEqual(deposits, []);
	} finally {
		if (prevAnkr !== undefined) process.env.ANKR_API_KEY = prevAnkr;
		if (prevAnkr2 !== undefined) process.env.ANKR_MULTICHAIN_API_KEY = prevAnkr2;
		if (prevAnkr3 !== undefined) process.env.ANKR_RPC_KEY = prevAnkr3;
		if (prevBsc !== undefined) process.env.BSCSCAN_API_KEY = prevBsc;
		if (prevBsc2 !== undefined) process.env.BSC_SCAN_API_KEY = prevBsc2;
		if (prevBsc3 !== undefined) process.env.BSC_API_KEY = prevBsc3;
		if (prevNodeReal !== undefined) process.env.ALCHEMY_BSC_URL = prevNodeReal;
	}
});
