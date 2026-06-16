import assert from "node:assert/strict";
import test from "node:test";

import { fetchAllHlState } from "./builder-dexs.js";
import { type HlPortfolioWindow, type PnlPoint, anchorBaseline, buildHlPnl } from "./pnl.js";

// ── anchorBaseline (pure) ──────────────────────────────────────────────

test("anchorBaseline: empty series returns empty", () => {
	assert.deepEqual(anchorBaseline([]), []);
});

test("anchorBaseline: all-zero series collapses to a single flat-zero point", () => {
	const series: PnlPoint[] = [
		{ t: 1, pnl: 0 },
		{ t: 2, pnl: 0 },
		{ t: 3, pnl: 0 },
	];
	assert.deepEqual(anchorBaseline(series), [{ t: 3, pnl: 0 }]);
});

test("anchorBaseline: drops the leading zero run, keeps one anchor, rebases to 0", () => {
	const series: PnlPoint[] = [
		{ t: 1, pnl: 0 },
		{ t: 2, pnl: 0 },
		{ t: 3, pnl: 10 },
		{ t: 4, pnl: 25 },
	];
	// anchor = the zero point right before the first nonzero move (t:2)
	assert.deepEqual(anchorBaseline(series), [
		{ t: 2, pnl: 0 },
		{ t: 3, pnl: 10 },
		{ t: 4, pnl: 25 },
	]);
});

test("anchorBaseline: nonzero from the start rebases to its own first value", () => {
	const series: PnlPoint[] = [
		{ t: 1, pnl: 30 },
		{ t: 2, pnl: 50 },
	];
	assert.deepEqual(anchorBaseline(series), [
		{ t: 1, pnl: 0 },
		{ t: 2, pnl: 20 },
	]);
});

// ── buildHlPnl (deposit-excluded money math) ───────────────────────────

function makePortfolio(windows: Record<string, number[]>): Array<[string, HlPortfolioWindow]> {
	return Object.entries(windows).map(([name, pnls]) => [
		name,
		{
			// Deposit-INCLUSIVE noise that must never leak into trading pnl.
			accountValueHistory: pnls.map((_, i) => [i, "999999"] as [number, string]),
			pnlHistory: pnls.map((p, i) => [i, String(p)] as [number, string]),
		},
	]);
}

function mockFetch(spec: {
	portfolios: Record<string, Array<[string, HlPortfolioWindow]>>;
	clearinghouse: Record<string, unknown>;
	fills: Record<string, unknown>;
}): typeof fetch {
	return (async (_url: string | URL, init?: { body?: string | null }) => {
		const body = JSON.parse(String(init?.body ?? "{}")) as { type: string; user: string; dex?: string };
		let data: unknown;
		if (body.type === "portfolio") data = spec.portfolios[body.user];
		else if (body.type === "clearinghouseState") {
			const key = body.dex ? `${body.user}:${body.dex}` : body.user;
			data = spec.clearinghouse[key];
		} else if (body.type === "userFills") data = spec.fills[body.user];
		return { ok: data !== undefined, json: async () => data } as Response;
	}) as unknown as typeof fetch;
}

test("buildHlPnl: deposit-excluded total, realized = total − unrealized, prior realized aggregated", async () => {
	const CURRENT = "0xcurrent";
	const PRIOR = "0xprior";
	const fetchImpl = mockFetch({
		portfolios: {
			[CURRENT]: makePortfolio({ day: [0, 0, 100, 150], allTime: [0, 0, 100, 150] }),
			[PRIOR]: makePortfolio({ allTime: [0, 30, 60] }),
		},
		clearinghouse: {
			[CURRENT]: {
				marginSummary: { accountValue: "1000" },
				withdrawable: "500",
				assetPositions: [{ position: { unrealizedPnl: "40" } }],
			},
		},
		fills: {
			[CURRENT]: [{ closedPnl: "120" }, { closedPnl: "-10" }],
		},
	});

	const r = await buildHlPnl(CURRENT, [PRIOR], "day", fetchImpl);

	// current-wallet lifetime trading pnl = allTime tail (deposit-excluded), NOT accountValue.
	assert.equal(r.tradingPnl.currentWallet, 150);
	assert.equal(r.tradingPnl.unrealized, 40);
	assert.equal(r.tradingPnl.priorWallets, 60); // closed account → fully realized
	assert.equal(r.tradingPnl.total, 210); // 150 + 60
	assert.equal(r.tradingPnl.realized, 170); // (150 − 40) + 60
	// account value comes from clearinghouse, never the 999999 accountValueHistory noise.
	assert.equal(r.accountValue, 1000);
	assert.equal(r.withdrawable, 500);
	assert.deepEqual(r.winLoss, { wins: 1, losses: 1 });
	// series uses the requested window, deposit-excluded + baseline-anchored.
	assert.deepEqual(r.series, [
		{ t: 1, pnl: 0 },
		{ t: 2, pnl: 100 },
		{ t: 3, pnl: 150 },
	]);
	assert.equal(typeof r.ts, "number");
});

