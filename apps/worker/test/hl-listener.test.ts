import assert from "node:assert/strict";
import test from "node:test";

import {
	type HyperliquidFill,
	type PositionSnapshot,
	findTradeRationale,
	insertEnrichedTradeEvent,
	isLiquidation,
	processFills,
	renderClose,
	renderFill,
	renderFunding,
	renderLiquidation,
	renderOpen,
	withTradeRationaleReason,
} from "../src/lib/hl-listener.js";

test("renderFill renders human-readable open buy fill", () => {
	const fill: HyperliquidFill = {
		coin: "BTC",
		px: "77301.0",
		sz: "0.00129",
		side: "B",
		dir: "Open Long",
		closedPnl: "0.0",
		tid: 1,
	};
	const text = renderFill(fill);
	assert.match(text, /filled buy/);
	assert.match(text, /btc/);
	assert.match(text, /\$77,301\.00/);
});

test("renderOpen formats opened position with leverage + entry", () => {
	const snap: PositionSnapshot = {
		coin: "BTC",
		szi: 0.00129,
		entryPx: 77301,
		leverage: 5,
	};
	const text = renderOpen(snap, 19.94);
	assert.match(text, /opened btc long/);
	assert.match(text, /5x/);
	assert.match(text, /\$77,301\.00/);
});

test("renderClose includes signed pnl and pct", () => {
	const text = renderClose("ETH", "long", 12.4, 6.21);
	assert.match(text, /closed eth long/);
	assert.match(text, /\+\$12\.40/);
	assert.match(text, /\+6\.21%/);
});

test("renderClose handles negative pnl", () => {
	const text = renderClose("BNB", "short", -3.45, -1.72);
	assert.match(text, /closed bnb short/);
	assert.match(text, /-\$3\.45/);
});

test("renderLiquidation prefixes with siren and labels margin call", () => {
	const fill: HyperliquidFill = {
		coin: "BTC",
		px: "60000",
		side: "A",
		dir: "Liquidated Cross Long",
	};
	const text = renderLiquidation(fill);
	assert.match(text, /\ud83d\udea8/);
	assert.match(text, /liquidated btc/);
	assert.match(text, /margin call/);
});

test("isLiquidation detects liquidation-shaped fills", () => {
	assert.equal(isLiquidation({ dir: "Open Long" }), false);
	assert.equal(isLiquidation({ dir: "Liquidated Cross Long" }), true);
	assert.equal(isLiquidation({ liquidation: { liquidatedUser: "0x0" } }), true);
});

test("renderFunding handles nested Hyperliquid funding delta rows", () => {
	const text = renderFunding({
		time: 1780164000038,
		delta: {
			type: "funding",
			coin: "ZEC",
			usdc: "-0.031384",
			szi: "4.64",
			fundingRate: "0.0000125",
		},
	});
	assert.match(text, /paid/);
	assert.match(text, /zec funding/);
});

function testLogger() {
	return {
		warns: [] as unknown[],
		errors: [] as unknown[],
		warn(entry: unknown) {
			this.warns.push(entry);
		},
		error(entry: unknown) {
			this.errors.push(entry);
		},
		info() {},
	};
}

function fakeContext(options: {
	rationales?: Array<{ id: string; reason: string }>;
	lookupThrows?: boolean;
	inserted?: boolean;
}) {
	const logger = testLogger();
	const consumed: string[] = [];
	const insertedEvents: Array<{ data: Record<string, unknown>; payload: Record<string, unknown> }> = [];
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							if (options.lookupThrows) throw new Error("lookup failed");
							return this;
						},
						orderBy() {
							return this;
						},
						limit() {
							return Promise.resolve(options.rationales ?? []);
						},
					};
				},
			};
		},
		insert() {
			return {
				values(value: { data?: Record<string, unknown>; payload?: Record<string, unknown> }) {
					if (value.data && value.payload) insertedEvents.push({ data: value.data, payload: value.payload });
					return this;
				},
				onConflictDoNothing() {
					return this;
				},
				returning() {
					return Promise.resolve(options.inserted === false ? [] : [{ id: "event-1" }]);
				},
			};
		},
		update() {
			return {
				set() {
					return this;
				},
				where() {
					consumed.push("rationale-consumed");
					return Promise.resolve([]);
				},
			};
		},
	};
	return { context: { db, logger } as never, consumed, insertedEvents, logger };
}

