import assert from "node:assert/strict";
import { test } from "node:test";

import {
	type RegisteredWallet,
	erc20RpcUrlFor,
	fetchErc20Transfers,
	nativeRpcUrlFor,
} from "./agent-wallet-transfers.js";

const WALLET_A = "0x00000000000000000000000000000000000000a1";
const WALLET_B = "0x00000000000000000000000000000000000000b2";
const TOKEN = "0x00000000000000000000000000000000000000c3";

function makeWallet(address: string): RegisteredWallet {
	return {
		agentTokenAddress: TOKEN,
		address,
		chain: "bsc",
		role: "agent",
		label: "test",
		launchBlock: null,
	};
}

type GetLogsCall = {
	address?: unknown;
	event?: unknown;
	args?: { from?: unknown; to?: unknown };
	fromBlock?: bigint;
	toBlock?: bigint;
};

// Minimal viem PublicClient stand-in that records every getLogs call so we can
// assert the wallet topic filter is applied (and that we never issue an
// unfiltered, whole-chain getLogs).
function makeRecordingClient() {
	const calls: GetLogsCall[] = [];
	const client = {
		getLogs: async (params: GetLogsCall) => {
			calls.push(params);
			return [] as unknown[];
		},
	} as unknown as Parameters<typeof fetchErc20Transfers>[0]["client"];
	return { client, calls };
}

test("fetchErc20Transfers calls getLogs WITH the wallet from/to topic filter", async () => {
	const { client, calls } = makeRecordingClient();
	const wallets = [makeWallet(WALLET_A), makeWallet(WALLET_B)];

	const result = await fetchErc20Transfers({
		client,
		chain: "bsc",
		wallets,
		fromBlock: 100n,
		toBlock: 200n,
		requestTimeoutMs: 5_000,
	});

	assert.equal(result.logsFetched, 0);
	assert.ok(calls.length > 0, "expected at least one getLogs call");

	// Every getLogs call MUST carry an args filter with either `from` or `to`
	// set to the watched wallet set. An unfiltered call (no args) would scan
	// every ERC20 Transfer on the chain, which is the cost bug we are fixing.
	for (const call of calls) {
		assert.ok(call.args, "getLogs called without args topic filter (whole-chain scan)");
		const filtered = call.args.from !== undefined || call.args.to !== undefined;
		assert.ok(filtered, "getLogs args must filter by from or to wallet topics");

		const filterValue = (call.args.from ?? call.args.to) as string[];
		assert.ok(Array.isArray(filterValue), "wallet topic filter must be an address array");
		for (const addr of filterValue) {
			assert.ok(
				[WALLET_A, WALLET_B].includes(addr.toLowerCase()),
				`getLogs filter contained unexpected address ${addr}`,
			);
		}
	}

	// We expect both directions to be queried: one call with `from`, one with `to`.
	const hasFromFilter = calls.some((c) => c.args?.from !== undefined);
	const hasToFilter = calls.some((c) => c.args?.to !== undefined);
	assert.ok(hasFromFilter, "expected a getLogs call filtered by `from` (outbound transfers)");
	assert.ok(hasToFilter, "expected a getLogs call filtered by `to` (inbound transfers)");

	// And the query is scoped to the agent token contract(s), not all of BSC.
	for (const call of calls) {
		assert.ok(call.address, "getLogs must be scoped to the token contract address(es)");
	}
});

test("erc20RpcUrlFor(bsc) avoids the Alchemy archive endpoint and uses a free public RPC", () => {
	const prevAlchemy = process.env.ALCHEMY_BSC_URL;
	const prevPublic = process.env.BSC_RPC_URL;
	try {
		process.env.ALCHEMY_BSC_URL = "https://bnb-mainnet.g.alchemy.com/v2/secret-key";
		delete process.env.BSC_RPC_URL;
		const url = erc20RpcUrlFor("bsc");
		assert.ok(!/alchemy/i.test(url), `ERC20 path must not use Alchemy, got ${url}`);
		assert.match(url, /^https?:\/\//);
	} finally {
		if (prevAlchemy === undefined) delete process.env.ALCHEMY_BSC_URL;
		else process.env.ALCHEMY_BSC_URL = prevAlchemy;
		if (prevPublic === undefined) delete process.env.BSC_RPC_URL;
		else process.env.BSC_RPC_URL = prevPublic;
	}
});

test("erc20RpcUrlFor(bsc) honors an explicit BSC_RPC_URL override", () => {
	const prevPublic = process.env.BSC_RPC_URL;
	try {
		process.env.BSC_RPC_URL = "https://my-own-bsc-node.example/rpc";
		assert.equal(erc20RpcUrlFor("bsc"), "https://my-own-bsc-node.example/rpc");
	} finally {
		if (prevPublic === undefined) delete process.env.BSC_RPC_URL;
		else process.env.BSC_RPC_URL = prevPublic;
	}
});

test("nativeRpcUrlFor(bsc) still prefers the Alchemy archive endpoint when configured", () => {
	const prevAlchemy = process.env.ALCHEMY_BSC_URL;
	try {
		process.env.ALCHEMY_BSC_URL = "https://bnb-mainnet.g.alchemy.com/v2/secret-key";
		assert.equal(nativeRpcUrlFor("bsc"), "https://bnb-mainnet.g.alchemy.com/v2/secret-key");
	} finally {
		if (prevAlchemy === undefined) delete process.env.ALCHEMY_BSC_URL;
		else process.env.ALCHEMY_BSC_URL = prevAlchemy;
	}
});
