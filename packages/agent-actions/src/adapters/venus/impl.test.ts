import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Address, Hex } from "viem";

import type { AdapterCallContext } from "../../types.js";
import { venusComptrollerAbi } from "./abis.js";
import { venusAdapter } from "./impl.js";
import { venusContracts } from "./spec.js";

const hash = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const signerAddress = "0x0000000000000000000000000000000000000001" as const;
const account = "0x0000000000000000000000000000000000000002" as const;

const makeContext = (overrides: Partial<AdapterCallContext> = {}): AdapterCallContext => ({
	agentId: "test-agent",
	chainId: 56,
	signerAddress,
	signAndSend: async () => ({ hash }),
	publicClient: {},
	...overrides,
});

describe("venus adapter writes", () => {
	it("supplies native BNB to vBNB with mint() value", async () => {
		const submitted: Array<{ to: Address; data: Hex; value?: bigint }> = [];
		const ctx = makeContext({
			signAndSend: async (tx) => {
				submitted.push(tx);
				return { hash };
			},
		});

		const output = await venusAdapter.calls.supply(ctx, {
			vToken: venusContracts.vBNB,
			amount: 123n,
		});

		assert.deepEqual(output, { hash });
		assert.deepEqual(submitted, [
			{
				to: venusContracts.vBNB,
				data: "0x1249c58b",
				value: 123n,
			},
		]);
	});

	it("supplies an ERC20 vToken by approving underlying then minting", async () => {
		const submitted: Array<{ to: Address; data: Hex; value?: bigint }> = [];
		const reads: Array<{ address: Address; functionName: string }> = [];
		const ctx = makeContext({
			publicClient: {
				readContract: async (parameters: { address: Address; functionName: string }) => {
					reads.push({ address: parameters.address, functionName: parameters.functionName });
					return venusContracts.USDT;
				},
			},
			signAndSend: async (tx) => {
				submitted.push(tx);
				return { hash };
			},
		});

		const output = await venusAdapter.calls.supply(ctx, {
			vToken: venusContracts.vUSDT,
			amount: 789n,
		});

		assert.deepEqual(output, { hash });
		assert.deepEqual(reads, [{ address: venusContracts.vUSDT, functionName: "underlying" }]);
		assert.equal(submitted.length, 2);
		assert.equal(submitted[0]?.to, venusContracts.USDT);
		assert.equal(submitted[0]?.value, 0n);
		assert.ok(submitted[0]?.data.startsWith("0x095ea7b3"));
		assert.ok(submitted[0]?.data.toLowerCase().includes(venusContracts.vUSDT.slice(2).toLowerCase()));
		assert.equal(submitted[1]?.to, venusContracts.vUSDT);
		assert.equal(submitted[1]?.value, 0n);
		assert.ok(submitted[1]?.data.startsWith("0xa0712d68"));
	});

	it("rejects ERC20 supply without a publicClient", async () => {
		const ctx = makeContext({ publicClient: undefined });
		await assert.rejects(
			venusAdapter.calls.supply(ctx, { vToken: venusContracts.vUSDT, amount: 1n }),
			/requires ctx\.publicClient\.readContract/,
		);
	});

	it("borrows from a vToken with borrow(amount)", async () => {
		const submitted: Array<{ to: Address; data: Hex; value?: bigint }> = [];
		const ctx = makeContext({
			signAndSend: async (tx) => {
				submitted.push(tx);
				return { hash };
			},
		});

		const output = await venusAdapter.calls.borrow(ctx, {
			vToken: venusContracts.vUSDT,
			amount: 456n,
		});

		assert.deepEqual(output, { hash });
		assert.equal(submitted.length, 1);
		assert.equal(submitted[0]?.to, venusContracts.vUSDT);
		assert.equal(submitted[0]?.value, 0n);
		assert.ok(submitted[0]?.data.startsWith("0xc5ebeaec"));
	});
});

describe("venus adapter reads", () => {
	it("reads account liquidity from the Comptroller", async () => {
		const calls: Array<{
			address: Address;
			abi: typeof venusComptrollerAbi;
			functionName: "getAccountLiquidity";
			args: [Address];
		}> = [];
		const ctx = makeContext({
			publicClient: {
				readContract: async (parameters: {
					address: Address;
					abi: typeof venusComptrollerAbi;
					functionName: "getAccountLiquidity";
					args: [Address];
				}) => {
					calls.push(parameters);
					return [0n, 789n, 0n] as const;
				},
			},
		});

		const output = await venusAdapter.calls.accountLiquidity(ctx, { account });

		assert.deepEqual(output, { liquidity: 789n, shortfall: 0n });
		assert.deepEqual(calls, [
			{
				address: venusContracts.comptroller,
				abi: venusComptrollerAbi,
				functionName: "getAccountLiquidity",
				args: [account],
			},
		]);
	});

	it("throws on non-zero Comptroller error code", async () => {
		const ctx = makeContext({
			publicClient: {
				readContract: async () => [5n, 0n, 100n] as const,
			},
		});

		await assert.rejects(venusAdapter.calls.accountLiquidity(ctx, { account }), /error code 5/);
	});
});
