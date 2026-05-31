import assert from "node:assert/strict";
import test from "node:test";

import { type BagsExternalPlan, executeBagsLaunch } from "../src/adapters/bags/executor.js";
import { type BankrExternalPlan, executeBankrLaunch } from "../src/adapters/bankr/executor.js";

const EVM_FOUNDER = "0x000000000000000000000000000000000000dEaD";
const SOL_FOUNDER = "So11111111111111111111111111111111111111112";
const TOKEN_ADDR = "0x1111111111111111111111111111111111111111";

// Build executable plans directly (the adapter -> plan shape is covered by
// bankr-bags.test.ts). These mirror exactly what buildCreateTokenTx emits when
// creds are configured (simulateOnly=false).
function bankrPlan(): BankrExternalPlan {
	return {
		kind: "bankr",
		baseUrl: "https://api.bankr.bot",
		endpoint: "/token-launches/deploy",
		method: "POST",
		simulateOnly: false,
		body: {
			tokenName: "Bankr E2E",
			tokenSymbol: "BNKR",
			description: "exec test",
			imageUrl: "https://example.com/l.png",
			feeRecipient: { type: "wallet", value: EVM_FOUNDER },
			simulateOnly: false,
		},
		auth: { userHeader: "X-API-Key", partnerHeader: "X-Partner-Key" },
		mockResponse: {
			tokenAddress: TOKEN_ADDR,
			poolId: "0xpool",
			feeDistribution: {
				creator: { address: EVM_FOUNDER, bps: 5700 },
				bankr: { address: EVM_FOUNDER, bps: 1805 },
				partner: { address: EVM_FOUNDER, bps: 1805 },
				alt: { address: EVM_FOUNDER, bps: 190 },
				protocol: { address: EVM_FOUNDER, bps: 500 },
			},
		},
	};
}

function bagsPlan(): BagsExternalPlan {
	return {
		kind: "bags",
		baseUrl: "https://public-api-v2.bags.fm/api/v1",
		simulateOnly: false,
		bagsConfigType: "fa29606e-5e48-4c37-827f-4b03d58ee23d",
		steps: [
			{
				endpoint: "/token-launch/create-token-info",
				method: "POST",
				contentType: "multipart/form-data",
				body: {
					name: "Bags E2E",
					symbol: "BAGS",
					description: "exec test",
					imageUrl: "https://example.com/l.png",
				},
			},
			{
				endpoint: "/fee-share/config",
				method: "POST",
				body: {
					payer: SOL_FOUNDER,
					baseMint: "PLACEHOLDER",
					claimersArray: [SOL_FOUNDER, SOL_FOUNDER],
					basisPointsArray: [9000, 1000],
				},
			},
			{
				endpoint: "/token-launch/create-launch-transaction",
				method: "POST",
				body: {
					ipfs: "PLACEHOLDER",
					tokenMint: "PLACEHOLDER",
					wallet: SOL_FOUNDER,
					initialBuyLamports: 10_000_000,
					configKey: "PLACEHOLDER",
				},
			},
			{ endpoint: "/solana/send-transaction", method: "POST", body: { transaction: "<signed-base58-tx>" } },
		],
		auth: { header: "x-api-key", agentAuthEndpoints: ["/agent/v2/auth/init", "/agent/v2/auth/callback"] },
		mockResponse: { tokenMint: "Bag", tokenMetadata: "ipfs://x", configKey: "Cfg", signature: "Sig" },
	};
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("bankr executor: synchronous deploy resolves token + pool from documented response", async () => {
	const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
	const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
		calls.push({
			url: String(url),
			body: init?.body ? JSON.parse(String(init.body)) : null,
			headers: init?.headers as Record<string, string>,
		});
		return jsonResponse(200, { tokenAddress: TOKEN_ADDR, poolId: "0xpool123", transactionHash: "0xdeadbeef" });
	}) as unknown as typeof fetch;

	const result = await executeBankrLaunch(bankrPlan(), { apiKey: "bk_test", partnerKey: "partner_test", fetchImpl });

	assert.equal(result.tokenAddress, TOKEN_ADDR);
	assert.equal(result.poolId, "0xpool123");
	assert.equal(result.txHash, "0xdeadbeef");
	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.url, "https://api.bankr.bot/token-launches/deploy");
	assert.equal((calls[0]?.body as { simulateOnly?: boolean }).simulateOnly, false);
	assert.equal(calls[0]?.headers["X-API-Key"], "bk_test");
	assert.equal(calls[0]?.headers["X-Partner-Key"], "partner_test");
});

test("bankr executor: job-based deploy polls until the token resolves", async () => {
	let poll = 0;
	const fetchImpl = (async (url: string | URL) => {
		const u = String(url);
		if (u.endsWith("/token-launches/deploy")) return jsonResponse(200, { jobId: "job_1", status: "pending" });
		poll += 1;
		if (poll < 2) return jsonResponse(200, { status: "pending" });
		return jsonResponse(200, { data: { tokenAddress: TOKEN_ADDR, poolAddress: "0xpoolABC", status: "completed" } });
	}) as unknown as typeof fetch;

	const result = await executeBankrLaunch(bankrPlan(), {
		apiKey: "bk_test",
		fetchImpl,
		pollIntervalMs: 1,
		pollTimeoutMs: 5000,
	});
	assert.equal(result.tokenAddress, TOKEN_ADDR);
	assert.equal(result.poolId, "0xpoolABC");
});

