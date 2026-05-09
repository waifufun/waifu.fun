/**
 * Unit tests for the launch event decoder.
 *
 * Each test encodes a known event with viem's `encodeEventTopics` +
 * `encodeAbiParameters`, then asserts the decoder reconstructs the original
 * args and event metadata.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Hex, encodeAbiParameters, encodeEventTopics } from "viem";

import { bundleRouterEventsAbi, launchFactoryEventsAbi, launchVaultEventsAbi } from "./abis.js";
import { decodeLaunchLog } from "./decode.js";

const factoryAddress = "0x1111111111111111111111111111111111111111" as const;
const vaultAddress = "0x2222222222222222222222222222222222222222" as const;
const routerAddress = "0x3333333333333333333333333333333333333333" as const;
const tokenAddress = "0x4444444444444444444444444444444444444444" as const;
const userAddress = "0x5555555555555555555555555555555555555555" as const;
const v2PairAddress = "0x6666666666666666666666666666666666666666" as const;
const blockTimestamp = new Date("2026-05-08T00:00:00.000Z");

function buildLog(input: {
	address: `0x${string}`;
	topics: [Hex, ...Hex[]];
	data: Hex;
	blockNumber?: bigint;
	logIndex?: number;
	txHash?: `0x${string}`;
}) {
	return {
		address: input.address,
		topics: input.topics,
		data: input.data,
		blockNumber: input.blockNumber ?? 100n,
		transactionHash:
			input.txHash ?? ("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`),
		logIndex: input.logIndex ?? 0,
	};
}

test("decodeLaunchLog: LaunchCreated round-trips", () => {
	const topics = encodeEventTopics({
		abi: launchFactoryEventsAbi,
		eventName: "LaunchCreated",
		args: { creator: userAddress, token: tokenAddress },
	}) as [Hex, ...Hex[]];

	const splitterAddress = "0x7777777777777777777777777777777777777777" as const;
	const data = encodeAbiParameters(
		[
			{ name: "vault", type: "address" },
			{ name: "router", type: "address" },
			{ name: "taxSplitter", type: "address" },
			{ name: "tier", type: "uint8" },
			{ name: "presaleCap", type: "uint256" },
			{ name: "v2BuyBnb", type: "uint256" },
			{ name: "vestingEnabled", type: "bool" },
		],
		[vaultAddress, routerAddress, splitterAddress, 90, 50_000n, 4_000n, true],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: factoryAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	assert.equal(decoded.eventName, "LaunchCreated");
	if (decoded.eventName !== "LaunchCreated") return; // for tsc narrowing

	assert.equal(decoded.data.creator.toLowerCase(), userAddress);
	assert.equal(decoded.data.token.toLowerCase(), tokenAddress);
	assert.equal(decoded.data.vault.toLowerCase(), vaultAddress);
	assert.equal(decoded.data.router.toLowerCase(), routerAddress);
	assert.equal(decoded.data.taxSplitter.toLowerCase(), splitterAddress);
	assert.equal(decoded.data.tier, 90);
	assert.equal(decoded.data.presaleCap, "50000");
	assert.equal(decoded.data.v2BuyBnb, "4000");
	assert.equal(decoded.data.vestingEnabled, true);
	assert.equal(decoded.chainId, 56);
	assert.equal(decoded.blockNumber, 100n);
});

test("decodeLaunchLog: Deposited", () => {
	const topics = encodeEventTopics({
		abi: launchVaultEventsAbi,
		eventName: "Deposited",
		args: { user: userAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "amount", type: "uint256" },
			{ name: "newTotal", type: "uint256" },
		],
		[1_000n, 5_000n],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: vaultAddress, topics, data, logIndex: 7 }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "Deposited") {
		assert.fail(`expected Deposited, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.user.toLowerCase(), userAddress);
	assert.equal(decoded.data.amount, "1000");
	assert.equal(decoded.data.newTotal, "5000");
	assert.equal(decoded.logIndex, 7);
});

test("decodeLaunchLog: Withdrawn", () => {
	const topics = encodeEventTopics({
		abi: launchVaultEventsAbi,
		eventName: "Withdrawn",
		args: { user: userAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "amount", type: "uint256" },
			{ name: "penalty", type: "uint256" },
			{ name: "refund", type: "uint256" },
		],
		[1_000n, 50n, 950n],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: vaultAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "Withdrawn") {
		assert.fail(`expected Withdrawn, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.amount, "1000");
	assert.equal(decoded.data.penalty, "50");
	assert.equal(decoded.data.refund, "950");
});

test("decodeLaunchLog: Closed", () => {
	const topics = encodeEventTopics({
		abi: launchVaultEventsAbi,
		eventName: "Closed",
		args: { by: userAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "totalDeposited", type: "uint256" },
			{ name: "bonusPool", type: "uint256" },
		],
		[80_000n, 1_500n],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: vaultAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "Closed") {
		assert.fail(`expected Closed, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.by.toLowerCase(), userAddress);
	assert.equal(decoded.data.totalDeposited, "80000");
	assert.equal(decoded.data.bonusPool, "1500");
});

test("decodeLaunchLog: Launched", () => {
	const topics = encodeEventTopics({
		abi: launchVaultEventsAbi,
		eventName: "Launched",
		args: { token: tokenAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "totalBnb", type: "uint256" },
			{ name: "launchTimestamp", type: "uint256" },
		],
		[80_000n, 1_700_000_000n],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: vaultAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "Launched") {
		assert.fail(`expected Launched, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.token.toLowerCase(), tokenAddress);
	assert.equal(decoded.data.totalBnb, "80000");
	assert.equal(decoded.data.launchTimestamp, "1700000000");
});

test("decodeLaunchLog: Claimed", () => {
	const topics = encodeEventTopics({
		abi: launchVaultEventsAbi,
		eventName: "Claimed",
		args: { user: userAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "amount", type: "uint256" },
			{ name: "totalClaimed", type: "uint256" },
		],
		[100n, 100n],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: vaultAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "Claimed") {
		assert.fail(`expected Claimed, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.user.toLowerCase(), userAddress);
	assert.equal(decoded.data.amount, "100");
	assert.equal(decoded.data.totalClaimed, "100");
});

test("decodeLaunchLog: BundleExecuted", () => {
	const topics = encodeEventTopics({
		abi: bundleRouterEventsAbi,
		eventName: "BundleExecuted",
		args: { flapToken: tokenAddress, v2Pair: v2PairAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "curveFillBnb", type: "uint256" },
			{ name: "v2BuyBnb", type: "uint256" },
			{ name: "tokensFromV2", type: "uint256" },
			{ name: "tokensBurned", type: "uint256" },
			{ name: "tokensToTax", type: "uint256" },
			{ name: "openMcBnb", type: "uint256" },
		],
		[60_000n, 4_000n, 7_000n, 200n, 100n, 250_000n],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: routerAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "BundleExecuted") {
		assert.fail(`expected BundleExecuted, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.flapToken.toLowerCase(), tokenAddress);
	assert.equal(decoded.data.v2Pair.toLowerCase(), v2PairAddress);
	assert.equal(decoded.data.curveFillBnb, "60000");
	assert.equal(decoded.data.v2BuyBnb, "4000");
	assert.equal(decoded.data.tokensFromV2, "7000");
	assert.equal(decoded.data.tokensBurned, "200");
	assert.equal(decoded.data.tokensToTax, "100");
	assert.equal(decoded.data.openMcBnb, "250000");
});

test("decodeLaunchLog: returns null for unrelated topic", () => {
	const decoded = decodeLaunchLog({
		log: buildLog({
			address: vaultAddress,
			topics: ["0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"],
			data: "0x",
		}),
		chainId: 56,
		blockTimestamp,
	});
	assert.equal(decoded, null);
});
