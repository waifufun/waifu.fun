import assert from "node:assert/strict";
import test from "node:test";

import { Hono } from "hono";

import type { AppBindings } from "../lib/bindings.js";
import { createTokenRoutes } from "./tokens.js";

const TOKEN_ADDRESS = "0x0000000000000000000000000000000000000004";

function tokenDetail() {
	return {
		address: TOKEN_ADDRESS,
		name: "Hosted Waifu",
		symbol: "HOST",
		status: "dex" as const,
		progressPercent: 100,
		creatorAddress: "0x0000000000000000000000000000000000000002",
		price: "0.1",
		marketCap: "1000",
		volume24h: "100",
		holders: 42,
		priceChange24h: "0",
		createdAt: new Date("2026-05-29T00:00:00.000Z").toISOString(),
		image: null,
		chain: "evm",
		chainId: 56,
		featured: false,
		description: "hosted runtime token",
		isVerified: true,
		isImported: false,
		launchPlatform: "flap",
		ownerClaimStatus: "claimed",
		agentStatus: "running",
		agentLifecycleState: "live",
		cloudAgentId: "cloud-hosted-waifu-1",
		webUiUrl: "https://hosted-waifu.example",
		billingMode: "owner_credits",
		infraReserveUsd: "5",
		hasAgent: true,
		lastTradeAt: new Date("2026-05-29T00:01:00.000Z").toISOString(),
		metadataCid: null,
		metadataUri: null,
		quoteTokenSymbol: "BNB",
		quoteTokenAddress: null,
		poolAddress: "0x0000000000000000000000000000000000000008",
		createdBlock: null,
		agentId: "00000000-0000-4000-8000-000000000001",
	};
}

test("GET /tokens/:address exposes hosted Eliza Cloud runtime metadata for token chat", async () => {
	const app = new Hono<AppBindings>();
	app.use("*", async (c, next) => {
		c.set("requestId", "token-runtime-test");
		c.set("deps", {
			db: {
				getTokenByAddress: async (address: string) => {
					assert.equal(address, TOKEN_ADDRESS);
					return tokenDetail();
				},
			},
		} as AppBindings["Variables"]["deps"]);
		await next();
	});
	app.route("/tokens", createTokenRoutes());

	const response = await app.request(`/tokens/${TOKEN_ADDRESS}`);
	assert.equal(response.status, 200);
	const body = (await response.json()) as { ok: boolean; data: ReturnType<typeof tokenDetail> };
	assert.equal(body.ok, true);
	assert.equal(body.data.cloudAgentId, "cloud-hosted-waifu-1");
	assert.equal(body.data.webUiUrl, "https://hosted-waifu.example");
	assert.equal(body.data.agentStatus, "running");
	assert.equal(body.data.agentLifecycleState, "live");
	assert.equal(body.data.billingMode, "owner_credits");
	assert.equal(body.data.infraReserveUsd, "5");
	assert.equal(body.data.hasAgent, true);
});
