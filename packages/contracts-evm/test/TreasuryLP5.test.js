// Wave O: TreasuryLP5 - v3-tick-gated LP, no oracle, no MC, no epochs.
//
// Happy-path coverage (mirrors TreasuryLP4.test.js):
//   - constructor wiring + immutables
//   - tier-array validation (sum cap, tick ordering, alignment)
//   - setFlapV2Pair: one-shot, owner-only, validates pair tokens
//   - setFlapV2Pair mints all 4 positions in same tx (TierDeployed x4)
//   - claim() 4-way split: 10/5/20/65 buyback/platform/patron/agent
//   - claim() reverts pre-init and from non-safe caller
//   - setBuybackBps respects the BUYBACK_BPS_MAX cap

const { ethers } = require("hardhat");
const { strict: assert } = require("node:assert");

const TICK_SPACING = 200;
const MAX_TICK_PCS_V3_1PCT = 887200;

function tier(tickLower, tickUpper) {
	return {
		tokenAmount: ethers.parseEther("25000000"),
		tickLower,
		tickUpper,
		deployed: false,
		paused: false,
		positionId: 0,
	};
}

// 4 ranges above tick 0, well clear of the launch tick implied by the V2
// reserves we seed in the fixture (~ -154000 for 200 BNB vs 1B token).
function defaultTiers() {
	const tiers = [];
	for (let i = 0; i < 4; i++) {
		const tickLower = TICK_SPACING * (10 + i * 20); // 2000, 6000, 10000, 14000
		const tickUpper = tickLower + TICK_SPACING * 10; // +2000 each
		tiers.push(tier(tickLower, tickUpper));
	}
	return tiers;
}

async function expectError(promise, errorName) {
	await assert.rejects(promise, (err) => String(err).includes(errorName));
}

async function deployFixture(overrides = {}) {
	const [owner, agentSafe, platform, patron] = await ethers.getSigners();

	let wbnb;
	let token;
	const wantToken0 = overrides.tokenIsToken0 !== false;
	// Deploy WBNB + token until we get the desired ordering. Retry both sides
	// so we never bail out with the wrong ordering (which would break the V2
	// reserve seeding below).
	let attempts = 0;
	while (true) {
		wbnb = await ethers.deployContract("MockWBNB");
		token = await ethers.deployContract(overrides.tokenContract || "ERC20Mock");
		const tokenAddr = (await token.getAddress()).toLowerCase();
		const wbnbAddr = (await wbnb.getAddress()).toLowerCase();
		const isToken0 = tokenAddr < wbnbAddr;
		if (isToken0 === wantToken0) break;
		if (++attempts > 60) throw new Error("could not produce desired token ordering");
	}
	await token.mint(owner.address, ethers.parseEther("1000000000"));

	const router = await ethers.deployContract("MockFlapV2Router", [await wbnb.getAddress()]);
	const pair = await ethers.deployContract("MockFlapV2Pair", [await token.getAddress(), await wbnb.getAddress()]);

	const v3Factory = await ethers.deployContract("MockV3Factory");
	const npm = await ethers.deployContract("MockNonfungiblePositionManager", [await wbnb.getAddress()]);

	// Seed V2 reserves: 1B tokens (token0), 200 BNB (token1). Implies tick
	// ~ log_{1.0001}(200 / 1e9) = ln(2e-7)/ln(1.0001) ~ -154,400. Floored to
	// the nearest tick spacing of 200 gives ~ -154,400 also. All default
	// tier ranges (2000..16000) sit strictly above this, so the OOR-below
	// check passes for the (token0 = token) case.
	const block = await ethers.provider.getBlock("latest");
	await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("200"), Number(block.timestamp));

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
		buybackBps: overrides.buybackBps ?? 1000,
		platformBps: overrides.platformBps ?? 500,
		patronBps: overrides.patronBps ?? 2000,
		v3Fee: 10000,
		tiers,
	};

	const treasury = await ethers.deployContract("TreasuryLP5", [args]);

	return { owner, agentSafe, platform, patron, token, wbnb, router, pair, npm, v3Factory, treasury, tiers, args };
}

async function seedAndInit(ctx) {
	// LP5 mints all 4 positions in setFlapV2Pair, so it needs the full
	// 100M treasury allocation already in the contract before init.
	await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
	await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());
}

