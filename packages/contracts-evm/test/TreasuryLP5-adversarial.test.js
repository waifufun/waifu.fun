// Wave O: TreasuryLP5 adversarial / edge-case test matrix.
//
// Companion to test/TreasuryLP5.test.js (happy paths). Hardens every attack
// surface we can reach with unit-level mocks. Real-fork flash-loan / V3-pool-
// crossing dynamics live in test/integration/ (out of scope here).
//
// Coverage:
//   - Pair wiring attacks (1-4)
//   - Tier configuration attacks at constructor time (5-10)
//   - Mint-time attacks (lying NPM, FoT-like undershoot, pre-init pool) (11-13)
//   - Claim-time attacks (non-safe, reentrancy, pre-init, zero collect) (14-17)
//   - Buyback / split math attacks (18-19)
//   - Price-trajectory / flash-loan simulation (20)

const { ethers } = require("hardhat");
const { strict: assert } = require("node:assert");

const TICK_SPACING = 200;
const MAX_TICK_PCS_V3_1PCT = 887200;

function tier(tickLower, tickUpper, tokenAmount = ethers.parseEther("25000000")) {
	return {
		tokenAmount,
		tickLower,
		tickUpper,
		deployed: false,
		paused: false,
		positionId: 0,
	};
}

function defaultTiers() {
	const tiers = [];
	for (let i = 0; i < 4; i++) {
		const tickLower = TICK_SPACING * (10 + i * 20);
		const tickUpper = tickLower + TICK_SPACING * 10;
		tiers.push(tier(tickLower, tickUpper));
	}
	return tiers;
}

async function expectError(promise, errorName) {
	await assert.rejects(promise, (err) => String(err).includes(errorName));
}

async function deployFixture(overrides = {}) {
	const [owner, agentSafe, platform, patron, attacker] = await ethers.getSigners();

	let wbnb;
	let token;
	const wantToken0 = overrides.tokenIsToken0 !== false;
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
	const npm = overrides.npm || (await ethers.deployContract("MockNonfungiblePositionManager", [await wbnb.getAddress()]));

	const block = await ethers.provider.getBlock("latest");
	await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("200"), Number(block.timestamp));

	const tiers = overrides.tiers || defaultTiers();
	const args = {
		token: await token.getAddress(),
		flapV2Router: await router.getAddress(),
		wbnb: await wbnb.getAddress(),
		v3Npm: await npm.getAddress(),
		v3Factory: await v3Factory.getAddress(),
		agentSafe: overrides.agentSafe || agentSafe.address,
		platformReceiver: platform.address,
		patronReceiver: patron.address,
		buybackBps: overrides.buybackBps ?? 1000,
		platformBps: overrides.platformBps ?? 500,
		patronBps: overrides.patronBps ?? 2000,
		v3Fee: 10000,
		tiers,
	};

	const treasury = await ethers.deployContract("TreasuryLP5", [args]);

	return {
		owner,
		agentSafe,
		platform,
		patron,
		attacker,
		token,
		wbnb,
		router,
		pair,
		npm,
		v3Factory,
		treasury,
		tiers,
		args,
	};
}

async function seedAndInit(ctx) {
	await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
	await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());
}

