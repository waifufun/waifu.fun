import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address, Hex } from "viem";

import { type SwapLog, extractSwapAmountOut } from "./logs.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const;

const tokenOut: Address = "0x000000000000000000000000000000000000aaaa";
const otherToken: Address = "0x000000000000000000000000000000000000bbbb";
const recipient: Address = "0x0000000000000000000000000000000000001111";
const router: Address = "0x0000000000000000000000000000000000002222";
const other: Address = "0x0000000000000000000000000000000000003333";

const padAddr = (addr: Address): Hex => `0x${"00".repeat(12)}${addr.slice(2).toLowerCase()}` as Hex;
const padUint = (value: bigint): Hex => `0x${value.toString(16).padStart(64, "0")}` as Hex;

const makeTransferLog = (token: Address, from: Address, to: Address, value: bigint): SwapLog => ({
	address: token,
	topics: [TRANSFER_TOPIC, padAddr(from), padAddr(to)],
	data: padUint(value),
});

describe("extractSwapAmountOut", () => {
	it("sums tokenOut transfers to the recipient", async () => {
		const logs: SwapLog[] = [
			makeTransferLog(tokenOut, router, recipient, 1_000n),
			makeTransferLog(otherToken, router, recipient, 9_999n), // wrong token
			makeTransferLog(tokenOut, router, other, 500n), // wrong recipient
		];

		assert.equal(extractSwapAmountOut({ logs, recipient, tokenOut }), 1_000n);
	});

	it("aggregates multi-hop transfers into the same recipient", async () => {
		const logs: SwapLog[] = [
			makeTransferLog(tokenOut, router, recipient, 700n),
			makeTransferLog(tokenOut, other, recipient, 300n),
		];

		assert.equal(extractSwapAmountOut({ logs, recipient, tokenOut }), 1_000n);
	});

	it("returns null when no matching transfer is in the logs", async () => {
		const logs: SwapLog[] = [makeTransferLog(otherToken, router, recipient, 1_000n)];

		assert.equal(extractSwapAmountOut({ logs, recipient, tokenOut }), null);
	});

	it("ignores logs whose topics do not match Transfer", async () => {
		const logs: SwapLog[] = [
			{
				address: tokenOut,
				topics: ["0x0000000000000000000000000000000000000000000000000000000000000001"],
				data: padUint(1_000n),
			},
		];

		assert.equal(extractSwapAmountOut({ logs, recipient, tokenOut }), null);
	});
});
