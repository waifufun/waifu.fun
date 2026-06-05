import assert from "node:assert/strict";
import test from "node:test";

import {
	type HyperliquidFill,
	type PositionSnapshot,
	findTradeRationale,
	insertEnrichedTradeEvent,
	isLiquidation,
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