test("buildHlPnl: never-traded wallet yields zeros and a null winLoss", async () => {
	const WALLET = "0xfresh";
	const fetchImpl = mockFetch({
		portfolios: { [WALLET]: makePortfolio({ day: [0, 0, 0], allTime: [0, 0, 0] }) },
		clearinghouse: { [WALLET]: { marginSummary: { accountValue: "0" }, assetPositions: [] } },
		fills: {}, // userFills returns undefined → winLoss null
	});

	const r = await buildHlPnl(WALLET, [], "day", fetchImpl);

	assert.equal(r.tradingPnl.total, 0);
	assert.equal(r.tradingPnl.realized, 0);
	assert.equal(r.tradingPnl.unrealized, 0);
	assert.equal(r.winLoss, null);
	assert.deepEqual(r.series, [{ t: 2, pnl: 0 }]); // flat-zero, not a fabricated history
});

test("fetchAllHlState: merges configured builder-dex positions and sums isolated totals", async () => {
	const WALLET = "0xwallet";
	const fetchImpl = mockFetch({
		portfolios: {},
		clearinghouse: {
			[WALLET]: {
				marginSummary: { accountValue: "1000" },
				withdrawable: "700",
				assetPositions: [{ position: { coin: "ETH", szi: "1", unrealizedPnl: "10" } }],
			},
			[`${WALLET}:xyz`]: {
				marginSummary: { accountValue: "2000" },
				withdrawable: "1500",
				assetPositions: [{ position: { coin: "xyz:SPCX", szi: "-4.68", unrealizedPnl: "25" } }],
			},
		},
		fills: {},
	});

	const state = await fetchAllHlState(WALLET, fetchImpl, { builderDexs: ["xyz"] });

	assert.equal(state.totalAccountValue, 3000);
	assert.equal(state.totalWithdrawable, 2200);
	assert.equal(state.totalUnrealizedPnl, 35);
	assert.equal(state.builderDexs.length, 1);
	assert.equal(state.mergedPositions.length, 2);
	assert.equal(state.mergedPositions[0]?.position?.coin, "ETH");
	assert.equal(state.mergedPositions[0]?.builderPerp, false);
	assert.equal(state.mergedPositions[1]?.position?.coin, "xyz:SPCX");
	assert.equal(state.mergedPositions[1]?.dex, "xyz");
	assert.equal(state.mergedPositions[1]?.builderPerp, true);
});

test("buildHlPnl: live account value and unrealized pnl include builder-dex isolated margin", async () => {
	const WALLET = "0xwallet";
	const fetchImpl = mockFetch({
		portfolios: { [WALLET]: makePortfolio({ day: [0, 80], allTime: [0, 80] }) },
		clearinghouse: {
			[WALLET]: {
				marginSummary: { accountValue: "1000" },
				withdrawable: "900",
				assetPositions: [{ position: { coin: "ETH", szi: "1", unrealizedPnl: "20" } }],
			},
			[`${WALLET}:xyz`]: {
				marginSummary: { accountValue: "2000" },
				withdrawable: "1500",
				assetPositions: [{ position: { coin: "xyz:SPCX", szi: "-4.68", unrealizedPnl: "30" } }],
			},
		},
		fills: { [WALLET]: [] },
	});

	const r = await buildHlPnl(WALLET, [], "day", fetchImpl);

	assert.equal(r.accountValue, 3000);
	assert.equal(r.withdrawable, 2400);
	assert.equal(r.tradingPnl.unrealized, 50);
	assert.equal(r.tradingPnl.realized, 30);
	assert.equal(r.tradingPnl.total, 80);
});

test("fetchAllHlState: failed builder-dex query is resilient", async () => {
	const WALLET = "0xwallet";
	const fetchImpl = mockFetch({
		portfolios: {},
		clearinghouse: {
			[WALLET]: {
				marginSummary: { accountValue: "1000" },
				assetPositions: [{ position: { coin: "BTC", szi: "0.1", unrealizedPnl: "5" } }],
			},
			[`${WALLET}:xyz`]: {
				marginSummary: { accountValue: "2000" },
				assetPositions: [{ position: { coin: "xyz:SPCX", szi: "-4.68", unrealizedPnl: "15" } }],
			},
			// no 0xwallet:bad entry, so the mock returns !ok for that builder dex
		},
		fills: {},
	});

	const state = await fetchAllHlState(WALLET, fetchImpl, { builderDexs: ["xyz", "bad"] });

	assert.equal(state.totalAccountValue, 3000);
	assert.deepEqual(
		state.builderDexs.map((entry) => entry.dex),
		["xyz"],
	);
	assert.deepEqual(
		state.mergedPositions.map((entry) => entry.position?.coin),
		["BTC", "xyz:SPCX"],
	);
});
