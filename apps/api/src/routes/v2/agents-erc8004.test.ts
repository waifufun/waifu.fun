import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { BSC_MAINNET_ERC8004_REGISTRY, SOL_TOKEN_ADDRESS } from "@waifufun/identity";

import app, { __setErc8004RouteDepsForTest } from "./agents-erc8004.js";

function createMockDb(args: {
	identity?: Record<string, unknown>;
	persona?: Record<string, unknown>;
	wallet?: Record<string, unknown>;
	throwOnIdentity?: unknown;
}) {
	let call = 0;
	return {
		select: () => ({
			from: () => ({
				where: () => ({
					limit: async () => {
						call += 1;
						if (call === 1) {
							if (args.throwOnIdentity) throw args.throwOnIdentity;
							return args.identity ? [args.identity] : [];
						}
						if (call === 2) return args.persona ? [args.persona] : [];
						return args.wallet ? [args.wallet] : [];
					},
				}),
			}),
		}),
	};
}

const identity = {
	id: "f5763003-0b5c-4a70-b73c-6f2db8a6b001",
	agentAddress: SOL_TOKEN_ADDRESS,
	standard: "erc-8004",
	chainId: 56,
	registry: BSC_MAINNET_ERC8004_REGISTRY,
	agentIdOnchain: "123456",
	uri: "ipfs://bafybeigdyrzt5sfp7udm7hu76v2r4h2t6b77s64z5m2r4examplecid",
	uriIpfs: "ipfs://bafybeigdyrzt5sfp7udm7hu76v2r4h2t6b77s64z5m2r4examplecid",
	uriHttps: `https://api.waifu.fun/v2/agents/${SOL_TOKEN_ADDRESS}/erc8004.json`,
	registrationTx: "0x1111111111111111111111111111111111111111111111111111111111111111",
	registeredAt: new Date("2026-05-24T00:00:00.000Z"),
	createdAt: new Date("2026-05-24T00:00:00.000Z"),
	updatedAt: new Date("2026-05-24T00:00:00.000Z"),
};

const otherIdentity = {
	...identity,
	id: "f5763003-0b5c-4a70-b73c-6f2db8a6b002",
	agentAddress: "0x000000000000000000000000000000000000dEaD",
	agentIdOnchain: "123457",
	uriHttps: "https://api.waifu.fun/v2/agents/0x000000000000000000000000000000000000dEaD/erc8004.json",
};

const persona = {
	agentId: "waifu-sol",
	tokenAddress: SOL_TOKEN_ADDRESS,
	name: "Sol",
	bio: "the architect — waifu.fun v0 agent",
	avatarUrl: "https://waifu.fun/agents/sol/avatar.png",
	twitterHandle: "0xSolace_",
	metadata: {},
	ownerAddress: "0xCF3104986C4ef45326A918A9F7F80DE57953Fc21",
	launchedAt: new Date("2026-05-24T00:00:00.000Z"),
	createdAt: new Date("2026-05-24T00:00:00.000Z"),
};

const otherPersona = {
	...persona,
	agentId: "waifu-test",
	tokenAddress: otherIdentity.agentAddress,
};

const wallet = {
	walletAddress: "0xCF3104986C4ef45326A918A9F7F80DE57953Fc21",
};

describe("GET /:address/identity", () => {
	afterEach(() => __setErc8004RouteDepsForTest({ db: undefined }));

	it("serves the frontend ERC-8004 identity shape", async () => {
		__setErc8004RouteDepsForTest({ db: createMockDb({ identity, persona, wallet }) as never });
		const res = await app.request(`/${SOL_TOKEN_ADDRESS}/identity`);
		assert.equal(res.status, 200);
		assert.equal(res.headers.get("cache-control"), "public, max-age=300");
		const body = (await res.json()) as { data: Record<string, unknown> };
		assert.deepEqual(body.data, {
			standard: "erc-8004",
			chain: "bsc",
			chainId: 56,
			registryAddress: BSC_MAINNET_ERC8004_REGISTRY,
			tokenId: "123456",
			agentURI: identity.uri,
			metadataHttpsUrl: identity.uriHttps,
			metadataIpfsUri: identity.uriIpfs,
			ownerWalletAddress: wallet.walletAddress,
			txHash: identity.registrationTx,
			blockNumber: null,
			registeredAt: "2026-05-24T00:00:00.000Z",
			firstWaifuAgent: true,
		});
	});

	it("does not mark non-Sol identity records as the first waifu agent", async () => {
		__setErc8004RouteDepsForTest({
			db: createMockDb({ identity: otherIdentity, persona: otherPersona, wallet }) as never,
		});
		const res = await app.request(`/${otherIdentity.agentAddress}/identity`);
		assert.equal(res.status, 200);
		const body = (await res.json()) as { data: Record<string, unknown> };
		assert.equal("firstWaifuAgent" in body.data, false);
	});

	it("returns 404 for agents without an identity row", async () => {
		__setErc8004RouteDepsForTest({ db: createMockDb({ persona, wallet }) as never });
		const res = await app.request(`/${SOL_TOKEN_ADDRESS}/identity`);
		assert.equal(res.status, 404);
	});

	it("returns 404 when the identity table is missing", async () => {
		__setErc8004RouteDepsForTest({
			db: createMockDb({
				throwOnIdentity: { code: "42P01", message: 'relation "agent_identities" does not exist' },
			}) as never,
		});
		const res = await app.request(`/${SOL_TOKEN_ADDRESS}/identity`);
		assert.equal(res.status, 404);
	});
});

describe("GET /:address/erc8004.json", () => {
	afterEach(() => __setErc8004RouteDepsForTest({ db: undefined }));

	it("serves valid ERC-8004 JSON with cache headers", async () => {
		__setErc8004RouteDepsForTest({ db: createMockDb({ identity, persona }) as never });
		const res = await app.request(`/${SOL_TOKEN_ADDRESS}/erc8004.json`);
		assert.equal(res.status, 200);
		assert.equal(res.headers.get("cache-control"), "public, max-age=60");
		const body = (await res.json()) as {
			name: string;
			registrations: Array<{ agentId: string }>;
			waifu: { tokenAddress: string };
		};
		assert.equal(body.name, "Sol");
		assert.equal(body.registrations[0]?.agentId, "123456");
		assert.equal(body.waifu.tokenAddress, SOL_TOKEN_ADDRESS);
	});

	it("returns 404 for agents without an identity row", async () => {
		__setErc8004RouteDepsForTest({ db: createMockDb({ persona }) as never });
		const res = await app.request(`/${SOL_TOKEN_ADDRESS}/erc8004.json`);
		assert.equal(res.status, 404);
	});
});
