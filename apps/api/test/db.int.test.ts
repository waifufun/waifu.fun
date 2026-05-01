import assert from "node:assert/strict";
import { after, beforeEach, describe, test } from "node:test";

import { createDatabase, schema } from "@waifufun/db";
import { sql } from "drizzle-orm";

import { createDrizzleDbClient } from "../src/compat/db.js";

import type { AppConfig } from "../src/contracts/services.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

const config: AppConfig = {
	app: {
		name: "waifu-api-test",
		env: "test",
		host: "127.0.0.1",
		port: 0,
		corsOrigins: [],
	},
	auth: {
		accessTokenTtlSeconds: 900,
		refreshTokenTtlSeconds: 2_592_000,
	},
	chain: {
		chainId: 56,
		rpcUrl: "http://localhost:8545",
		portalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
		nativeQuoteTokenSymbol: "BNB",
	},
	flap: {
		uploadApiUrl: "http://localhost/upload",
		metadataGatewayBaseUrl: "https://flap.mypinata.cloud/ipfs",
	},
	features: {
		curatedLaunchOnly: true,
	},
	steward: {
		jwtSecret: "test-secret",
		apiUrl: "http://localhost/steward",
		tenantId: "waifu-test",
		tenantApiKey: "test-key",
	},
};

function addr(prefix: string): string {
	return `0x${prefix.padEnd(40, "0")}`;
}

const creatorOne = addr("c0de1");
const creatorTwo = addr("c0de2");
const admin = addr("ad000");
const tokenA = addr("abc1");
const tokenB = addr("b0b2");
const tokenC = addr("cafe");
const tokenD = addr("d00d1");
const tokenMissing = addr("deaf");
const trader = addr("d00d");

