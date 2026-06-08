import assert from "node:assert/strict";
import test from "node:test";

import type { Database } from "../client.js";
import { listAgents } from "./agents.js";

function createListAgentsDb(): Database {
	const agentToken = "0x00000000000000000000000000000000000000aa";
	const safeAddress = "0x00000000000000000000000000000000000000bb";
	const monthlyBurnUsd = "900";
	const db = {
		select(fields: Record<string, unknown>) {
			const keys = new Set(Object.keys(fields));
			const kind = keys.has("persona")
				? "base"
				: keys.has("price")
					? "tokenStats"
					: keys.has("navUsd")
						? "nav"
						: keys.has("agentSafeAddress")
							? "safe"
							: "actions";

			const builder = {
				from() {
					return builder;
				},
				leftJoin() {
					return builder;
				},
				where() {
					if (kind === "safe") {
						return Promise.resolve([
							{
								tokenAddress: agentToken.toUpperCase(),
								flapTokenAddress: null,
								agentSafeAddress: safeAddress.toUpperCase(),
							},
						]);
					}
					return builder;
				},
				orderBy() {
					if (kind === "base") {
						return Promise.resolve([
							{
								persona: {
									agentId: "waifu-suki",
									name: "suki",
									bio: "runs the book",
									avatarUrl: null,
									tokenAddress: agentToken.toUpperCase(),
									preset: null,
									twitterHandle: null,
									monthlyBurnUsd,
									metadata: null,
									brainPausedAt: null,
									withdrawalsPausedAt: null,
									killedAt: null,
									createdAt: new Date("2026-05-30T12:00:00.000Z"),
								},
								wallet: {
									agentToken,
									walletAddress: "0x00000000000000000000000000000000000000cc",
									safeAddress: null,
								},
								curve: null,
								tokenTicker: "SUKI",
								tokenDescription: "runs the book",
								tokenImageUrl: null,
								tokenMarketCapUsd: null,
								tokenVolume24h: null,
								tokenPriceChange24h: null,
								tokenHolderCount: null,
							},
						]);
					}
					if (kind === "tokenStats") return Promise.resolve([]);
					if (kind === "nav") {
						return Promise.resolve([
							{
								agentTokenAddress: agentToken.toUpperCase(),
								navUsd: "4567.89",
								snapshotAt: new Date("2026-05-30T12:00:00.000Z"),
							},
						]);
					}
					return Promise.resolve([]);
				},
			};
			return builder;
		},
	};
	return db as unknown as Database;
}

test("listAgents hydrates safe address and latest NAV into summary fields", async () => {
	const result = await listAgents(createListAgentsDb(), { limit: 20, offset: 0 });

	assert.equal(result.total, 1);
	assert.equal(result.agents.length, 1);
	assert.equal(result.agents[0]?.tokenAddress, "0x00000000000000000000000000000000000000aa");
	assert.equal(result.agents[0]?.agentSafeAddress, "0x00000000000000000000000000000000000000bb");
	assert.equal(result.agents[0]?.treasuryNavUsd, 4567.89);
	assert.equal(result.agents[0]?.treasuryUsd, 4567.89);
	assert.equal(result.agents[0]?.monthlyBurnUsd, 900);
	assert.equal(result.agents[0]?.dailyBurnUsd, 30);
	assert.equal(result.agents[0]?.runwayDays, 152);
});
