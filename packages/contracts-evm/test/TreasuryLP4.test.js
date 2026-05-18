// Wave N: TreasuryLP4 - 4-tier reconfigured TreasuryLP, real PCS V3 NPM, 4-way split.
//
// Coverage:
//   - constructor wiring + immutables
//   - tick alignment + ordering + per-tier validation
//   - setFlapV2Pair one-shot setter + oracle bootstrap
//   - deployTier pool init + single-sided V3 mint
//   - claim() 4-way split math, WBNB unwrap, BnbClaimed event shape
//   - claimable() reads tokensOwed from NPM.positions
//   - admin: setBuybackBps respects bps sum cap

const { ethers, network } = require("hardhat");
const { strict: assert } = require("node:assert");

// PCS V3 1% fee tier on BSC has tickSpacing 200. The mock factory matches.
const TICK_SPACING = 200;

function tier(targetMcUSD, tickLower, tickUpper, minEpochs = 2) {
	return {
		targetMcUSD: BigInt(targetMcUSD),
		tokenAmount: ethers.parseEther("25000000"),
		tickLower,
		tickUpper,
		minEpochs,
		epochsAbove: 0,
		lastEpochTimestamp: 0,
		deployed: false,
		paused: false,
		positionId: 0,
	};
}

// Build a tick ladder: 4 non-overlapping ranges, all multiples of 200.
// We intentionally pick the ladder above 0 so token-is-token0 paths anchor
// the pool at tier 0 lower tick.
function defaultTiers() {
	const targets = [250000n, 1000000n, 5000000n, 25000000n];
	const mins = [2, 2, 3, 3];
	const tiers = [];
	for (let i = 0; i < 4; i++) {
		const tickLower = TICK_SPACING * (10 + i * 20); // 2000, 6000, 10000, 14000
		const tickUpper = tickLower + TICK_SPACING * 10; // +2000 each
		tiers.push(tier(targets[i] * 100000000n, tickLower, tickUpper, mins[i]));
	}
	return tiers;
}

async function latestTimestamp() {
	const block = await ethers.provider.getBlock("latest");
	return block.timestamp;
}

async function expectError(promise, errorName) {
	await assert.rejects(promise, (err) => String(err).includes(errorName));
}

async function increase(seconds) {
	await network.provider.send("evm_increaseTime", [seconds]);
	await network.provider.send("evm_mine");
}

async function readyOracle() {
	await increase(1800);
}

async function refreshFeed(feed) {
	await feed.setAnswer(600n * 100000000n);
}

async function advanceOneEpoch(treasury, feed) {
	await increase(Number(await treasury.epochLength()));
	await refreshFeed(feed);
	await treasury.checkAndAdvance();
	await increase(Number(await treasury.epochLength()));
	await refreshFeed(feed);
}

async function deployFixture(overrides = {}) {
	const [owner, agentSafe, platform, patron] = await ethers.getSigners();

	// Deploy WBNB-like mock first so we can choose token address ordering.
	const wbnb = await ethers.deployContract("MockWBNB");
	let token;
	let attempts = 0;
	const wantToken0 = overrides.tokenIsToken0 !== false;
	while (true) {
		token = await ethers.deployContract(overrides.tokenContract || "ERC20Mock");
		const tokenAddr = (await token.getAddress()).toLowerCase();
		const wbnbAddr = (await wbnb.getAddress()).toLowerCase();
		const isToken0 = tokenAddr < wbnbAddr;
		if (isToken0 === wantToken0) break;
		if (++attempts > 30) break;
	}
	await token.mint(owner.address, ethers.parseEther("1000000000"));

	const router = await ethers.deployContract("MockFlapV2Router", [await wbnb.getAddress()]);
	const pair = await ethers.deployContract("MockFlapV2Pair", [await token.getAddress(), await wbnb.getAddress()]);
	const feed = await ethers.deployContract("MockBnbUsdFeed", [600n * 100000000n]);
	if (overrides.feedDecimals !== undefined) {
		await feed.setDecimals(overrides.feedDecimals);
	}

	const v3Factory = await ethers.deployContract("MockV3Factory");
	const npm = await ethers.deployContract("MockNonfungiblePositionManager", [await wbnb.getAddress()]);
	if (overrides.lieAboutSpent) await npm.setLieAboutSpent(true);
	if (overrides.lieAboutWbnbSide) await npm.setLieAboutWbnbSide(true);

	const now = await latestTimestamp();
	await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("200"), Number(now));

	const tiers = overrides.tiers || defaultTiers();
	const args = {
		token: await token.getAddress(),
		flapV2Router: await router.getAddress(),
		wbnb: await wbnb.getAddress(),
		v3Npm: await npm.getAddress(),
		v3Factory: await v3Factory.getAddress(),
		agentSafe: agentSafe.address,
		platformReceiver: platform.address,
		patronReceiver: patron.address,
		bnbUsdFeed: await feed.getAddress(),
		buybackBps: overrides.buybackBps ?? 1000,
		platformBps: overrides.platformBps ?? 500,
		patronBps: overrides.patronBps ?? 2000,
		v3Fee: 10000,
		tiers,
	};

	const treasury = await ethers.deployContract("TreasuryLP4", [args]);

	return { owner, agentSafe, platform, patron, token, wbnb, router, pair, feed, npm, v3Factory, treasury, tiers, args };
}

