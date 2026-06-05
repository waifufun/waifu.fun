import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "@waifufun/db/client";

import type {
	ElizaCryptoPaymentConfirmResult,
	ElizaCryptoPaymentCreateResult,
	ElizaCryptoStatus,
} from "../eliza-client.js";
import { CreditsAutoMinter, type MintLedger } from "./auto-mint.js";
import { BscDepositWatcher, type DepositCandidate } from "./deposit-watcher.js";
import { CreditsOffRamp, type OffRampElizaClient } from "./index.js";
import type { OffRampLimitsConfig } from "./limits.js";

const BSC_RECEIVE = "0x93cacdacdf6791be31ea44742ca94db238c887eb";

function statusWithBsc(): ElizaCryptoStatus {
	return {
		enabled: true,
		directWallet: {
			enabled: true,
			networks: [{ network: "bsc", chainId: 56, receiveAddress: BSC_RECEIVE, enabled: true }],
		},
	};
}

/** Mock Eliza client: records create+confirm calls, automatable by default. */
function mockEliza(
	opts: { automatable?: boolean; confirm?: ElizaCryptoPaymentConfirmResult; throwOnConfirm?: boolean } = {},
) {
	const calls = { create: 0, confirm: 0, confirmedHashes: [] as string[] };
	const eliza: OffRampElizaClient & { getCreditBalance?: () => Promise<{ balance: number }>; calls: typeof calls } = {
		calls,
		getCryptoStatus: async () => statusWithBsc(),
		hasCryptoSession: () => opts.automatable ?? true,
		createCryptoPayment: async (): Promise<ElizaCryptoPaymentCreateResult> => {
			calls.create += 1;
			return { paymentId: `pay-${calls.create}` };
		},
		confirmCryptoPayment: async (_id, hash): Promise<ElizaCryptoPaymentConfirmResult> => {
			calls.confirm += 1;
			if (opts.throwOnConfirm) throw new Error("on-chain verify failed");
			calls.confirmedHashes.push(hash);
			return opts.confirm ?? { status: "confirmed", creditsAdded: 5 };
		},
		getCreditBalance: async () => ({ balance: 14.37 }),
	};
	return eliza;
}

/**
 * In-memory ledger modelling the PARTIAL unique index: at most one
 * pending/credited row per deposit hash, but refusal/failure rows may coexist
 * (so a deposit stays retryable). Rows are a list keyed by id.
 */
function memLedger(initialSpentToday = 0) {
	const rows = new Map<string, { id: string; txHash: string; status: string; usd: number }>();
	let n = 0;
	const activeFor = (hash: string) =>
		[...rows.values()].find(
			(r) => r.txHash === hash.toLowerCase() && (r.status === "pending" || r.status === "credited"),
		);
	const statusFor = (hash: string): string | undefined =>
		[...rows.values()].filter((r) => r.txHash === hash.toLowerCase()).at(-1)?.status;
	const ledger: MintLedger & { rows: typeof rows; activeFor: typeof activeFor; statusFor: typeof statusFor } = {
		rows,
		activeFor,
		statusFor,
		sumSpentTodayUsd: async () => {
			let total = initialSpentToday;
			for (const r of rows.values()) if (r.status === "credited" || r.status === "pending") total += r.usd;
			return total;
		},
		hasActiveDeposit: async (hash) => Boolean(activeFor(hash)),
		claimPendingMint: async (input) => {
			const hash = input.depositTxHash.toLowerCase();
			if (activeFor(hash)) return null; // partial-unique conflict -> DO NOTHING
			const id = `row-${++n}`;
			rows.set(id, { id, txHash: hash, status: "pending", usd: input.usdAmount });
			return id;
		},
		recordAudit: async (input) => {
			const id = `row-${++n}`;
			rows.set(id, { id, txHash: input.depositTxHash.toLowerCase(), status: input.status, usd: input.usdAmount });
		},
		markCredited: async (id) => {
			const r = rows.get(id);
			if (r) r.status = "credited";
		},
		markFailed: async (id) => {
			const r = rows.get(id);
			if (r) r.status = "failed";
		},
		markCapped: async (id) => {
			const r = rows.get(id);
			if (r) r.status = "capped";
		},
	};
	return ledger;
}