if (!databaseUrl) {
	test("db integration tests", { skip: "Set TEST_DATABASE_URL or DATABASE_URL to run" }, () => {});
} else {
	const { db, client } = createDatabase(databaseUrl, { max: 1, onnotice: () => {} });
	const apiDb = createDrizzleDbClient(config, db);

	async function resetDb() {
		await db.execute(
			"TRUNCATE TABLE trades, events, tokens, launches, invite_redemptions, invite_codes, creators, token_snapshots RESTART IDENTITY CASCADE",
		);
	}

	async function seedTokenData() {
		const [firstCreator, secondCreator] = await db
			.insert(schema.creators)
			.values([
				{
					evmAddress: creatorOne.toUpperCase(),
					displayName: "Creator One",
					twitterHandle: "https://x.com/creator_one",
					isVerified: true,
				},
				{
					evmAddress: creatorTwo,
					displayName: "Creator Two",
					isVerified: false,
				},
			])
			.returning();

		assert.ok(firstCreator);
		assert.ok(secondCreator);

		await db.insert(schema.tokens).values([
			{
				chainId: config.chain.chainId,
				contractAddress: tokenA.toUpperCase(),
				name: "Alpha Waifu",
				ticker: "ALPHA",
				imageUrl: "https://example.test/alpha.png",
				description: "Alpha token",
				metadataUri: "https://flap.mypinata.cloud/ipfs/bafkreialpha",
				socials: { twitter: "https://x.com/alpha" },
				creatorAddress: creatorOne.toUpperCase(),
				creatorId: firstCreator.id,
				launchPlatform: "flap",
				portalAddress: config.chain.portalAddress,
				totalSupply: "1000000",
				curveProgress: "25",
				curveLimit: "100",
				currentPrice: "0.10",
				marketCapUsd: "1000",
				tokenPriceUsd: "0.10",
				volume24h: "500",
				priceChange24h: "12.5",
				holderCount: 10,
				status: "active",
				isFeatured: true,
				isVerified: true,
				lastTradeAt: new Date("2026-04-24T10:00:00.000Z"),
				createdAt: new Date("2026-04-24T09:00:00.000Z"),
			},
			{
				chainId: config.chain.chainId,
				contractAddress: tokenB,
				name: "Moon Bot",
				ticker: "MOON",
				description: "Bonded token",
				creatorAddress: creatorTwo,
				creatorId: secondCreator.id,
				launchPlatform: "flap",
				totalSupply: "2000000",
				currentPrice: "0.20",
				marketCapUsd: "5000",
				volume24h: "100",
				holderCount: 20,
				status: "migrated",
				dexPoolAddress: addr("f00d"),
				lastTradeAt: new Date("2026-04-24T08:00:00.000Z"),
				createdAt: new Date("2026-04-24T07:00:00.000Z"),
			},
			{
				chainId: config.chain.chainId,
				contractAddress: tokenC,
				name: "Staged Kitty",
				ticker: "KITTY",
				creatorAddress: creatorOne,
				creatorId: firstCreator.id,
				launchPlatform: "flap",
				totalSupply: "3000000",
				currentPrice: "0.01",
				marketCapUsd: "100",
				volume24h: "50",
				holderCount: 3,
				status: "migrating",
				createdAt: new Date("2026-04-24T11:00:00.000Z"),
			},
			{
				chainId: 97,
				contractAddress: tokenD,
				name: "Testnet Ghost",
				ticker: "GHOST",
				creatorAddress: creatorOne,
				creatorId: firstCreator.id,
				launchPlatform: "flap",
				totalSupply: "4000000",
				currentPrice: "0.03",
				marketCapUsd: "300",
				volume24h: "10",
				holderCount: 1,
				status: "active",
				createdAt: new Date("2026-04-24T12:00:00.000Z"),
			},
		]);

		const [buyEvent, sellEvent] = await db
			.insert(schema.events)
			.values([
				{
					chainId: config.chain.chainId,
					blockNumber: 100n,
					txHash: `0x${"1".repeat(64)}`,
					logIndex: 1,
					eventType: "TokenPurchase",
					portalAddress: config.chain.portalAddress,
					tokenAddress: tokenA,
					actorAddress: trader,
					blockTimestamp: new Date("2026-04-24T10:01:00.000Z"),
				},
				{
					chainId: config.chain.chainId,
					blockNumber: 101n,
					txHash: `0x${"2".repeat(64)}`,
					logIndex: 1,
					eventType: "TokenSale",
					portalAddress: config.chain.portalAddress,
					tokenAddress: tokenA,
					actorAddress: trader,
					blockTimestamp: new Date("2026-04-24T10:06:00.000Z"),
				},
			])
			.returning();

		assert.ok(buyEvent);
		assert.ok(sellEvent);

		await db.insert(schema.trades).values([
			{
				eventId: buyEvent.id,
				chainId: config.chain.chainId,
				tokenAddress: tokenA.toUpperCase(),
				traderAddress: trader,
				side: "buy",
				amountIn: "1.0",
				amountOut: "10.0",
				price: "0.10",
				usdValue: "10",
				txHash: buyEvent.txHash,
				blockNumber: buyEvent.blockNumber,
				blockTimestamp: buyEvent.blockTimestamp,
			},
			{
				eventId: sellEvent.id,
				chainId: config.chain.chainId,
				tokenAddress: tokenA.toUpperCase(),
				traderAddress: trader,
				side: "sell",
				amountIn: "5.0",
				amountOut: "0.75",
				price: "0.15",
				usdValue: "15",
				txHash: sellEvent.txHash,
				blockNumber: sellEvent.blockNumber,
				blockTimestamp: sellEvent.blockTimestamp,
			},
		]);
	}

	beforeEach(async () => {
		await resetDb();
	});

	after(async () => {
		await resetDb();
		await client.end();
	});

	describe("Drizzle DbClient", () => {
		test("ping and health perform a Postgres round-trip", async () => {
			assert.equal(await apiDb.ping(), true);
			assert.deepEqual(await apiDb.health(), { ok: true, provider: "drizzle-postgres" });
		});

		test("lists tokens with pagination, filters, sorting, and case-insensitive creator search", async () => {
			await seedTokenData();
			await db.insert(schema.tokens).values({
				chainId: config.chain.chainId,
				contractAddress: tokenA.toLowerCase(),
				name: "Alpha Duplicate Case",
				ticker: "ADUP",
				creatorAddress: creatorOne,
				launchPlatform: "flap",
				totalSupply: "1",
				status: "active",
			});

			const firstPage = await apiDb.listTokens({
				limit: 2,
				offset: 0,
				sort: "new",
				lifecycle: "all",
			});
			assert.equal(firstPage.total, 3);
			assert.equal(firstPage.items.length, 2);
			assert.equal(firstPage.hasMore, true);
			assert.equal(firstPage.page, 1);
			assert.equal(firstPage.items[0]?.symbol, "KITTY");

			const featured = await apiDb.listTokens({ limit: 10, featured: true, lifecycle: "all" });
			assert.deepEqual(
				featured.items.map((token) => token.symbol),
				["ALPHA"],
			);

			const bonded = await apiDb.listTokens({ limit: 10, status: "dex", lifecycle: "bonded" });
			assert.deepEqual(
				bonded.items.map((token) => token.symbol),
				["MOON"],
			);

			const bonding = await apiDb.listTokens({ limit: 10, lifecycle: "bonding" });
			assert.deepEqual(bonding.items.map((token) => token.status).sort(), ["staged", "tradable"]);

			const creatorFiltered = await apiDb.listTokens({
				limit: 10,
				creatorAddress: creatorOne.toLowerCase(),
				lifecycle: "all",
				sort: "marketCap",
			});
			assert.deepEqual(
				creatorFiltered.items.map((token) => token.symbol),
				["ALPHA", "KITTY"],
			);

			const search = await apiDb.listTokens({ limit: 10, search: "moon", lifecycle: "all" });
			assert.deepEqual(
				search.items.map((token) => token.symbol),
				["MOON"],
			);
		});

		test("gets token detail, trades, chart candles, and links agents case-insensitively", async () => {
			await seedTokenData();

			const detail = await apiDb.getTokenByAddress(tokenA.toLowerCase());
			assert.equal(detail?.symbol, "ALPHA");
			assert.equal(detail?.metadataCid, "bafkreialpha");
			assert.equal(detail?.progressPercent, 25);

			const candles = await apiDb.getTokenChartData({
				address: tokenA.toLowerCase(),
				interval: "5m",
				from: new Date("2026-04-24T10:00:00.000Z"),
				to: new Date("2026-04-24T10:10:00.000Z"),
				limit: 10,
			});
			assert.equal(candles.length, 2);
			assert.equal(candles[0]?.open, 0.1);
			assert.equal(candles[1]?.close, 0.15);

			const agentId = "11111111-1111-4111-8111-111111111111";
			await apiDb.linkAgentToToken(tokenA.toLowerCase(), agentId);
			const linked = await apiDb.getTokenByAddress(tokenA.toLowerCase());
			assert.equal(linked?.agentId, agentId);
			assert.equal(linked?.agentStatus, "provisioning");

			await db.insert(schema.tokens).values({
				chainId: config.chain.chainId,
				contractAddress: tokenA.toLowerCase(),
				name: "Alpha Duplicate Case",
				ticker: "ADUP",
				creatorAddress: creatorOne,
				launchPlatform: "flap",
				totalSupply: "1",
				status: "active",
			});

			const canonicalAfterDuplicate = await apiDb.getTokenByAddress(tokenA.toLowerCase());
			assert.equal(canonicalAfterDuplicate?.symbol, "ALPHA");

			const trades = await apiDb.listTokenTrades({ address: tokenA.toLowerCase(), limit: 10 });
			assert.equal(trades.length, 2);
			assert.equal(trades[0]?.side, "sell");
			assert.equal(trades[1]?.side, "buy");

			const [orphanEvent] = await db
				.insert(schema.events)
				.values({
					chainId: config.chain.chainId,
					blockNumber: 102n,
					txHash: `0x${"3".repeat(64)}`,
					logIndex: 1,
					eventType: "TokenPurchase",
					portalAddress: config.chain.portalAddress,
					tokenAddress: tokenMissing,
					actorAddress: trader,
					blockTimestamp: new Date("2026-04-24T10:07:00.000Z"),
				})
				.returning();
			assert.ok(orphanEvent);
			await db.insert(schema.trades).values({
				eventId: orphanEvent.id,
				chainId: config.chain.chainId,
				tokenAddress: tokenMissing,
				traderAddress: trader,
				side: "buy",
				amountIn: "1.0",
				amountOut: "1.0",
				price: "1.0",
				usdValue: "1.0",
				txHash: orphanEvent.txHash,
				blockNumber: orphanEvent.blockNumber,
				blockTimestamp: orphanEvent.blockTimestamp,
			});
			const orphanTrades = await apiDb.listTokenTrades({ address: tokenMissing, limit: 10 });
			assert.equal(orphanTrades.length, 1);
		});

		test("upserts and partially updates creator profiles", async () => {
			const initial = await apiDb.getCreatorProfile(creatorOne.toUpperCase());
			assert.equal(initial.address, creatorOne);
			assert.equal(initial.displayName, null);

			await db.insert(schema.creators).values({
				evmAddress: creatorOne.toUpperCase(),
				displayName: "Legacy Mixed Case Copy",
			});

			const updated = await apiDb.updateCreatorProfile(creatorOne.toUpperCase(), {
				displayName: "Test Creator",
				twitter: "https://x.com/test_creator",
				bio: "Schema currently has no bio column",
			});
			assert.equal(updated.displayName, "Test Creator");
			assert.equal(updated.twitter, "https://x.com/test_creator");
			assert.equal(updated.bio, null);

			const [legacyCopy] = await db.execute<{ displayName: string | null }>(
				sql`SELECT display_name AS "displayName" FROM creators WHERE evm_address = ${creatorOne.toUpperCase()}`,
			);
			assert.equal(legacyCopy?.displayName, "Legacy Mixed Case Copy");
		});

		test("creates, validates, lists, and redeems invite codes through launches", async () => {
			const invite = await apiDb.createInviteCode({
				code: "W1-1-INVITE",
				maxUses: 2,
				createdByAddress: admin,
			});
			assert.equal(invite.createdBy, admin);
			assert.equal(invite.usedCount, 0);

			assert.deepEqual(await apiDb.validateInviteCode("W1-1-INVITE"), {
				valid: true,
				remainingUses: 2,
			});
			assert.equal((await apiDb.listInviteCodes())[0]?.code, "W1-1-INVITE");

			await db.insert(schema.creators).values([
				{
					evmAddress: creatorOne.toUpperCase(),
					displayName: "Existing Mixed Case Creator",
				},
				{
					evmAddress: creatorOne,
					displayName: "Canonical Lowercase Creator",
				},
			]);

			const launchWithInvite = await apiDb.createLaunch(
				creatorOne,
				{
					name: "Invited Launch",
					symbol: "INV",
					description: "Launch with a valid invite",
					taxRateBps: 100,
					inviteCode: "W1-1-INVITE",
					initialBuyBnb: "0.5",
					website: "https://example.test",
					twitter: "https://x.com/inv",
				},
				{ curatedLaunchOnly: true },
			);
			assert.equal(launchWithInvite.status, "preparing");
			assert.equal(launchWithInvite.creatorAddress, creatorOne);
			assert.equal(launchWithInvite.inviteCode, "W1-1-INVITE");
			assert.equal(launchWithInvite.initialBuyBnb, "0.5");

			assert.deepEqual(await apiDb.validateInviteCode("W1-1-INVITE"), {
				valid: true,
				remainingUses: 1,
			});
			const [{ total: creatorRows }] = await db.execute<{ total: number }>(
				sql`SELECT count(*)::int AS total FROM creators WHERE lower(evm_address) = ${creatorOne}`,
			);
			assert.equal(creatorRows, 2);

			const duplicateCreatorLaunch = await apiDb.createLaunch(
				creatorOne,
				{
					name: "Duplicate Creator Invite Launch",
					symbol: "DUP",
					description: "Same creator should not reuse the same invite redemption",
					taxRateBps: 0,
					inviteCode: "W1-1-INVITE",
				},
				{ curatedLaunchOnly: true },
			);
			assert.equal(duplicateCreatorLaunch.status, "pending");
			assert.deepEqual(await apiDb.validateInviteCode("W1-1-INVITE"), {
				valid: true,
				remainingUses: 1,
			});

			const siblingInvite = await apiDb.createInviteCode({
				code: "SIBLING-CREATOR-INVITE",
				maxUses: 2,
				createdByAddress: admin,
			});
			const [uppercaseCreator] = await db.execute<{ id: string }>(
				sql`SELECT id FROM creators WHERE evm_address = ${creatorOne.toUpperCase()}`,
			);
			assert.ok(uppercaseCreator);
			await db.insert(schema.inviteRedemptions).values({
				inviteCodeId: siblingInvite.id,
				creatorId: uppercaseCreator.id,
			});
			await db
				.update(schema.inviteCodes)
				.set({ usedCount: 1 })
				.where(sql`${schema.inviteCodes.id} = ${siblingInvite.id}`);

			const siblingCreatorLaunch = await apiDb.createLaunch(
				creatorOne,
				{
					name: "Sibling Creator Invite Launch",
					symbol: "SIB",
					description: "Sibling creator row redemption should count as already used",
					taxRateBps: 0,
					inviteCode: "SIBLING-CREATOR-INVITE",
				},
				{ curatedLaunchOnly: true },
			);
			assert.equal(siblingCreatorLaunch.status, "pending");
			assert.deepEqual(await apiDb.validateInviteCode("SIBLING-CREATOR-INVITE"), {
				valid: true,
				remainingUses: 1,
			});
		});

		test("creates, fetches, lists, and updates launches", async () => {
			const pending = await apiDb.createLaunch(
				creatorTwo,
				{
					name: "Pending Launch",
					symbol: "PEND",
					description: "Launch without invite",
					imageUrl: "https://example.test/image.png",
					telegram: "https://t.me/pending",
					taxRateBps: 0,
				},
				{ curatedLaunchOnly: true },
			);
			assert.equal(pending.status, "pending");
			assert.equal(pending.creatorAddress, creatorTwo);

			const fetched = await apiDb.getLaunchById(pending.id);
			assert.equal(fetched?.name, "Pending Launch");
			assert.equal(fetched?.telegram, "https://t.me/pending");

			const listed = await apiDb.listAdminLaunches();
			assert.equal(listed.length, 1);
			assert.equal(listed[0]?.id, pending.id);

			const approved = await apiDb.updateLaunchStatus(pending.id, "approved");
			assert.equal(approved?.status, "preparing");

			const rejected = await apiDb.updateLaunchStatus(pending.id, "rejected");
			assert.equal(rejected?.status, "rejected");

			assert.equal(await apiDb.updateLaunchStatus("22222222-2222-4222-8222-222222222222", "failed"), null);
		});
	});
}