test("bankr executor: surfaces HTTP errors and refuses dry-run plans", async () => {
	const errFetch = (async () => jsonResponse(402, { error: "subscription required" })) as unknown as typeof fetch;
	await assert.rejects(() => executeBankrLaunch(bankrPlan(), { apiKey: "bk_test", fetchImpl: errFetch }), /HTTP 402/);

	const dryPlan = { ...bankrPlan(), simulateOnly: true };
	await assert.rejects(() => executeBankrLaunch(dryPlan, { apiKey: "bk_test" }), /simulateOnly/);
	await assert.rejects(() => executeBankrLaunch(bankrPlan(), { apiKey: "" }), /API key|required/i);
});

test("bags executor: runs the full v2 flow and signs + sends the launch tx", async () => {
	const sent: string[] = [];
	const signedTxs: string[] = [];
	const signer = {
		publicKey: SOL_FOUNDER,
		async signTransactions(txs: string[]) {
			signedTxs.push(...txs);
			return txs.map((t) => `signed(${t})`);
		},
	};

	const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
		const u = String(url);
		if (u.endsWith("/token-launch/create-token-info")) {
			return jsonResponse(200, { success: true, response: { tokenMint: "MintXYZ", tokenMetadata: "ipfs://meta" } });
		}
		if (u.endsWith("/fee-share/config")) {
			return jsonResponse(200, {
				success: true,
				response: {
					needsCreation: true,
					meteoraConfigKey: "CfgKey123",
					transactions: [{ blockhash: { blockhash: "bh", lastValidBlockHeight: 1 }, transaction: "feeTx1" }],
				},
			});
		}
		if (u.endsWith("/token-launch/create-launch-transaction")) {
			return jsonResponse(200, { success: true, response: "launchTxB58" });
		}
		if (u.endsWith("/solana/send-transaction")) {
			const body = init?.body ? JSON.parse(String(init.body)) : {};
			sent.push(body.transaction);
			return jsonResponse(200, { success: true, response: `sig_for_${body.transaction}` });
		}
		throw new Error(`unexpected url ${u}`);
	}) as unknown as typeof fetch;

	const result = await executeBagsLaunch(bagsPlan(), { apiKey: "bags_test", signer, fetchImpl });

	assert.equal(result.tokenMint, "MintXYZ");
	assert.equal(result.tokenMetadata, "ipfs://meta");
	assert.equal(result.configKey, "CfgKey123");
	assert.deepEqual(signedTxs, ["feeTx1", "launchTxB58"]);
	assert.equal(result.feeShareSignatures.length, 1);
	assert.equal(result.feeShareSignatures[0], "sig_for_signed(feeTx1)");
	assert.equal(result.signature, "sig_for_signed(launchTxB58)");
	assert.equal(sent[sent.length - 1], "signed(launchTxB58)");
});

test("bags executor: skips fee-share send when config already exists", async () => {
	const signer = {
		publicKey: SOL_FOUNDER,
		async signTransactions(txs: string[]) {
			return txs.map((t) => `signed(${t})`);
		},
	};
	const fetchImpl = (async (url: string | URL) => {
		const u = String(url);
		if (u.endsWith("/create-token-info"))
			return jsonResponse(200, { success: true, response: { tokenMint: "M2", tokenMetadata: "ipfs://m2" } });
		if (u.endsWith("/fee-share/config"))
			return jsonResponse(200, { success: true, response: { needsCreation: false, meteoraConfigKey: "Cfg2" } });
		if (u.endsWith("/create-launch-transaction")) return jsonResponse(200, { success: true, response: "lt" });
		if (u.endsWith("/solana/send-transaction")) return jsonResponse(200, { success: true, response: "sigLaunch" });
		throw new Error(`unexpected ${u}`);
	}) as unknown as typeof fetch;

	const result = await executeBagsLaunch(bagsPlan(), { apiKey: "bags_test", signer, fetchImpl });
	assert.equal(result.feeShareSignatures.length, 0);
	assert.equal(result.signature, "sigLaunch");
});

test("bags executor: validates signer + refuses dry-run plans", async () => {
	const signer = {
		publicKey: SOL_FOUNDER,
		async signTransactions(t: string[]) {
			return t;
		},
	};
	await assert.rejects(
		() => executeBagsLaunch({ ...bagsPlan(), simulateOnly: true }, { apiKey: "k", signer }),
		/simulateOnly/,
	);
	await assert.rejects(
		() =>
			executeBagsLaunch(bagsPlan(), {
				apiKey: "k",
				signer: { publicKey: "not-base58!", signTransactions: async (t) => t },
			}),
		/signer/i,
	);
	await assert.rejects(() => executeBagsLaunch(bagsPlan(), { apiKey: "", signer }), /API key|required/i);
});