function candidate(hash: string, valueBnb: number): DepositCandidate {
	return { depositTxHash: hash, from: "0xabc", safeAddress: BSC_RECEIVE, valueBnb, timestamp: 1700000000 };
}

class StubWatcher extends BscDepositWatcher {
	constructor(private readonly deposits: DepositCandidate[]) {
		super({ fetchImpl: fetch, now: () => Date.now(), logger: console });
	}
	override async detectDeposits(): Promise<DepositCandidate[]> {
		return this.deposits;
	}
}

function limits(overrides: Partial<OffRampLimitsConfig> = {}): OffRampLimitsConfig {
	return {
		autoEnabled: true,
		pauseFilePath: "/tmp/.no-such-pause-file-automint",
		maxPerTxUsd: 10,
		maxPerDayUsd: 20,
		minPerTxUsd: 1,
		...overrides,
	};
}

const fakeDb = {} as unknown as Database;
const deps = { priceUsd: async () => 600, now: () => new Date("2026-06-03T12:00:00Z"), logger: console };

function build(eliza: ReturnType<typeof mockEliza>, ledger: MintLedger, deposits: DepositCandidate[]) {
	const offRamp = new CreditsOffRamp(eliza, { priceUsd: deps.priceUsd, now: () => deps.now().getTime() });
	return new CreditsAutoMinter(fakeDb, eliza, deps, {
		offRamp,
		watcher: new StubWatcher(deposits),
		ledger,
	});
}

test("auto-mints a within-cap deposit (create+confirm with the deposit tx hash)", async () => {
	const eliza = mockEliza();
	const ledger = memLedger();
	// 0.01 BNB * $600 = $6 -> within $10 per-tx, $20 daily.
	const hash = `0x${"a".repeat(64)}`;
	const minter = build(eliza, ledger, [candidate(hash, 0.01)]);
	const s = await minter.tick(limits());
	assert.equal(s.credited, 1);
	assert.equal(eliza.calls.create, 1);
	assert.equal(eliza.calls.confirm, 1);
	assert.deepEqual(eliza.calls.confirmedHashes, [hash]);
	assert.equal(ledger.statusFor(hash), "credited");
});

test("idempotency: a duplicate deposit is not minted twice", async () => {
	const eliza = mockEliza();
	const ledger = memLedger();
	const hash = `0x${"b".repeat(64)}`;
	const minter = build(eliza, ledger, [candidate(hash, 0.01)]);
	await minter.tick(limits());
	const s2 = await minter.tick(limits()); // same deposit again
	assert.equal(s2.duplicate, 1);
	assert.equal(s2.credited, 0);
	assert.equal(eliza.calls.create, 1); // only the first tick minted
});

test("per-tx cap: an over-cap deposit is capped, never minted", async () => {
	const eliza = mockEliza();
	const ledger = memLedger();
	// 0.02 BNB * $600 = $12 > $10 per-tx cap.
	const hash = `0x${"c".repeat(64)}`;
	const minter = build(eliza, ledger, [candidate(hash, 0.02)]);
	const s = await minter.tick(limits());
	assert.equal(s.capped, 1);
	assert.equal(s.credited, 0);
	assert.equal(eliza.calls.create, 0);
	assert.equal(ledger.statusFor(hash), "capped");
});

test("daily cap: blocks once the day's spend is exhausted", async () => {
	const eliza = mockEliza();
	const ledger = memLedger(18); // $18 already spent today
	// $6 deposit would push to $24 > $20 daily cap.
	const hash = `0x${"d".repeat(64)}`;
	const minter = build(eliza, ledger, [candidate(hash, 0.01)]);
	const s = await minter.tick(limits());
	assert.equal(s.capped, 1);
	assert.equal(eliza.calls.create, 0);
});