test("findTradeRationale returns the newest unconsumed rationale from the store", async () => {
	const { context } = fakeContext({ rationales: [{ id: "rat-1", reason: "custom algo flagged local bottom" }] });
	const rationale = await findTradeRationale(context, {
		agentId: "waifu-sol",
		coin: "btc",
		action: "open",
		side: "long",
		now: new Date("2026-06-05T17:00:00Z"),
	});
	assert.deepEqual(rationale, { id: "rat-1", reason: "custom algo flagged local bottom" });
});

test("withTradeRationaleReason attaches the rationale reason to rendered event data", () => {
	assert.deepEqual(withTradeRationaleReason({ asset: "btc" }, { id: "rat-1", reason: "local bottom" }), {
		asset: "btc",
		reason: "local bottom",
	});
});

test("insertEnrichedTradeEvent emits without reason when rationale lookup fails softly", async () => {
	const { context, insertedEvents, consumed, logger } = fakeContext({ lookupThrows: true });
	const inserted = await insertEnrichedTradeEvent(context, {
		agentId: "waifu-sol",
		agentTokenAddress: "0x0000000000000000000000000000000000000001",
		eventType: "trade.open",
		legacyType: "trade.open",
		payload: { coin: "BTC" },
		data: { asset: "btc" },
		txHash: null,
		sourceEventId: "hl:test:btc:open:1",
		coin: "BTC",
		action: "open",
		side: "long",
	});
	assert.equal(inserted, true);
	assert.equal(insertedEvents[0]?.data.reason, undefined);
	assert.equal(consumed.length, 0);
	assert.equal(logger.warns.length, 1);
});

test("insertEnrichedTradeEvent attaches reason and consumes only after a new event row", async () => {
	const { context, insertedEvents, consumed } = fakeContext({
		rationales: [{ id: "rat-1", reason: "custom algo flagged local bottom" }],
		inserted: true,
	});
	const inserted = await insertEnrichedTradeEvent(context, {
		agentId: "waifu-sol",
		agentTokenAddress: "0x0000000000000000000000000000000000000001",
		eventType: "trade.open",
		legacyType: "trade.open",
		payload: { coin: "BTC" },
		data: { asset: "btc" },
		txHash: null,
		sourceEventId: "hl:test:btc:open:1",
		coin: "BTC",
		action: "open",
		side: "long",
	});
	assert.equal(inserted, true);
	assert.equal(insertedEvents[0]?.data.reason, "custom algo flagged local bottom");
	assert.match(String(insertedEvents[0]?.data.renderedText), /custom algo flagged local bottom/);
	assert.equal(consumed.length, 1);
});

test("insertEnrichedTradeEvent does not consume rationale on replayed duplicate event", async () => {
	const { context, insertedEvents, consumed } = fakeContext({
		rationales: [{ id: "rat-1", reason: "custom algo flagged local bottom" }],
		inserted: false,
	});
	const inserted = await insertEnrichedTradeEvent(context, {
		agentId: "waifu-sol",
		agentTokenAddress: "0x0000000000000000000000000000000000000001",
		eventType: "trade.open",
		legacyType: "trade.open",
		payload: { coin: "BTC" },
		data: { asset: "btc" },
		txHash: null,
		sourceEventId: "hl:test:btc:open:1",
		coin: "BTC",
		action: "open",
		side: "long",
	});
	assert.equal(inserted, false);
	assert.equal(insertedEvents[0]?.data.reason, "custom algo flagged local bottom");
	assert.match(String(insertedEvents[0]?.data.renderedText), /custom algo flagged local bottom/);
	assert.equal(consumed.length, 0);
});

