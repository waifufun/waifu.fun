import assert from "node:assert/strict";
import test from "node:test";

import { buildProvisionOptions } from "./provisioning.js";

test("buildProvisionOptions uses agent wallet for account and creator/safe wallet for admin fallback", () => {
	const options = buildProvisionOptions(
		"waifu-demo-01",
		{
			name: "Demo",
			bio: null,
			avatarUrl: null,
			systemPrompt: null,
			claimedByXHandle: null,
			ownerAddress: "0x0000000000000000000000000000000000000001",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			prelaunchParams: { symbol: "DEMO" },
		},
		{
			agentWalletAddress: "0x0000000000000000000000000000000000000009",
		},
		"0x0000000000000000000000000000000000000002",
	);

	assert.deepEqual(options.account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		walletKeyRef: "steward:waifu-demo-01",
	});
	assert.deepEqual(options.access?.adminWallets, ["0x0000000000000000000000000000000000000001"]);
	assert.equal(options.access?.guestMinTokens, 1_000);
	assert.equal(options.access?.userMinTokens, 100_000);
	assert.equal(options.access?.thresholdMode, "strict_gt");
});

test("buildProvisionOptions forwards explicit agent wallet key references", () => {
	const options = buildProvisionOptions(
		"waifu-demo-key-ref",
		{
			name: "Demo",
			bio: null,
			avatarUrl: null,
			systemPrompt: null,
			claimedByXHandle: null,
			ownerAddress: "0x0000000000000000000000000000000000000001",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			prelaunchParams: null,
		},
		{
			agentWalletAddress: "0x0000000000000000000000000000000000000009",
			walletKeyRef: "steward:custom-claim-key",
		},
		null,
	);

	assert.deepEqual(options.account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		walletKeyRef: "steward:custom-claim-key",
	});
});

test("buildProvisionOptions falls back to stored Steward agent wallet for the Eliza Cloud account", () => {
	const options = buildProvisionOptions(
		"waifu-demo-stored-wallet",
		{
			name: "Demo",
			bio: null,
			avatarUrl: null,
			systemPrompt: null,
			claimedByXHandle: null,
			ownerAddress: "0x0000000000000000000000000000000000000001",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			prelaunchParams: null,
		},
		{},
		null,
		"0x0000000000000000000000000000000000000009",
	);

	assert.deepEqual(options.account, {
		primaryWalletAddress: "0x0000000000000000000000000000000000000009",
		walletKeyRef: "steward:waifu-demo-stored-wallet",
	});
	assert.deepEqual(options.access?.adminWallets, ["0x0000000000000000000000000000000000000001"]);
});

test("buildProvisionOptions does not treat creator wallet as the agent Eliza Cloud account", () => {
	const options = buildProvisionOptions(
		"waifu-demo-02",
		{
			name: "Demo",
			bio: null,
			avatarUrl: null,
			systemPrompt: null,
			claimedByXHandle: null,
			ownerAddress: "0x0000000000000000000000000000000000000001",
			tokenAddress: "0x0000000000000000000000000000000000000004",
			chain: "bsc",
			prelaunchParams: null,
		},
		{},
		"0x0000000000000000000000000000000000000002",
	);

	assert.equal(options.account, undefined);
	assert.deepEqual(options.access?.adminWallets, ["0x0000000000000000000000000000000000000001"]);
});

test("buildProvisionOptions rejects invalid agent wallet values before Eliza Cloud provisioning", () => {
	assert.throws(
		() =>
			buildProvisionOptions(
				"waifu-demo-03",
				{
					name: "Demo",
					bio: null,
					avatarUrl: null,
					systemPrompt: null,
					claimedByXHandle: null,
					ownerAddress: "0x0000000000000000000000000000000000000001",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					prelaunchParams: null,
				},
				{ primaryWalletAddress: "not-an-address" },
				null,
			),
		/agent EVM wallet.*valid EVM address/,
	);
});

test("buildProvisionOptions rejects invalid admin wallet values before Eliza Cloud provisioning", () => {
	assert.throws(
		() =>
			buildProvisionOptions(
				"waifu-demo-04",
				{
					name: "Demo",
					bio: null,
					avatarUrl: null,
					systemPrompt: null,
					claimedByXHandle: null,
					ownerAddress: "not-an-address",
					tokenAddress: "0x0000000000000000000000000000000000000004",
					chain: "bsc",
					prelaunchParams: null,
				},
				{ primaryWalletAddress: "0x0000000000000000000000000000000000000009" },
				null,
			),
		/admin wallet.*valid EVM address/,
	);
});
