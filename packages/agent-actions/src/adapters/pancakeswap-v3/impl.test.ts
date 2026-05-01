import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address, Hex } from "viem";

import type { AdapterCallContext } from "../../types.js";
import { pancakeV3Impl } from "./impl.js";
import { PANCAKE_V3_QUOTER_V2, PANCAKE_V3_SWAP_ROUTER, PANCAKE_V3_WBNB } from "./spec.js";

const tokenOut = "0x0000000000000000000000000000000000000001" as const;
const recipient = "0x0000000000000000000000000000000000000002" as const;
const hash = `0x${"dead".repeat(16)}` as const;

const makeCtx = (overrides: Partial<AdapterCallContext>): AdapterCallContext => ({
	agentId: "agent-test",
	chainId: 56,
	signerAddress: recipient,
	publicClient: undefined,
	signAndSend: async () => ({ hash }),
	...overrides,
});

describe("pancakeV3Impl", () => {
	it("swap signs exactInputSingle calldata", async () => {
		let captured: { to: Address; data: Hex; value?: bigint } | undefined;
		const ctx = makeCtx({
			signAndSend: async (tx) => {
				captured = tx;
				return { hash };
			},
		});

		const result = await pancakeV3Impl.calls.swap(ctx, {
			tokenIn: PANCAKE_V3_WBNB,
			tokenOut,
			amountIn: 123n,
			minAmountOut: 45n,
			recipient,
			deadline: 1_900_000_000n,
		});

		assert.deepEqual(result, { hash, amountOut: 0n });
		assert.deepEqual(captured, {
			to: PANCAKE_V3_SWAP_ROUTER,
			data: "0x04e45aaf000000000000000000000000bb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000009c40000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000007b000000000000000000000000000000000000000000000000000000000000002d0000000000000000000000000000000000000000000000000000000000000000",
			value: 123n,
		});
	});

	it("quote reads QuoterV2 and returns amountOut", async () => {
		const ctx = makeCtx({
			publicClient: {
				readContract: async (args: {
					address: Address;
					functionName: string;
					args: readonly [
						{
							tokenIn: Address;
							tokenOut: Address;
							amountIn: bigint;
							fee: number;
							sqrtPriceLimitX96: bigint;
						},
					];
				}) => {
					assert.equal(args.address, PANCAKE_V3_QUOTER_V2);
					assert.equal(args.functionName, "quoteExactInputSingle");
					assert.deepEqual(args.args, [
						{
							tokenIn: PANCAKE_V3_WBNB,
							tokenOut,
							amountIn: 123n,
							fee: 2500,
							sqrtPriceLimitX96: 0n,
						},
					]);
					return [456n, 0n, 0, 100_000n] as const;
				},
			},
		});

		const result = await pancakeV3Impl.calls.quote(ctx, {
			tokenIn: PANCAKE_V3_WBNB,
			tokenOut,
			amountIn: 123n,
		});

		assert.deepEqual(result, { amountOut: 456n });
	});
});
