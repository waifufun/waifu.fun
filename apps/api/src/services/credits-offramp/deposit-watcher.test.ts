import assert from "node:assert/strict";
import test from "node:test";

import { BscDepositWatcher } from "./deposit-watcher.js";

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

function withAnkrKey<T>(fn: () => Promise<T>): Promise<T> {
	const prev = process.env.ANKR_API_KEY;
	process.env.ANKR_API_KEY = "test-ankr-key";
	return fn().finally(() => {
		if (prev === undefined) delete process.env.ANKR_API_KEY;
		else process.env.ANKR_API_KEY = prev;
	});
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
	delete process.env.ANKR_API_KEY;
	delete process.env.ANKR_MULTICHAIN_API_KEY;
	delete process.env.ANKR_RPC_KEY;
	delete process.env.BSCSCAN_API_KEY;
	delete process.env.BSC_SCAN_API_KEY;
	delete process.env.BSC_API_KEY;
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
	}
});
