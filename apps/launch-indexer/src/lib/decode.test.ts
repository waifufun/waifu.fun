/**
 * Unit tests for the launch event decoder (wave H signatures).
 *
 * Each test encodes a known event with viem's `encodeEventTopics` +
 * `encodeAbiParameters`, then asserts the decoder reconstructs the original
 * args and event metadata.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { type Hex, encodeAbiParameters, encodeEventTopics, keccak256, toHex } from "viem";

import { bundleRouterEventsAbi, launchFactoryEventsAbi, launchVaultEventsAbi } from "./abis.js";
import { decodeLaunchLog } from "./decode.js";

const factoryAddress = "0x1111111111111111111111111111111111111111" as const;
const vaultAddress = "0x2222222222222222222222222222222222222222" as const;
const routerAddress = "0x3333333333333333333333333333333333333333" as const;
const tokenAddress = "0x4444444444444444444444444444444444444444" as const;
const userAddress = "0x5555555555555555555555555555555555555555" as const;
const poolAddress = "0x6666666666666666666666666666666666666666" as const;
const treasuryLpAddress = "0x7777777777777777777777777777777777777777" as const;
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
	const launchId = keccak256(toHex("launch-1"));
	const topics = encodeEventTopics({
		abi: launchFactoryEventsAbi,
		eventName: "LaunchCreated",
		args: { launchId, creator: userAddress, predictedToken: tokenAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "vault", type: "address" },
			{ name: "router", type: "address" },
			{ name: "treasuryLp", type: "address" },
			{ name: "tier", type: "uint8" },
			{ name: "presaleCap", type: "uint256" },
			{ name: "v2BuyBnb", type: "uint256" },
			{ name: "closeTimestamp", type: "uint256" },
		],
		[vaultAddress, routerAddress, treasuryLpAddress, 90, 50_000n, 4_000n, 1_700_000_000n],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: factoryAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	assert.equal(decoded.eventName, "LaunchCreated");
	if (decoded.eventName !== "LaunchCreated") return;

	assert.equal(decoded.data.launchId.toLowerCase(), launchId.toLowerCase());
	assert.equal(decoded.data.creator.toLowerCase(), userAddress);
	assert.equal(decoded.data.predictedToken.toLowerCase(), tokenAddress);
	assert.equal(decoded.data.vault.toLowerCase(), vaultAddress);
	assert.equal(decoded.data.router.toLowerCase(), routerAddress);
	assert.equal(decoded.data.treasuryLp.toLowerCase(), treasuryLpAddress);
	assert.equal(decoded.data.tier, 90);
	assert.equal(decoded.data.presaleCap, "50000");
	assert.equal(decoded.data.v2BuyBnb, "4000");
	assert.equal(decoded.data.closeTimestamp, "1700000000");
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

test("decodeLaunchLog: LaunchExecuted", () => {
	const topics = encodeEventTopics({
		abi: launchVaultEventsAbi,
		eventName: "LaunchExecuted",
		args: { token: tokenAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "totalBnb", type: "uint256" },
			{ name: "timestamp", type: "uint256" },
		],
		[80_000n, 1_700_000_000n],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: vaultAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "LaunchExecuted") {
		assert.fail(`expected LaunchExecuted, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.token.toLowerCase(), tokenAddress);
	assert.equal(decoded.data.totalBnb, "80000");
	assert.equal(decoded.data.timestamp, "1700000000");
});

test("decodeLaunchLog: Distributed", () => {
	const topics = encodeEventTopics({
		abi: launchVaultEventsAbi,
		eventName: "Distributed",
		args: { token: tokenAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters([{ name: "presalerShare", type: "uint256" }], [40_000_000n]);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: vaultAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "Distributed") {
		assert.fail(`expected Distributed, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.token.toLowerCase(), tokenAddress);
	assert.equal(decoded.data.presalerShare, "40000000");
});

test("decodeLaunchLog: RefundEnabled", () => {
	const topics = encodeEventTopics({
		abi: launchVaultEventsAbi,
		eventName: "RefundEnabled",
		args: { by: userAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters([{ name: "reason", type: "string" }], ["under-subscribed"]);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: vaultAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "RefundEnabled") {
		assert.fail(`expected RefundEnabled, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.by.toLowerCase(), userAddress);
	assert.equal(decoded.data.reason, "under-subscribed");
});

test("decodeLaunchLog: Refunded", () => {
	const topics = encodeEventTopics({
		abi: launchVaultEventsAbi,
		eventName: "Refunded",
		args: { user: userAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "principal", type: "uint256" },
			{ name: "bonus", type: "uint256" },
			{ name: "refundAmount", type: "uint256" },
		],
		[1_000n, 50n, 1_050n],
	);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: vaultAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "Refunded") {
		assert.fail(`expected Refunded, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.user.toLowerCase(), userAddress);
	assert.equal(decoded.data.principal, "1000");
	assert.equal(decoded.data.bonus, "50");
	assert.equal(decoded.data.refundAmount, "1050");
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
		args: { token: tokenAddress, pool: poolAddress },
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters(
		[
			{ name: "quoteAmt", type: "uint256" },
			{ name: "v2BuyBnb", type: "uint256" },
			{ name: "tokensReceived", type: "uint256" },
			{ name: "tokensBurned", type: "uint256" },
			{ name: "tokensToTreasury", type: "uint256" },
			{ name: "tokensToVault", type: "uint256" },
			{ name: "tipPaid", type: "uint256" },
			{ name: "openMcBnb", type: "uint256" },
		],
		[60_000n, 4_000n, 7_000n, 200n, 100n, 100n, 50n, 250_000n],
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
	assert.equal(decoded.data.token.toLowerCase(), tokenAddress);
	assert.equal(decoded.data.pool.toLowerCase(), poolAddress);
	assert.equal(decoded.data.quoteAmt, "60000");
	assert.equal(decoded.data.v2BuyBnb, "4000");
	assert.equal(decoded.data.tokensReceived, "7000");
	assert.equal(decoded.data.tokensBurned, "200");
	assert.equal(decoded.data.tokensToTreasury, "100");
	assert.equal(decoded.data.tokensToVault, "100");
	assert.equal(decoded.data.tipPaid, "50");
	assert.equal(decoded.data.openMcBnb, "250000");
});

test("decodeLaunchLog: BundleFailed", () => {
	const topics = encodeEventTopics({
		abi: bundleRouterEventsAbi,
		eventName: "BundleFailed",
	}) as [Hex, ...Hex[]];

	const data = encodeAbiParameters([{ name: "reason", type: "string" }], ["PredictedAddressMismatch"]);

	const decoded = decodeLaunchLog({
		log: buildLog({ address: routerAddress, topics, data }),
		chainId: 56,
		blockTimestamp,
	});

	assert.ok(decoded);
	if (decoded.eventName !== "BundleFailed") {
		assert.fail(`expected BundleFailed, got ${decoded.eventName}`);
	}
	assert.equal(decoded.data.reason, "PredictedAddressMismatch");
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
