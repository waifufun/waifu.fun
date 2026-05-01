#!/usr/bin/env tsx
import { createDatabase } from "./client.js";
import { events, creators, inviteCodes, launches, tokens, trades } from "./schema/index.js";

async function seed() {
	const { db, client } = createDatabase();
	console.log("🌱 Starting database seed...\n");

	// Clear existing data (in reverse dependency order)
	console.log("🗑️  Clearing existing data...");
	await db.delete(trades);
	await db.delete(events);
	await db.delete(tokens);
	await db.delete(launches);
	await db.delete(inviteCodes);
	await db.delete(creators);
	console.log("✅ Cleared\n");

	// === CREATORS ===
	console.log("👥 Creating creators...");
	const insertedCreators = await db
		.insert(creators)
		.values([
			{
				evmAddress: "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1",
				displayName: "Alice Nakamoto",
				avatarUrl: "https://i.pravatar.cc/150?img=1",
				twitterHandle: "alice_nakamoto",
				isVerified: true,
				isSuspended: false,
				points: BigInt(15000),
				weeklyPoints: BigInt(2500),
			},
			{
				evmAddress: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199",
				displayName: "Bob Builder",
				avatarUrl: "https://i.pravatar.cc/150?img=12",
				twitterHandle: "bobbuildsAI",
				isVerified: false,
				isSuspended: false,
				points: BigInt(8200),
				weeklyPoints: BigInt(1100),
			},
			{
				evmAddress: "0xdD2FD4581271e230360230F9337D5c0430Bf44C0",
				displayName: "Charlie DAO",
				avatarUrl: "https://i.pravatar.cc/150?img=33",
				twitterHandle: "charliedao",
				isVerified: true,
				isSuspended: false,
				adminRole: "admin" as const,
				points: BigInt(42000),
				weeklyPoints: BigInt(5000),
			},
		])
		.returning();
	console.log(`✅ Created ${insertedCreators.length} creators\n`);

	const alice = insertedCreators[0]!;
	const bob = insertedCreators[1]!;
	const charlie = insertedCreators[2]!;

	// === INVITE CODES ===
	console.log("🎟️  Creating invite code...");
	const insertedInvites = await db
		.insert(inviteCodes)
		.values({
			code: "WAIFU2026",
			maxUses: 50,
			usedCount: 3,
			createdBy: charlie.id,
			isActive: true,
		})
		.returning();
	const inviteCode = insertedInvites[0]!;
	console.log(`✅ Created invite code: ${inviteCode.code}\n`);

	// === LAUNCHES ===
	console.log("🚀 Creating launches...");
	const insertedLaunches = await db
		.insert(launches)
		.values([
			{
				creatorId: alice.id,
				inviteCodeId: inviteCode.id,
				tokenName: "WaifuAI",
				tokenTicker: "WAIFU",
				tokenImageUrl: "https://picsum.photos/seed/waifu/400/400",
				tokenDescription: "The first AI waifu companion token on BSC",
				chainId: 56,
				portalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
				quoteToken: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
				taxRate: 0,
				status: "confirmed" as const,
				txHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
				tokenAddress: "0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
				confirmedAt: new Date("2026-03-01T10:00:00Z"),
				submittedAt: new Date("2026-03-01T09:58:00Z"),
			},
			{
				creatorId: bob.id,
				inviteCodeId: inviteCode.id,
				tokenName: "Neural Network Token",
				tokenTicker: "NEURAL",
				tokenImageUrl: "https://picsum.photos/seed/neural/400/400",
				tokenDescription: "AI-powered trading signals and market analysis",
				chainId: 56,
				portalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
				taxRate: 5,
				status: "pending_review" as const,
			},
		])
		.returning();
	console.log(`✅ Created ${insertedLaunches.length} launches\n`);

	const waifuLaunch = insertedLaunches[0]!;

	// === TOKENS ===
	console.log("🪙 Creating tokens...");
	const insertedTokens = await db
		.insert(tokens)
		.values([
			{
				chainId: 56,
				contractAddress: "0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
				name: "WaifuAI",
				ticker: "WAIFU",
				imageUrl: "https://picsum.photos/seed/waifu/400/400",
				description: "The first AI waifu companion token on BSC",
				metadataUri: "ipfs://QmExample1234567890",
				socials: { twitter: "waifuai_token", telegram: "waifuai" },
				creatorAddress: alice.evmAddress!,
				creatorId: alice.id,
				launchId: waifuLaunch.id,
				launchPlatform: "flap",
				portalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
				decimals: 18,
				totalSupply: "1000000000000000000000000000",
				taxRate: 0,
				isTaxToken: false,
				curveProgress: "750000000000000000000000",
				curveLimit: "1000000000000000000000000",
				currentPrice: "0.000025",
				marketCapUsd: "25000",
				tokenPriceUsd: "0.000025",
				volume24h: "15000",
				priceChange24h: "12.5",
				holderCount: 247,
				status: "active" as const,
				isFeatured: true,
				isVerified: true,
				lastTradeAt: new Date("2026-03-07T20:00:00Z"),
				lastPriceUpdate: new Date("2026-03-07T20:00:00Z"),
			},
			{
				chainId: 56,
				contractAddress: "0xb2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1",
				name: "MoonBot",
				ticker: "MOON",
				imageUrl: "https://picsum.photos/seed/moonbot/400/400",
				description: "Automated moon mission trading bot",
				creatorAddress: bob.evmAddress!,
				creatorId: bob.id,
				launchPlatform: "flap",
				decimals: 18,
				totalSupply: "500000000000000000000000000",
				currentPrice: "0.000018",
				marketCapUsd: "9000",
				tokenPriceUsd: "0.000018",
				volume24h: "3200",
				holderCount: 89,
				status: "active" as const,
				lastTradeAt: new Date("2026-03-07T18:30:00Z"),
			},
			{
				chainId: 56,
				contractAddress: "0xc3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2",
				name: "DegenAI",
				ticker: "DEGEN",
				imageUrl: "https://picsum.photos/seed/degenai/400/400",
				description: "For the true degens",
				creatorAddress: charlie.evmAddress!,
				creatorId: charlie.id,
				launchPlatform: "flap",
				decimals: 18,
				totalSupply: "10000000000000000000000000000",
				currentPrice: "0.0000005",
				marketCapUsd: "5000",
				tokenPriceUsd: "0.0000005",
				volume24h: "8500",
				holderCount: 312,
				status: "active" as const,
				lastTradeAt: new Date("2026-03-07T21:15:00Z"),
			},
			{
				chainId: 56,
				contractAddress: "0xd4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3",
				name: "BasedBot",
				ticker: "BASED",
				imageUrl: "https://picsum.photos/seed/basedbot/400/400",
				description: "Based and AI-pilled",
				creatorAddress: alice.evmAddress!,
				creatorId: alice.id,
				launchPlatform: "flap",
				decimals: 18,
				totalSupply: "1000000000000000000000000000",
				dexPoolAddress: "0xpancakeswap123456789",
				migratedAt: new Date("2026-03-05T14:00:00Z"),
				currentPrice: "0.00015",
				marketCapUsd: "150000",
				tokenPriceUsd: "0.00015",
				volume24h: "45000",
				holderCount: 1203,
				status: "migrated" as const,
				isVerified: true,
				lastTradeAt: new Date("2026-03-07T21:40:00Z"),
			},
			{
				chainId: 56,
				contractAddress: "0xe5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4",
				name: "RektBot",
				ticker: "REKT",
				imageUrl: "https://picsum.photos/seed/rektbot/400/400",
				description: "Lessons from the trenches",
				creatorAddress: bob.evmAddress!,
				creatorId: bob.id,
				launchPlatform: "flap",
				decimals: 18,
				totalSupply: "1000000000000000000000000000",
				currentPrice: "0.000001",
				marketCapUsd: "1000",
				tokenPriceUsd: "0.000001",
				volume24h: "150",
				holderCount: 23,
				status: "active" as const,
				lastTradeAt: new Date("2026-03-06T08:20:00Z"),
			},
		])
		.returning();
	console.log(`✅ Created ${insertedTokens.length} tokens\n`);

	const waifuToken = insertedTokens[0]!;
	const moonToken = insertedTokens[1]!;

	// === EVENTS ===
	console.log("📊 Creating blockchain events...");
	const insertedEvents = await db
		.insert(events)
		.values([
			{
				chainId: 56,
				blockNumber: BigInt(45123456),
				txHash: "0xevent1234567890abcdef1234567890abcdef1234567890abcdef12345678",
				logIndex: 0,
				eventType: "TokenCreated" as const,
				portalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
				tokenAddress: waifuToken.contractAddress,
				actorAddress: alice.evmAddress!,
				payload: { tokenName: "WaifuAI", ticker: "WAIFU", creator: alice.evmAddress },
				blockTimestamp: new Date("2026-03-01T10:00:00Z"),
				processed: true,
			},
			{
				chainId: 56,
				blockNumber: BigInt(45123789),
				txHash: "0xevent2345678901bcdef2345678901bcdef2345678901bcdef23456789012b",
				logIndex: 1,
				eventType: "TokenBought" as const,
				portalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
				tokenAddress: waifuToken.contractAddress,
				actorAddress: "0x9999999999999999999999999999999999999999",
				payload: { amountIn: "100000000000000000", amountOut: "4000000000000000000000" },
				blockTimestamp: new Date("2026-03-01T12:30:00Z"),
				processed: true,
			},
			{
				chainId: 56,
				blockNumber: BigInt(45124012),
				txHash: "0xevent3456789012cdef3456789012cdef3456789012cdef34567890123456",
				logIndex: 0,
				eventType: "TokenSold" as const,
				portalAddress: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
				tokenAddress: waifuToken.contractAddress,
				actorAddress: "0x8888888888888888888888888888888888888888",
				payload: { amountIn: "1000000000000000000000", amountOut: "24000000000000000" },
				blockTimestamp: new Date("2026-03-02T08:15:00Z"),
				processed: true,
			},
		])
		.returning();
	console.log(`✅ Created ${insertedEvents.length} events\n`);

	// === TRADES ===
	console.log("💱 Creating trades...");
	const ev1 = insertedEvents[1]!;
	const ev2 = insertedEvents[2]!;

	const insertedTrades = await db
		.insert(trades)
		.values([
			{
				eventId: ev1.id,
				chainId: 56,
				tokenAddress: waifuToken.contractAddress,
				traderAddress: "0x9999999999999999999999999999999999999999",
				side: "buy" as const,
				amountIn: "100000000000000000",
				amountOut: "4000000000000000000000",
				price: "0.000025",
				usdValue: "60",
				txHash: "0xevent2345678901bcdef2345678901bcdef2345678901bcdef23456789012b",
				blockNumber: BigInt(45123789),
				blockTimestamp: new Date("2026-03-01T12:30:00Z"),
			},
			{
				eventId: ev1.id,
				chainId: 56,
				tokenAddress: waifuToken.contractAddress,
				traderAddress: "0x7777777777777777777777777777777777777777",
				side: "buy" as const,
				amountIn: "500000000000000000",
				amountOut: "19000000000000000000000",
				price: "0.0000263",
				usdValue: "300",
				txHash: "0xtrade123456789abcdef",
				blockNumber: BigInt(45123890),
				blockTimestamp: new Date("2026-03-01T14:00:00Z"),
			},
			{
				eventId: ev2.id,
				chainId: 56,
				tokenAddress: waifuToken.contractAddress,
				traderAddress: "0x8888888888888888888888888888888888888888",
				side: "sell" as const,
				amountIn: "1000000000000000000000",
				amountOut: "24000000000000000",
				price: "0.000024",
				usdValue: "14.4",
				txHash: "0xevent3456789012cdef3456789012cdef3456789012cdef34567890123456",
				blockNumber: BigInt(45124012),
				blockTimestamp: new Date("2026-03-02T08:15:00Z"),
			},
			{
				eventId: ev1.id,
				chainId: 56,
				tokenAddress: moonToken.contractAddress,
				traderAddress: bob.evmAddress!,
				side: "buy" as const,
				amountIn: "200000000000000000",
				amountOut: "11000000000000000000000",
				price: "0.0000182",
				usdValue: "120",
				txHash: "0xmoon1234567890abcdef",
				blockNumber: BigInt(45125000),
				blockTimestamp: new Date("2026-03-03T10:00:00Z"),
			},
			{
				eventId: ev1.id,
				chainId: 56,
				tokenAddress: moonToken.contractAddress,
				traderAddress: "0x6666666666666666666666666666666666666666",
				side: "buy" as const,
				amountIn: "50000000000000000",
				amountOut: "2750000000000000000000",
				price: "0.0000182",
				usdValue: "30",
				txHash: "0xmoon2345678901bcdef",
				blockNumber: BigInt(45125100),
				blockTimestamp: new Date("2026-03-03T11:30:00Z"),
			},
			{
				eventId: ev2.id,
				chainId: 56,
				tokenAddress: moonToken.contractAddress,
				traderAddress: "0x6666666666666666666666666666666666666666",
				side: "sell" as const,
				amountIn: "1000000000000000000000",
				amountOut: "17500000000000000",
				price: "0.0000175",
				usdValue: "10.5",
				txHash: "0xmoon3456789012cdef",
				blockNumber: BigInt(45126000),
				blockTimestamp: new Date("2026-03-04T09:00:00Z"),
			},
			{
				eventId: ev1.id,
				chainId: 56,
				tokenAddress: waifuToken.contractAddress,
				traderAddress: charlie.evmAddress!,
				side: "buy" as const,
				amountIn: "1000000000000000000",
				amountOut: "38000000000000000000000",
				price: "0.0000263",
				usdValue: "600",
				txHash: "0xwhale123456789abcdef",
				blockNumber: BigInt(45128000),
				blockTimestamp: new Date("2026-03-05T16:20:00Z"),
			},
			{
				eventId: ev1.id,
				chainId: 56,
				tokenAddress: waifuToken.contractAddress,
				traderAddress: "0x5555555555555555555555555555555555555555",
				side: "buy" as const,
				amountIn: "10000000000000000",
				amountOut: "380000000000000000000",
				price: "0.0000263",
				usdValue: "6",
				txHash: "0xsmol123456789abcdef",
				blockNumber: BigInt(45128100),
				blockTimestamp: new Date("2026-03-05T17:00:00Z"),
			},
			{
				eventId: ev1.id,
				chainId: 56,
				tokenAddress: moonToken.contractAddress,
				traderAddress: alice.evmAddress!,
				side: "buy" as const,
				amountIn: "100000000000000000",
				amountOut: "5500000000000000000000",
				price: "0.0000182",
				usdValue: "60",
				txHash: "0xcross123456789abcdef",
				blockNumber: BigInt(45129000),
				blockTimestamp: new Date("2026-03-06T10:45:00Z"),
			},
			{
				eventId: ev2.id,
				chainId: 56,
				tokenAddress: waifuToken.contractAddress,
				traderAddress: "0x4444444444444444444444444444444444444444",
				side: "sell" as const,
				amountIn: "5000000000000000000000",
				amountOut: "125000000000000000",
				price: "0.000025",
				usdValue: "75",
				txHash: "0xsell123456789abcdef",
				blockNumber: BigInt(45130000),
				blockTimestamp: new Date("2026-03-07T14:30:00Z"),
			},
		])
		.returning();
	console.log(`✅ Created ${insertedTrades.length} trades\n`);

	console.log("🎉 Seed complete!");
	console.log(
		`  ${insertedCreators.length} creators, ${insertedTokens.length} tokens, ${insertedLaunches.length} launches`,
	);
	console.log(`  ${insertedTrades.length} trades, ${insertedEvents.length} events, 1 invite code`);

	await client.end();
}

seed().catch((e) => {
	console.error("❌ Seed failed:", e);
	process.exit(1);
});