function fillListenerContext() {
	const logger = testLogger();
	const insertedEvents: Array<Record<string, unknown>> = [];
	const db = {
		select() {
			return {
				from() {
					return {
						where() {
							return this;
						},
						orderBy() {
							return this;
						},
						limit() {
							return Promise.resolve([]);
						},
					};
				},
			};
		},
		insert() {
			return {
				values(value: Record<string, unknown>) {
					insertedEvents.push(value);
					return this;
				},
				onConflictDoNothing() {
					return this;
				},
				returning() {
					return Promise.resolve([{ id: `event-${insertedEvents.length}` }]);
				},
			};
		},
	};
	return { context: { db, logger } as never, insertedEvents, logger };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "content-type": "application/json" },
		...init,
	});
}

test("processFills fetches core and configured builder-dex fills", async () => {
	const { context, insertedEvents } = fillListenerContext();
	const requests: Array<Record<string, unknown>> = [];
	const fetchImpl = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
		requests.push(body);
		const rows = [
			{
				coin: "HYPE",
				px: "38",
				sz: "1",
				side: "B",
				dir: "Close Short",
				closedPnl: "3.4",
				tid: 100,
				time: 1781600000100,
			},
			{
				coin: "xyz:SPCX",
				px: "1.25",
				sz: "40",
				side: "A",
				dir: "Open Short",
				closedPnl: "0",
				tid: 7,
				time: 1781600000007,
			},
		];
		return jsonResponse(rows);
	};

	const metrics = await processFills(
		context,
		{
			walletId: "wallet-1",
			address: "0xabc",
			agentTokenAddress: "0xtoken",
			agentId: "agent-1",
		},
		{
			fetch: fetchImpl as typeof fetch,
			baseUrl: "https://hl.test",
			builderDexs: ["xyz"],
			fillsBackfillWindowMs: 60_000,
		},
	);

	assert.equal(metrics.fillsFetched, 2);
	assert.equal(metrics.fillsEmitted, 2);
	assert.equal(requests.length, 2);
	assert.equal(requests[0]?.dex, undefined);
	assert.equal(requests[1]?.dex, "xyz");
	assert.deepEqual(
		insertedEvents.map((event) => (event.payload as Record<string, unknown>).coin),
		["xyz:SPCX", "HYPE"],
	);
	assert.deepEqual(
		insertedEvents.map((event) => event.sourceEventId),
		["hl:xyz:7", "hl:100"],
	);
});

test("processFills continues when a builder-dex fill poll fails", async () => {
	const { context, insertedEvents, logger } = fillListenerContext();
	const fetchImpl = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
		if (body.dex === "xyz") return new Response("builder down", { status: 500, statusText: "nope" });
		return jsonResponse([
			{
				coin: "HYPE",
				px: "38",
				sz: "1",
				side: "B",
				dir: "Close Short",
				closedPnl: "3.4",
				tid: 100,
				time: 1781600000100,
			},
		]);
	};

	const metrics = await processFills(
		context,
		{
			walletId: "wallet-1",
			address: "0xabc",
			agentTokenAddress: "0xtoken",
			agentId: "agent-1",
		},
		{
			fetch: fetchImpl as typeof fetch,
			baseUrl: "https://hl.test",
			builderDexs: ["xyz"],
			fillsBackfillWindowMs: 60_000,
		},
	);

	assert.equal(metrics.fillsFetched, 1);
	assert.equal(metrics.fillsEmitted, 1);
	assert.equal(insertedEvents.length, 1);
	assert.equal((insertedEvents[0]?.payload as Record<string, unknown>).coin, "HYPE");
	assert.equal(logger.warns.length, 1);
});