async function setupPair(ctx) {
	await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());
}

describe("TreasuryLP4 :: Wave N", () => {
	it("deploys with exactly 4 tiers and exposes immutables", async () => {
		const ctx = await deployFixture();
		assert.equal(await ctx.treasury.v3Fee(), 10000n);
		assert.equal(await ctx.treasury.v3TickSpacing(), BigInt(TICK_SPACING));
		assert.equal(await ctx.treasury.buybackBps(), 1000n);
		assert.equal(await ctx.treasury.platformBps(), 500n);
		assert.equal(await ctx.treasury.patronBps(), 2000n);
		assert.equal(await ctx.treasury.tokenIsToken0(), true);
		const t3 = await ctx.treasury.tiers(3);
		assert.equal(t3.minEpochs, 3n);
	});

	it("rejects access to tier 4 (out of bounds)", async () => {
		const { treasury } = await deployFixture();
		await assert.rejects(treasury.tiers(4));
	});

	it("sum of tier amounts is 100M (10% of supply)", async () => {
		const { treasury } = await deployFixture();
		let sum = 0n;
		for (let i = 0; i < 4; i++) {
			const t = await treasury.tiers(i);
			sum += t.tokenAmount;
		}
		assert.equal(sum, ethers.parseEther("100000000"));
	});

	it("rejects tier schedules above the 100M treasury allocation", async () => {
		const ctx = await deployFixture();
		const tiers = defaultTiers();
		tiers[0].tokenAmount = ethers.parseEther("25000001");
		const args = { ...ctx.args, tiers };
		await expectError(ethers.deployContract("TreasuryLP4", [args]), "bad_tier");
	});

	it("rejects ticks not aligned to v3 spacing (200)", async () => {
		const ctx = await deployFixture();
		const tiers = defaultTiers();
		tiers[1].tickLower = tiers[1].tickLower + 60; // not aligned to 200
		const args = { ...ctx.args, tiers };
		await expectError(ethers.deployContract("TreasuryLP4", [args]), "bad_tier");
	});

	it("rejects overlapping tier ranges", async () => {
		const ctx = await deployFixture();
		const tiers = defaultTiers();
		tiers[1].tickLower = tiers[0].tickLower; // overlap with tier 0
		const args = { ...ctx.args, tiers };
		await expectError(ethers.deployContract("TreasuryLP4", [args]), "bad_tier");
	});

	it("rejects bad bps sum (>= 10000)", async () => {
		const ctx = await deployFixture();
		await expectError(
			ethers.deployContract("TreasuryLP4", [
				{ ...ctx.args, buybackBps: 1500, platformBps: 4000, patronBps: 4500 },
			]),
			"bad_bps_sum",
		);
	});

	it("rejects unknown fee tier", async () => {
		const ctx = await deployFixture();
		await expectError(ethers.deployContract("TreasuryLP4", [{ ...ctx.args, v3Fee: 7777 }]), "bad_fee_tier");
	});

	it("rejects non-8-decimal BNB/USD feeds", async () => {
		await expectError(deployFixture({ feedDecimals: 18 }), "bad_feed_decimals");
	});

	it("nextTierIndex starts at 0", async () => {
		const { treasury } = await deployFixture();
		assert.equal(await ctx_or(treasury).nextTierIndex(), 0n);
	});

	it("oraclePoke reverts before setFlapV2Pair", async () => {
		const { treasury } = await deployFixture();
		await expectError(treasury.oraclePoke(), "pair_not_set");
	});

	it("checkAndAdvance reverts before setFlapV2Pair", async () => {
		const { treasury } = await deployFixture();
		await expectError(treasury.checkAndAdvance(), "pair_not_set");
	});

	it("setFlapV2Pair is one-shot and owner-only", async () => {
		const ctx = await deployFixture();
		const { treasury, pair, agentSafe } = ctx;
		await expectError(treasury.connect(agentSafe).setFlapV2Pair(await pair.getAddress()), "");
		await treasury.connect(ctx.owner).setFlapV2Pair(await pair.getAddress());
		await expectError(treasury.connect(ctx.owner).setFlapV2Pair(await pair.getAddress()), "pair_already_set");
	});

	it("setFlapV2Pair rejects pair with wrong tokens", async () => {
		const ctx = await deployFixture();
		const otherToken = await ethers.deployContract("ERC20Mock");
		const badPair = await ethers.deployContract("MockFlapV2Pair", [await otherToken.getAddress(), await ctx.wbnb.getAddress()]);
		await expectError(ctx.treasury.connect(ctx.owner).setFlapV2Pair(await badPair.getAddress()), "bad_pair");
	});

	it("deployTier(0) initializes V3 pool + mints single-sided position", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployFixture({ tiers });
		const { token, treasury, npm, feed } = ctx;
		await setupPair(ctx);
		await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await advanceOneEpoch(treasury, feed);

		assert.equal(await treasury.nextTierIndex(), 1n);
		const t0 = await treasury.tiers(0);
		assert.equal(t0.deployed, true);
		assert.equal(t0.positionId, 1n);

		// V3 pool must have been recorded.
		const pool = await treasury.v3Pool();
		assert.notEqual(pool, ethers.ZeroAddress);

		// NPM should have pulled exactly 25M tokens for this tier.
		const npmTokenBalance = await token.balanceOf(await npm.getAddress());
		assert.equal(npmTokenBalance, ethers.parseEther("25000000"));
	});

	it("rejects mock that lies about WBNB-side amount in mint", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployFixture({ tiers, lieAboutWbnbSide: true });
		const { token, treasury, feed } = ctx;
		await setupPair(ctx);
		await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await increase(Number(await treasury.epochLength()));
		await refreshFeed(feed);

		await expectError(treasury.checkAndAdvance(), "bad_tier");
	});

	it("rejects mock that lies about spent amount in mint (FoT-like)", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployFixture({ tiers, lieAboutSpent: true });
		const { token, treasury, feed } = ctx;
		await setupPair(ctx);
		await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await increase(Number(await treasury.epochLength()));
		await refreshFeed(feed);

		await expectError(treasury.checkAndAdvance(), "bad_tier");
	});

	it("claim forwards token-side V3 fees to the agentSafe", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployFixture({ tiers });
		const { agentSafe, token, feed, npm, treasury } = ctx;
		await setupPair(ctx);
		await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await advanceOneEpoch(treasury, feed);
		assert.equal(await treasury.nextTierIndex(), 1n);
		await npm.creditTokenOwed(1n, await token.getAddress(), ethers.parseEther("77"));

		await treasury.connect(agentSafe).claim();

		assert.equal(await token.balanceOf(agentSafe.address), ethers.parseEther("77"));
	});

	it("claim 4-way split: 10% buyback / 5% platform / 20% patron / 65% agent", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployFixture({ tiers });
		const { agentSafe, platform, patron, token, feed, npm, treasury } = ctx;
		await setupPair(ctx);
		await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));
		// Pre-mint buyback output token supply so the V2 mock can pay it out.
		await token.mint(await ctx.router.getAddress(), 0);
		await readyOracle();
		await advanceOneEpoch(treasury, feed);

		// Credit WBNB fees to position 1 = 10 BNB.
		const collected = ethers.parseEther("10");
		await npm.creditWbnbOwed(1n, collected, { value: collected });

		const platformBefore = await ethers.provider.getBalance(platform.address);
		const patronBefore = await ethers.provider.getBalance(patron.address);
		const agentBefore = await ethers.provider.getBalance(agentSafe.address);
		const deadBefore = await token.balanceOf("0x000000000000000000000000000000000000dEaD");

		const tx = await treasury.connect(agentSafe).claim();
		const rcpt = await tx.wait();
		const gas = rcpt.gasUsed * rcpt.gasPrice;

		const expectedBuyback = (collected * 1000n) / 10000n;
		const expectedPlatform = (collected * 500n) / 10000n;
		const expectedPatron = (collected * 2000n) / 10000n;
		const expectedAgent = collected - expectedBuyback - expectedPlatform - expectedPatron;

		assert.equal((await ethers.provider.getBalance(platform.address)) - platformBefore, expectedPlatform);
		assert.equal((await ethers.provider.getBalance(patron.address)) - patronBefore, expectedPatron);
		assert.equal((await ethers.provider.getBalance(agentSafe.address)) - agentBefore + gas, expectedAgent);

		// Buyback burned tokens to DEAD via the V2 mock (rate=1000 by default).
		assert.equal(
			(await token.balanceOf("0x000000000000000000000000000000000000dEaD")) - deadBefore,
			expectedBuyback * 1000n,
		);
	});

	it("claim emits BnbClaimed with all 4 amounts", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployFixture({ tiers });
		const { agentSafe, token, feed, npm, treasury } = ctx;
		await setupPair(ctx);
		await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await advanceOneEpoch(treasury, feed);

		const collected = ethers.parseEther("10");
		await npm.creditWbnbOwed(1n, collected, { value: collected });

		const tx = await treasury.connect(agentSafe).claim();
		const rcpt = await tx.wait();
		const ev = rcpt.logs
			.map((l) => {
				try { return treasury.interface.parseLog(l); } catch { return null; }
			})
			.find((e) => e && e.name === "BnbClaimed");
		assert.ok(ev, "BnbClaimed event missing");
		assert.equal(ev.args.bnbBuyback, ethers.parseEther("1"));
		assert.equal(ev.args.bnbPlatform, ethers.parseEther("0.5"));
		assert.equal(ev.args.bnbPatron, ethers.parseEther("2"));
		assert.equal(ev.args.bnbToAgent, ethers.parseEther("6.5"));
	});

	it("claimable() reads tokensOwed from NPM.positions per tier", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployFixture({ tiers });
		const { token, feed, npm, treasury } = ctx;
		await setupPair(ctx);
		await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await advanceOneEpoch(treasury, feed);

		// Set tokensOwed1 (WBNB side because token is token0) = 42.
		const owed = ethers.parseEther("42");
		await npm.setTokensOwed(1n, 0, owed);

		const [total, perTier] = await treasury.claimable();
		assert.equal(total, owed);
		assert.equal(perTier[0], owed);
		assert.equal(perTier[1], 0n);
	});

	it("claim() reverts if no tiers deployed", async () => {
		const ctx = await deployFixture();
		await setupPair(ctx);
		await expectError(ctx.treasury.connect(ctx.agentSafe).claim(), "no_tiers_deployed");
	});

	it("claim() reverts if called by non-safe", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployFixture({ tiers });
		await setupPair(ctx);
		await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await advanceOneEpoch(ctx.treasury, ctx.feed);
		await expectError(ctx.treasury.connect(ctx.owner).claim(), "only_agent_safe");
	});

	it("setBuybackBps respects BUYBACK_BPS_MAX cap", async () => {
		const ctx = await deployFixture();
		await expectError(ctx.treasury.connect(ctx.owner).setBuybackBps(1501n), "bad_buyback_bps");
		await ctx.treasury.connect(ctx.owner).setBuybackBps(1500n);
		assert.equal(await ctx.treasury.buybackBps(), 1500n);
	});


	it("uses live token supply in market-cap math", async () => {
		const ctx = await deployFixture();
		await setupPair(ctx);
		await readyOracle();
		await refreshFeed(ctx.feed);
		const beforeMintMc = await ctx.treasury.currentMcUSD();
		await ctx.token.mint(ethers.Wallet.createRandom().address, ethers.parseEther("1000000000"));
		const afterMintMc = await ctx.treasury.currentMcUSD();
		assert.ok(afterMintMc >= beforeMintMc * 2n);
		assert.ok(afterMintMc <= beforeMintMc * 2n + 2n);
	});
});

// Tiny helper so the `nextTierIndex` test reads better.
function ctx_or(t) { return t; }