describe("TreasuryLP5 :: adversarial", () => {
	describe("pair-wiring attacks", () => {
		it("#1 setFlapV2Pair reverts on a pair whose tokens don't match (token side wrong)", async () => {
			const ctx = await deployFixture();
			await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
			const otherToken = await ethers.deployContract("ERC20Mock");
			const badPair = await ethers.deployContract("MockFlapV2Pair", [
				await otherToken.getAddress(),
				await ctx.wbnb.getAddress(),
			]);
			await expectError(ctx.treasury.connect(ctx.owner).setFlapV2Pair(await badPair.getAddress()), "bad_pair");
		});

		it("#1b setFlapV2Pair reverts on a pair (token, randomToken) -- WBNB side wrong", async () => {
			const ctx = await deployFixture();
			await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
			const otherToken = await ethers.deployContract("ERC20Mock");
			const badPair = await ethers.deployContract("MockFlapV2Pair", [
				await ctx.token.getAddress(),
				await otherToken.getAddress(),
			]);
			await expectError(ctx.treasury.connect(ctx.owner).setFlapV2Pair(await badPair.getAddress()), "bad_pair");
		});

		it("#2 setFlapV2Pair reverts on second call with pair_already_set", async () => {
			const ctx = await deployFixture();
			await seedAndInit(ctx);
			await expectError(
				ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress()),
				"pair_already_set",
			);
		});

		it("#3 setFlapV2Pair(address(0)) reverts with zero_address", async () => {
			const ctx = await deployFixture();
			await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
			await expectError(ctx.treasury.connect(ctx.owner).setFlapV2Pair(ethers.ZeroAddress), "zero_address");
		});

		it("#4 non-owner cannot call setFlapV2Pair", async () => {
			const ctx = await deployFixture();
			await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
			await assert.rejects(
				ctx.treasury.connect(ctx.attacker).setFlapV2Pair(await ctx.pair.getAddress()),
				(err) =>
					String(err).includes("OwnableUnauthorizedAccount") ||
					String(err).includes("Ownable: caller is not the owner") ||
					String(err).includes("OwnableInvalidOwner"),
			);
		});
	});

	describe("tier configuration attacks", () => {
		it("#5 tokenAmount == 0 on any tier reverts with bad_tier", async () => {
			const ctx = await deployFixture();
			for (let idx = 0; idx < 4; idx++) {
				const tiers = defaultTiers();
				tiers[idx].tokenAmount = 0n;
				await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");
			}
		});

		it("#6 tickLower >= tickUpper reverts with bad_tier (both == and >)", async () => {
			const ctx = await deployFixture();
			const tiersEq = defaultTiers();
			tiersEq[2].tickLower = tiersEq[2].tickUpper;
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers: tiersEq }]), "bad_tier");
			const tiersGt = defaultTiers();
			tiersGt[2].tickLower = tiersGt[2].tickUpper + TICK_SPACING;
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers: tiersGt }]), "bad_tier");
		});

		it("#7 tickUpper > MAX_TICK_PCS_V3_1PCT reverts with bad_tier", async () => {
			const ctx = await deployFixture();
			const tiers = defaultTiers();
			tiers[3].tickUpper = MAX_TICK_PCS_V3_1PCT + TICK_SPACING;
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");
		});

		it("#7b tickLower < -MAX_TICK_PCS_V3_1PCT reverts with bad_tier", async () => {
			const ctx = await deployFixture();
			const tiers = defaultTiers();
			tiers[0].tickLower = -(MAX_TICK_PCS_V3_1PCT + TICK_SPACING);
			tiers[0].tickUpper = -(MAX_TICK_PCS_V3_1PCT - TICK_SPACING);
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");
		});

		it("#8 unaligned tickLower or tickUpper reverts with bad_tier", async () => {
			const ctx = await deployFixture();
			const tiers1 = defaultTiers();
			tiers1[1].tickLower = tiers1[1].tickLower + 60;
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers: tiers1 }]), "bad_tier");
			const tiers2 = defaultTiers();
			tiers2[1].tickUpper = tiers2[1].tickUpper + 60;
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers: tiers2 }]), "bad_tier");
		});

		it("#9 sum of tokenAmounts > TREASURY_ALLOCATION (100M) reverts with bad_tier", async () => {
			const ctx = await deployFixture();
			const tiers = defaultTiers();
			tiers[0].tokenAmount = tiers[0].tokenAmount + 1n;
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers }]), "bad_tier");
		});

		it("#10 tiers with pre-set deployed / paused / positionId revert with bad_tier", async () => {
			const ctx = await deployFixture();
			const a = defaultTiers();
			a[1].deployed = true;
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers: a }]), "bad_tier");
			const b = defaultTiers();
			b[1].paused = true;
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers: b }]), "bad_tier");
			const c = defaultTiers();
			c[1].positionId = 42n;
			await expectError(ethers.deployContract("TreasuryLP5", [{ ...ctx.args, tiers: c }]), "bad_tier");
		});
	});

	describe("mint-time attacks", () => {
		it("#11 lying NPM that reports nonzero WBNB-side amount causes mint to revert (bad_tier)", async () => {
			const ctx = await deployFixture();
			await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
			await ctx.npm.setLieAboutWbnbSide(true);
			await expectError(
				ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress()),
				"bad_tier",
			);
			assert.equal(await ctx.treasury.initialized(), false);
		});

		it("#12 lying NPM that under-mints token side fails strict actualSpent == spent check", async () => {
			const ctx = await deployFixture();
			await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
			await ctx.npm.setLieAboutSpent(true);
			await expectError(
				ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress()),
				"bad_tier",
			);
			assert.equal(await ctx.treasury.initialized(), false);
		});

		it("#13 NPM that pretends pool is already initialized at different price still wires + mints cleanly", async () => {
			// Real PCS V3 NPM does NOT revert if createAndInitializePoolIfNecessary is
			// called on an already-initialized pool; it returns the pool address and
			// ignores the sqrtPrice arg. TreasuryLP5 must tolerate this.
			const [owner, agentSafe, platform, patron] = await ethers.getSigners();

			let wbnb, token;
			let attempts = 0;
			while (true) {
				wbnb = await ethers.deployContract("MockWBNB");
				token = await ethers.deployContract("ERC20Mock");
				const isToken0 = (await token.getAddress()).toLowerCase() < (await wbnb.getAddress()).toLowerCase();
				if (isToken0) break;
				if (++attempts > 60) throw new Error("ordering");
			}
			await token.mint(owner.address, ethers.parseEther("1000000000"));

			const router = await ethers.deployContract("MockFlapV2Router", [await wbnb.getAddress()]);
			const pair = await ethers.deployContract("MockFlapV2Pair", [await token.getAddress(), await wbnb.getAddress()]);
			const v3Factory = await ethers.deployContract("MockV3Factory");

			const preExistingPool = ethers.getAddress("0x" + "ab".repeat(20));
			const npm = await ethers.deployContract("PreInitializedPoolNPMMock", [
				await wbnb.getAddress(),
				preExistingPool,
				1n << 96n,
			]);

			const block = await ethers.provider.getBlock("latest");
			await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("200"), Number(block.timestamp));

			const args = {
				token: await token.getAddress(),
				flapV2Router: await router.getAddress(),
				wbnb: await wbnb.getAddress(),
				v3Npm: await npm.getAddress(),
				v3Factory: await v3Factory.getAddress(),
				agentSafe: agentSafe.address,
				platformReceiver: platform.address,
				patronReceiver: patron.address,
				buybackBps: 1000,
				platformBps: 500,
				patronBps: 2000,
				v3Fee: 10000,
				tiers: defaultTiers(),
			};

			const treasury = await ethers.deployContract("TreasuryLP5", [args]);
			await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));

			await treasury.connect(owner).setFlapV2Pair(await pair.getAddress());
			assert.equal(await treasury.initialized(), true);
			assert.equal((await treasury.v3Pool()).toLowerCase(), preExistingPool.toLowerCase());
			for (let i = 0; i < 4; i++) {
				const t = await treasury.tiers(i);
				assert.equal(t.deployed, true);
				assert.ok(t.positionId > 0n);
			}
		});
	});

	describe("claim-time attacks", () => {
		it("#14 random EOA cannot call claim() (only_agent_safe)", async () => {
			const ctx = await deployFixture();
			await seedAndInit(ctx);
			await expectError(ctx.treasury.connect(ctx.attacker).claim(), "only_agent_safe");
		});

		it("#14b owner cannot call claim() (only_agent_safe applies to all non-safe)", async () => {
			const ctx = await deployFixture();
			await seedAndInit(ctx);
			await expectError(ctx.treasury.connect(ctx.owner).claim(), "only_agent_safe");
		});

		it("#15 malicious safe re-entering claim() during BNB transfer is blocked by nonReentrant", async () => {
			const [owner, _agentSafe, platform, patron] = await ethers.getSigners();
			const maliciousSafe = await ethers.deployContract("MaliciousReentrantSafe");

			let wbnb, token;
			let attempts = 0;
			while (true) {
				wbnb = await ethers.deployContract("MockWBNB");
				token = await ethers.deployContract("ERC20Mock");
				const isToken0 = (await token.getAddress()).toLowerCase() < (await wbnb.getAddress()).toLowerCase();
				if (isToken0) break;
				if (++attempts > 60) throw new Error("ordering");
			}
			await token.mint(owner.address, ethers.parseEther("1000000000"));
			const router = await ethers.deployContract("MockFlapV2Router", [await wbnb.getAddress()]);
			const pair = await ethers.deployContract("MockFlapV2Pair", [await token.getAddress(), await wbnb.getAddress()]);
			const v3Factory = await ethers.deployContract("MockV3Factory");
			const npm = await ethers.deployContract("MockNonfungiblePositionManager", [await wbnb.getAddress()]);
			const block = await ethers.provider.getBlock("latest");
			await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("200"), Number(block.timestamp));

			const args = {
				token: await token.getAddress(),
				flapV2Router: await router.getAddress(),
				wbnb: await wbnb.getAddress(),
				v3Npm: await npm.getAddress(),
				v3Factory: await v3Factory.getAddress(),
				agentSafe: await maliciousSafe.getAddress(),
				platformReceiver: platform.address,
				patronReceiver: patron.address,
				buybackBps: 1000,
				platformBps: 500,
				patronBps: 2000,
				v3Fee: 10000,
				tiers: defaultTiers(),
			};

			const treasury = await ethers.deployContract("TreasuryLP5", [args]);
			await maliciousSafe.setTreasury(await treasury.getAddress());

			await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));
			await treasury.connect(owner).setFlapV2Pair(await pair.getAddress());

			const tier0 = await treasury.tiers(0);
			const collected = ethers.parseEther("4");
			await npm.creditWbnbOwed(tier0.positionId, collected, { value: collected });
			await maliciousSafe.armAttack();

			// triggerClaim invokes claim() AS the safe. Treasury sends BNB to the
			// safe, whose receive() tries to re-enter. Inner call must revert
			// (ReentrancyGuard); outer call succeeds because the safe catches it.
			await maliciousSafe.triggerClaim();

			assert.ok((await maliciousSafe.reenterAttempts()) >= 1n, "expected at least one reentry attempt");
			assert.equal(await maliciousSafe.lastReenterReverted(), true, "reentered claim should have reverted");
		});

		it("#16 claim() before setFlapV2Pair reverts with not_initialized", async () => {
			const ctx = await deployFixture();
			await expectError(ctx.treasury.connect(ctx.agentSafe).claim(), "not_initialized");
		});

		it("#17 claim() with zero fees + zero proceeds reverts with nothing_to_claim", async () => {
			const ctx = await deployFixture();
			await seedAndInit(ctx);
			await expectError(ctx.treasury.connect(ctx.agentSafe).claim(), "nothing_to_claim");
		});
	});

	describe("buyback / split math attacks", () => {
		it("#18 setBuybackBps > BUYBACK_BPS_MAX (1500) reverts with bad_buyback_bps", async () => {
			const ctx = await deployFixture();
			await expectError(ctx.treasury.connect(ctx.owner).setBuybackBps(1501n), "bad_buyback_bps");
			await expectError(ctx.treasury.connect(ctx.owner).setBuybackBps(65535n), "bad_buyback_bps");
			await ctx.treasury.connect(ctx.owner).setBuybackBps(1500n);
			assert.equal(await ctx.treasury.buybackBps(), 1500n);
		});

		it("#18b setBuybackBps from non-owner is rejected", async () => {
			const ctx = await deployFixture();
			await assert.rejects(
				ctx.treasury.connect(ctx.attacker).setBuybackBps(100n),
				(err) =>
					String(err).includes("OwnableUnauthorizedAccount") ||
					String(err).includes("Ownable: caller is not the owner"),
			);
		});

		it("#19 rounding dust always falls to agent: buyback + platform + patron + agent == collected", async () => {
			const ctx = await deployFixture();
			await seedAndInit(ctx);

			// 100003 wei -> integer BPS division leaves a few wei of dust.
			const tier0 = await ctx.treasury.tiers(0);
			const collected = 100003n;
			await ctx.npm.creditWbnbOwed(tier0.positionId, collected, { value: collected });

			const platformBefore = await ethers.provider.getBalance(ctx.platform.address);
			const patronBefore = await ethers.provider.getBalance(ctx.patron.address);
			const agentBefore = await ethers.provider.getBalance(ctx.agentSafe.address);

			const tx = await ctx.treasury.connect(ctx.agentSafe).claim();
			const rcpt = await tx.wait();
			const gas = rcpt.gasUsed * rcpt.gasPrice;

			const buyback = (collected * 1000n) / 10000n;
			const platform = (collected * 500n) / 10000n;
			const patron = (collected * 2000n) / 10000n;
			const agent = collected - buyback - platform - patron;

			assert.equal(buyback + platform + patron + agent, collected);

			const platformDelta = (await ethers.provider.getBalance(ctx.platform.address)) - platformBefore;
			const patronDelta = (await ethers.provider.getBalance(ctx.patron.address)) - patronBefore;
			const agentDelta = (await ethers.provider.getBalance(ctx.agentSafe.address)) - agentBefore + gas;

			assert.equal(platformDelta, platform, "platform leg mismatch");
			assert.equal(patronDelta, patron, "patron leg mismatch");
			assert.equal(agentDelta, agent, "agent leg mismatch (dust must land here)");
		});
	});

	describe("price-trajectory attacks", () => {
		it("#20 flash-loan-pump simulation: claim only releases AMM-realized portion, no instant re-drain", async () => {
			// Unit-level. Real V3 swap dynamics live in fork tests. We verify
			// the structural invariants:
			//   1. claim() pays out exactly NPM.collect() return values.
			//   2. A follow-up claim with no fresh fees reverts (no instant drain).
			//   3. Positions remain locked in the treasury throughout.
			const ctx = await deployFixture();
			await seedAndInit(ctx);

			await expectError(ctx.treasury.connect(ctx.attacker).claim(), "only_agent_safe");

			const tier0 = await ctx.treasury.tiers(0);
			const realized = ethers.parseEther("3");
			await ctx.npm.creditWbnbOwed(tier0.positionId, realized, { value: realized });

			const platformBefore = await ethers.provider.getBalance(ctx.platform.address);
			const patronBefore = await ethers.provider.getBalance(ctx.patron.address);
			const agentBefore = await ethers.provider.getBalance(ctx.agentSafe.address);
			const deadBefore = await ctx.token.balanceOf("0x000000000000000000000000000000000000dEaD");

			const tx = await ctx.treasury.connect(ctx.agentSafe).claim();
			const rcpt = await tx.wait();
			const gas = rcpt.gasUsed * rcpt.gasPrice;

			const platformGain = (await ethers.provider.getBalance(ctx.platform.address)) - platformBefore;
			const patronGain = (await ethers.provider.getBalance(ctx.patron.address)) - patronBefore;
			const agentGain = (await ethers.provider.getBalance(ctx.agentSafe.address)) - agentBefore + gas;
			const burned = (await ctx.token.balanceOf("0x000000000000000000000000000000000000dEaD")) - deadBefore;

			const buyback = (realized * 1000n) / 10000n;
			assert.equal(burned, buyback * 1000n);
			assert.equal(platformGain + patronGain + agentGain + buyback, realized);

			// No fresh fees -> next claim() reverts. Can't instant-drain.
			await expectError(ctx.treasury.connect(ctx.agentSafe).claim(), "nothing_to_claim");

			for (let i = 0; i < 4; i++) {
				const t = await ctx.treasury.tiers(i);
				assert.equal(t.deployed, true);
			}
		});
	});
});