test("kill-switch: autoEnabled=false blocks everything", async () => {
	const eliza = mockEliza();
	const ledger = memLedger();
	const hash = `0x${"e".repeat(64)}`;
	const minter = build(eliza, ledger, [candidate(hash, 0.01)]);
	const s = await minter.tick(limits({ autoEnabled: false }));
	assert.equal(s.killed, 1);
	assert.equal(eliza.calls.create, 0);
});

test("not automatable -> skipped, no mint", async () => {
	const eliza = mockEliza({ automatable: false });
	const ledger = memLedger();
	const hash = `0x${"f".repeat(64)}`;
	const minter = build(eliza, ledger, [candidate(hash, 0.01)]);
	const s = await minter.tick(limits());
	assert.equal(s.skipped, 1);
	assert.equal(eliza.calls.create, 0);
});

test("confirm failure -> marked failed, audited (retryable)", async () => {
	const eliza = mockEliza({ throwOnConfirm: true });
	const ledger = memLedger();
	const hash = `0x${"1".repeat(64)}`;
	const minter = build(eliza, ledger, [candidate(hash, 0.01)]);
	const s = await minter.tick(limits());
	assert.equal(s.failed, 1);
	assert.equal(s.credited, 0);
	assert.equal(ledger.statusFor(hash), "failed");
});

test("retryable: a failed deposit is re-attempted on a later tick (not stuck as duplicate)", async () => {
	const ledger = memLedger();
	const hash = `0x${"7".repeat(64)}`;
	// First tick: confirm throws -> failed (retryable).
	const elizaFail = mockEliza({ throwOnConfirm: true });
	await build(elizaFail, ledger, [candidate(hash, 0.01)]).tick(limits());
	assert.equal(ledger.statusFor(hash), "failed");
	// Second tick with a healthy client: the failed deposit is retried + minted.
	const elizaOk = mockEliza();
	const s = await build(elizaOk, ledger, [candidate(hash, 0.01)]).tick(limits());
	assert.equal(s.credited, 1);
	assert.equal(elizaOk.calls.create, 1);
	assert.equal(ledger.statusFor(hash), "credited");
});

test("retryable: a kill-switched deposit mints once the switch is re-enabled", async () => {
	const ledger = memLedger();
	const hash = `0x${"8".repeat(64)}`;
	// First tick: disabled -> killed audit row (non-blocking).
	const eliza = mockEliza();
	await build(eliza, ledger, [candidate(hash, 0.01)]).tick(limits({ autoEnabled: false }));
	assert.equal(ledger.statusFor(hash), "killed");
	assert.equal(eliza.calls.create, 0);
	// Second tick: enabled -> the same deposit is now minted.
	const s = await build(eliza, ledger, [candidate(hash, 0.01)]).tick(limits());
	assert.equal(s.credited, 1);
	assert.equal(eliza.calls.create, 1);
	assert.equal(ledger.statusFor(hash), "credited");
});

test("a credited deposit stays blocked on re-scan (no double-mint)", async () => {
	const ledger = memLedger();
	const hash = `0x${"9".repeat(64)}`;
	const eliza = mockEliza();
	await build(eliza, ledger, [candidate(hash, 0.01)]).tick(limits());
	const s2 = await build(eliza, ledger, [candidate(hash, 0.01)]).tick(limits());
	assert.equal(s2.duplicate, 1);
	assert.equal(eliza.calls.create, 1);
});

test("two deposits, second exceeds remaining daily headroom -> first credited, second capped", async () => {
	const eliza = mockEliza();
	const ledger = memLedger(12); // $12 already spent -> $8 left today
	const h1 = `0x${"2".repeat(64)}`; // $6 -> fits ($8 left)
	const h2 = `0x${"3".repeat(64)}`; // $6 -> after first, only $2 left -> capped
	const minter = build(eliza, ledger, [candidate(h1, 0.01), candidate(h2, 0.01)]);
	const s = await minter.tick(limits());
	assert.equal(s.credited, 1);
	assert.equal(s.capped, 1);
	assert.equal(eliza.calls.create, 1);
});
