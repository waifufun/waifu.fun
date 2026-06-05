import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentEventType } from "../schema/agent-events.js";
import { renderEvent } from "./agent-events.js";

const fixtures: Array<[AgentEventType, Record<string, unknown>, string]> = [
	[
		"commit.pushed",
		{ sha: "abcdef123456", repoLabel: "waifu", message: "feat: ship github listener" },
		"shipped abcdef1 · waifu · feat: ship github listener",
	],
	[
		"pr.merged",
		{ number: 782, repoLabel: "waifu", title: "feat: agent ingestion system" },
		"merged PR #782 · waifu · feat: agent ingestion system",
	],
	[
		"trade.open",
		{ coin: "BTC", side: "long", notionalUsd: 99.72, leverage: 5, entryPrice: 77301 },
		"opened btc long $99.72 5x at $77,301",
	],
	[
		"trade.open",
		{ coin: "BTC", side: "long", notionalUsd: 99.72, leverage: 5, entryPrice: 77301, reason: "algo flagged local bottom" },
		"opened btc long $99.72 5x at $77,301 \u00b7 algo flagged local bottom",
	],
	["trade.close", { coin: "ETH", side: "long", pnlUsd: 1.45, pnlPct: 2.3 }, "closed eth long for +$1.45 (+2.30%)"],
	[
		"trade.close",
		{ coin: "ETH", side: "long", pnlUsd: 1.45, pnlPct: 2.3, reason: "took profit at resistance" },
		"closed eth long for +$1.45 (+2.30%) \u00b7 took profit at resistance",
	],
	["trade.fill", { coin: "BNB", side: "buy", size: 0.15, price: 669.65 }, "filled buy 0.15 bnb at $669.65"],
	["trade.liquidation", { coin: "SOL", side: "long", price: 140 }, "🚨 liquidated sol long at $140.00 (margin call)"],
	[
		"transfer.in",
		{ symbol: "USDC", amount: 100, from: "0x1111111111111111111111111111111111111111" },
		"received 100 USDC from 0x1111…1111",
	],
	[
		"transfer.out",
		{ symbol: "BNB", amount: 0.42, to: "0x2222222222222222222222222222222222222222" },
		"sent 0.42 BNB to 0x2222…2222",
	],
	["tax.received", { usd: 12.34 }, "received $12.34 platform fees"],
	["bridge.initiated", { fromChain: "arb", toChain: "hyperliquid" }, "started bridge arb → hyperliquid"],
	["bridge.completed", { fromChain: "arb", toChain: "hyperliquid" }, "bridge completed arb → hyperliquid"],
	["bridge.failed", { reason: "timeout" }, "bridge failed: timeout"],
	["safe.tx.proposed", { safeTxHash: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" }, "safe tx proposed 0xabcd…abcd"],
	["safe.tx.signed", { signer: "steward" }, "safe tx signed by steward"],
	["safe.tx.executed", { txHash: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" }, "safe tx executed 0xabcd…abcd"],
	["policy.applied", { policy: "daily-loss-limit" }, "policy applied: daily-loss-limit"],
	["policy.denied", { reason: "limit exceeded" }, "policy denied: limit exceeded"],
	["policy.needs_manual", { reason: "large transfer" }, "policy needs manual review: large transfer"],
	["session.opened", { sessionId: "sess_1" }, "session opened sess_1"],
	["session.revoked", { sessionId: "sess_1" }, "session revoked sess_1"],
	["inference.spent", { usd: 0.08 }, "spent $0.08 on inference"],
	["credits.topped_up", { usd: 20 }, "credits topped up $20.00"],
	["identity.registered", { name: "sol" }, "identity registered sol"],
	["identity.card_updated", {}, "identity card updated"],
	["x.posted", { text: "hello" }, "posted on x: hello"],
	["discord.posted", { text: "gm" }, "posted to discord: gm"],
];

describe("renderEvent", () => {
	for (const [type, payload, renderedText] of fixtures) {
		it(`renders ${type}`, () => {
			const rendered = renderEvent(type, payload);
			assert.equal(rendered.template, type);
			assert.equal(rendered.renderedText, renderedText);
		});
	}
});