describe("TreasuryLP5 :: Wave O happy-path", () => {
	it("deploys with exactly 4 tiers and exposes immutables", async () => {
		const ctx = await deployFixture();
		assert.equal(await ctx.treasury.v3Fee(), 10000n);
		assert.equal(await ctx.treasury.v3TickSpacing(), BigInt(TICK_SPACING));
		assert.equal(await ctx.treasury.buybackBps(), 1000n);
		assert.equal(await ctx.treasury.platformBps(), 500n);
		assert.equal(await ctx.treasury.patronBps(), 2000n);
		assert.equal(await ctx.treasury.tokenIsToken0(), true);
		assert.equal(await ctx.treasury.initialized(), false);
		// Per-tier defaults
		for (let i = 0; i < 4; i++) {
			const t = await ctx.treasury.tiers(i);
			assert.equal(t.tokenAmount, ethers.parseEther("25000000"));
			assert.equal(t.deployed, false);
			assert.equal(t.paused, false);
			assert.equal(t.positionId, 0n);
		}
	});

	it("rejects access to tier 4 (out of bounds)", async () => {
		const { treasury } = await deployFixture();
		await assert.rejects(treasury.tiers(4));
	});

	it("sum of tier amounts is 100M (the treasury allocation cap)", async () => {
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
		await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");
	});

	it("rejects tokenAmount == 0", async () => {
		const ctx = await deployFixture();
		const tiers = defaultTiers();
		tiers[2].tokenAmount = 0n;
		await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");
	});

	it("rejects tickLower >= tickUpper", async () => {
		const ctx = await deployFixture();
		const tiers = defaultTiers();
		tiers[1].tickLower = tiers[1].tickUpper;
		await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");
	});

	it("rejects ticks not aligned to v3TickSpacing", async () => {
		const ctx = await deployFixture();
		const tiers = defaultTiers();
		tiers[1].tickLower = tiers[1].tickLower + 60;
		await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");

		const tiers2 = defaultTiers();
		tiers2[1].tickUpper = tiers2[1].tickUpper + 60;
		await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers: tiers2 }]), "bad_tier");
	});

	it("rejects tickUpper > MAX_TICK_PCS_V3_1PCT", async () => {
		const ctx = await deployFixture();
		const tiers = defaultTiers();
		tiers[3].tickUpper = MAX_TICK_PCS_V3_1PCT + TICK_SPACING;
		await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");
	});

	it("accepts upper == MAX_TICK_PCS_V3_1PCT", async () => {
		const ctx = await deployFixture();
		const tiers = defaultTiers();
		for (const t of tiers) t.tickUpper = MAX_TICK_PCS_V3_1PCT;
		const treasury = await ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]);
		for (let i = 0; i < 4; i++) {
			assert.equal((await treasury.tiers(i)).tickUpper, BigInt(MAX_TICK_PCS_V3_1PCT));
		}
	});

	it("rejects bad bps sum (>= 10000)", async () => {
		const ctx = await deployFixture();
		await expectError(
			ethers.deployContract("TreasuryLP5", [{ ...ctx.args, buybackBps: 1500, platformBps: 4000, patronBps: 4500 }]),
			"bad_bps_sum",
		);
	});

	it("rejects unknown fee tier", async () => {
		const ctx = await deployFixture();
		await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, v3Fee: 7777 }]), "bad_fee_tier");
	});

	it("rejects tiers with pre-set deployed / paused / positionId", async () => {
		const ctx = await deployFixture();
		const tiers = defaultTiers();
		tiers[0].deployed = true;
		await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");

		const tiers2 = defaultTiers();
		tiers2[0].positionId = 1n;
		await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers: tiers2 }]), "bad_tier");
	});

	it("setFlapV2Pair is one-shot and owner-only", async () => {
		const ctx = await deployFixture();
		await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
		await expectError(ctx.treasury.connect(ctx.agentSafe).setFlapV2Pair(await ctx.pair.getAddress()), "");
		await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());
		await expectError(ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress()), "pair_already_set");
	});

	it("setFlapV2Pair rejects pair with wrong tokens", async () => {
		const ctx = await deployFixture();
		await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
		const otherToken = await ethers.deployContract("ERC20Mock");
		const badPair = await ethers.deployContract("MockFlapV2Pair", [
			await otherToken.getAddress(),
			await ctx.wbnb.getAddress(),
		]);
		await expectError(ctx.treasury.connect(ctx.owner).setFlapV2Pair(await badPair.getAddress()), "bad_pair");
	});

	it("setFlapV2Pair mints all 4 positions in same tx (TierDeployed x4)", async () => {
		const ctx = await deployFixture();
		await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));

		const tx = await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());
		const rcpt = await tx.wait();
		const tierDeployedEvents = rcpt.logs
			.map((l) => {
				try {
					return ctx.treasury.interface.parseLog(l);
				} catch {
					return null;
				}
			})
			.filter((e) => e && e.name === "TierDeployed");
		assert.equal(tierDeployedEvents.length, 4, "expected 4 TierDeployed events");

		// V3 pool address recorded.
		assert.notEqual(await ctx.treasury.v3Pool(), ethers.ZeroAddress);
		assert.equal(await ctx.treasury.initialized(), true);

		// All 4 tiers deployed with positionId set.
		for (let i = 0; i < 4; i++) {
			const t = await ctx.treasury.tiers(i);
			assert.equal(t.deployed, true, `tier ${i} not deployed`);
			assert.ok(t.positionId > 0n, `tier ${i} positionId == 0`);
		}

		// NPM should hold the full 100M token allocation (sum of all 4 mints).
		assert.equal(await ctx.token.balanceOf(await ctx.npm.getAddress()), ethers.parseEther("100000000"));
	});

	it("setFlapV2Pair emits V3PoolInitialized with the rounded launch tick", async () => {
		const ctx = await deployFixture();
		await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));

		const tx = await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());
		const rcpt = await tx.wait();
		const poolInit = rcpt.logs
			.map((l) => {
				try {
					return ctx.treasury.interface.parseLog(l);
				} catch {
					return null;
				}
			})
			.find((e) => e && e.name === "V3PoolInitialized");
		assert.ok(poolInit, "V3PoolInitialized event missing");
		// rounded tick must be a multiple of spacing
		assert.equal(Math.abs(Number(poolInit.args.tickAtInit)) % TICK_SPACING, 0);
		// must equal the stored launchTick (compare via Number to avoid BigInt
		// signed-zero quirks).
		assert.equal(Number(poolInit.args.tickAtInit), Number(await ctx.treasury.launchTick()));
	});

	it("setFlapV2Pair reverts when launch tick is not strictly below tier range (token0 case)", async () => {
		// Build a tier whose tickLower is BELOW the implied launch tick.
		// With 1B tokens vs 200 BNB the implied tick is around -154,400, so a
		// tier starting at -200,000 is below the launch and should fail OOR.
		const tiers = defaultTiers();
		tiers[0].tickLower = -200_000;
		tiers[0].tickUpper = -180_000;
		const ctx = await deployFixture({ tiers });
		await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
		await expectError(ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress()), "tier_not_oor");
	});

	it("claim() reverts before initialization", async () => {
		const ctx = await deployFixture();
		await expectError(ctx.treasury.connect(ctx.agentSafe).claim(), "not_initialized");
	});

	it("claim() reverts if called by non-safe", async () => {
		const ctx = await deployFixture();
		await seedAndInit(ctx);
		await expectError(ctx.treasury.connect(ctx.owner).claim(), "only_agent_safe");
	});

	it("claim() forwards token-side V3 fees to the agentSafe", async () => {
		const ctx = await deployFixture();
		await seedAndInit(ctx);
		// Credit token-side owed on tier 0's position.
		const tier0 = await ctx.treasury.tiers(0);
		await ctx.npm.creditTokenOwed(tier0.positionId, await ctx.token.getAddress(), ethers.parseEther("77"));
		await ctx.treasury.connect(ctx.agentSafe).claim();
		assert.equal(await ctx.token.balanceOf(ctx.agentSafe.address), ethers.parseEther("77"));
	});

	it("claim() 4-way split: 10% buyback / 5% platform / 20% patron / 65% agent", async () => {
		const ctx = await deployFixture();
		await seedAndInit(ctx);

		// Pre-mint zero into router (mocks signature compatibility).
		await ctx.token.mint(await ctx.router.getAddress(), 0);
		const tier0 = await ctx.treasury.tiers(0);
		const collected = ethers.parseEther("10");
		await ctx.npm.creditWbnbOwed(tier0.positionId, collected, { value: collected });

		const platformBefore = await ethers.provider.getBalance(ctx.platform.address);
		const patronBefore = await ethers.provider.getBalance(ctx.patron.address);
		const agentBefore = await ethers.provider.getBalance(ctx.agentSafe.address);
		const deadBefore = await ctx.token.balanceOf("0x000000000000000000000000000000000000dEaD");

		const tx = await ctx.treasury.connect(ctx.agentSafe).claim();
		const rcpt = await tx.wait();
		const gas = rcpt.gasUsed * rcpt.gasPrice;

		const expectedBuyback = (collected * 1000n) / 10000n;
		const expectedPlatform = (collected * 500n) / 10000n;
		const expectedPatron = (collected * 2000n) / 10000n;
		const expectedAgent = collected - expectedBuyback - expectedPlatform - expectedPatron;

		assert.equal((await ethers.provider.getBalance(ctx.platform.address)) - platformBefore, expectedPlatform);
		assert.equal((await ethers.provider.getBalance(ctx.patron.address)) - patronBefore, expectedPatron);
		assert.equal((await ethers.provider.getBalance(ctx.agentSafe.address)) - agentBefore + gas, expectedAgent);
		// Buyback burned tokens to DEAD via the V2 mock (rate = 1000 by default).
		assert.equal(
			(await ctx.token.balanceOf("0x000000000000000000000000000000000000dEaD")) - deadBefore,
			expectedBuyback * 1000n,
		);
	});

	it("claim() emits BnbClaimed with all 4 amounts", async () => {
		const ctx = await deployFixture();
		await seedAndInit(ctx);
		const tier0 = await ctx.treasury.tiers(0);
		const collected = ethers.parseEther("10");
		await ctx.npm.creditWbnbOwed(tier0.positionId, collected, { value: collected });

		const tx = await ctx.treasury.connect(ctx.agentSafe).claim();
		const rcpt = await tx.wait();
		const ev = rcpt.logs
			.map((l) => {
				try {
					return ctx.treasury.interface.parseLog(l);
				} catch {
					return null;
				}
			})
			.find((e) => e && e.name === "BnbClaimed");
		assert.ok(ev, "BnbClaimed event missing");
		assert.equal(ev.args.bnbBuyback, ethers.parseEther("1"));
		assert.equal(ev.args.bnbPlatform, ethers.parseEther("0.5"));
		assert.equal(ev.args.bnbPatron, ethers.parseEther("2"));
		assert.equal(ev.args.bnbToAgent, ethers.parseEther("6.5"));
	});

	it("claimable() reads tokensOwed from NPM.positions per tier", async () => {
		const ctx = await deployFixture();
		await seedAndInit(ctx);
		const tier0 = await ctx.treasury.tiers(0);
		const tokenIsToken0 = await ctx.treasury.tokenIsToken0();
		const owed = ethers.parseEther("42");
		const owed0 = tokenIsToken0 ? 0n : owed;
		const owed1 = tokenIsToken0 ? owed : 0n;
		await ctx.npm.setTokensOwed(tier0.positionId, owed0, owed1);

		const [total, perTier] = await ctx.treasury.claimable();
		assert.equal(total, owed);
		assert.equal(perTier[0], owed);
		assert.equal(perTier[1], 0n);
	});

	it("pauseTier skips minting at init time", async () => {
		const ctx = await deployFixture();
		await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
		// Pause tier 2 before init.
		await ctx.treasury.connect(ctx.owner).pauseTier(2);
		await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());

		const t2 = await ctx.treasury.tiers(2);
		assert.equal(t2.paused, true);
		assert.equal(t2.deployed, false);
		assert.equal(t2.positionId, 0n);

		// Other tiers minted normally.
		for (const i of [0, 1, 3]) {
			const t = await ctx.treasury.tiers(i);
			assert.equal(t.deployed, true);
			assert.ok(t.positionId > 0n);
		}
	});

	it("pauseTier reverts after initialization", async () => {
		const ctx = await deployFixture();
		await seedAndInit(ctx);
		await expectError(ctx.treasury.connect(ctx.owner).pauseTier(2), "pair_already_set");
	});

	it("setBuybackBps respects BUYBACK_BPS_MAX cap", async () => {
		const ctx = await deployFixture();
		await expectError(ctx.treasury.connect(ctx.owner).setBuybackBps(1501n), "bad_buyback_bps");
		await ctx.treasury.connect(ctx.owner).setBuybackBps(1500n);
		assert.equal(await ctx.treasury.buybackBps(), 1500n);
	});

	it("recordManagedToken accepts the managed token and rejects others", async () => {
		const ctx = await deployFixture();
		await ctx.treasury.recordManagedToken(await ctx.token.getAddress());
		const otherToken = await ethers.deployContract("ERC20Mock");
		await expectError(ctx.treasury.recordManagedToken(await otherToken.getAddress()), "bad_pair");
	});
});
