import assert from "node:assert/strict";
import test from "node:test";

import {
	type HyperliquidFill,
	type PositionSnapshot,
	isLiquidation,
	renderClose,
	renderFill,
	renderFunding,
	renderLiquidation,
	renderOpen,
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
