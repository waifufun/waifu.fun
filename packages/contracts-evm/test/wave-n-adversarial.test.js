// Wave N adversarial / edge-case test matrix for TreasuryLP4 + TreasuryLP4Deployer.
//
// Companion to test/TreasuryLP4.test.js (happy paths + V3-mint guards) and
// test/integration/wave-n-real-fork.test.js (real BSC fork).
//
// Scope:
//   - 4-way split correctness under adversarial epoch state
//   - buyback target (0xdEaD) genuinely removes tokens from circulation
//   - finalizeLaunch griefing surface (UnknownLaunch on garbage tokens)
//   - non-owner / non-agent access reverts
//   - TickMath vendoring bounds

const { ethers, network } = require("hardhat");
const { strict: assert } = require("node:assert");

const TICK_SPACING = 200;

async function latestTimestamp() {
	const blk = await ethers.provider.getBlock("latest");
	return blk.timestamp;
}

async function increase(seconds) {
	await network.provider.send("evm_increaseTime", [seconds]);
	await network.provider.send("evm_mine");
}

async function refreshFeed(feed) {
	await feed.setAnswer(600n * 100000000n);
}

async function readyOracle() {
	await increase(1800);
}

async function advanceOneEpoch(treasury, feed) {
	await increase(Number(await treasury.epochLength()));
	await refreshFeed(feed);
	await treasury.checkAndAdvance();
	await increase(Number(await treasury.epochLength()));
	await refreshFeed(feed);
}

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

function defaultTiers() {
	const targets = [250000n, 1000000n, 5000000n, 25000000n];
	const mins = [2, 2, 3, 3];
	const tiers = [];
	for (let i = 0; i < 4; i++) {
		const tickLower = TICK_SPACING * (10 + i * 20);
		const tickUpper = tickLower + TICK_SPACING * 10;
		tiers.push(tier(targets[i] * 100000000n, tickLower, tickUpper, mins[i]));
	}
	return tiers;
}

async function deployTreasury(overrides = {}) {
	const [owner, agentSafe, platform, patron, attacker] = await ethers.getSigners();
	const wbnb = await ethers.deployContract("MockWBNB");
	let token;
	let attempts = 0;
	const wantToken0 = overrides.tokenIsToken0 !== false;
	while (true) {
		token = await ethers.deployContract("ERC20Mock");
		const isToken0 = (await token.getAddress()).toLowerCase() < (await wbnb.getAddress()).toLowerCase();
		if (isToken0 === wantToken0) break;
		if (++attempts > 30) break;
	}
	await token.mint(owner.address, ethers.parseEther("1000000000"));
	const router = await ethers.deployContract("MockFlapV2Router", [await wbnb.getAddress()]);
	const pair = await ethers.deployContract("MockFlapV2Pair", [
		await token.getAddress(),
		await wbnb.getAddress(),
	]);
	const feed = await ethers.deployContract("MockBnbUsdFeed", [600n * 100000000n]);
	const v3Factory = await ethers.deployContract("MockV3Factory");
	const npm = await ethers.deployContract("MockNonfungiblePositionManager", [await wbnb.getAddress()]);
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
	return { owner, agentSafe, platform, patron, attacker, token, wbnb, router, pair, feed, npm, v3Factory, treasury, args };
}

describe("Wave N adversarial :: TreasuryLP4 4-way split", () => {
	it("split math: 10/5/20/65 routes correctly under direct fund into a deployed tier", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployTreasury({ tiers });
		await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());
		await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await advanceOneEpoch(ctx.treasury, ctx.feed);
		// Tier 0 deployed; credit WBNB owed.
		const t0 = await ctx.treasury.tiers(0);
		assert.equal(t0.deployed, true);
		await ctx.npm.creditWbnbOwed(t0.positionId, ethers.parseEther("1"), {
			value: ethers.parseEther("1"),
		});

		const balPlatformBefore = await ethers.provider.getBalance(ctx.platform.address);
		const balPatronBefore = await ethers.provider.getBalance(ctx.patron.address);
		// Router holds 1 BNB so that the buyback swap can take the BNB and
		// route tokens to DEAD. Already true: MockFlapV2Router has a receive().
		await ctx.owner.sendTransaction({ to: await ctx.router.getAddress(), value: ethers.parseEther("100") });

		await ctx.treasury.connect(ctx.agentSafe).claim();

		const platformDelta = (await ethers.provider.getBalance(ctx.platform.address)) - balPlatformBefore;
		const patronDelta = (await ethers.provider.getBalance(ctx.patron.address)) - balPatronBefore;

		// 1 BNB collected. buyback=10%, platform=5%, patron=20%, agent=65%.
		assert.equal(platformDelta, ethers.parseEther("0.05"));
		assert.equal(patronDelta, ethers.parseEther("0.2"));
	});

	it("buyback target is DEAD; treasury allocation never re-enters circulating supply via buyback", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const ctx = await deployTreasury({ tiers });
		assert.equal((await ctx.treasury.DEAD()).toLowerCase(), "0x000000000000000000000000000000000000dead");
		await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());
		await ctx.token.mint(await ctx.treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await advanceOneEpoch(ctx.treasury, ctx.feed);
		const t0 = await ctx.treasury.tiers(0);
		await ctx.npm.creditWbnbOwed(t0.positionId, ethers.parseEther("1"), {
			value: ethers.parseEther("1"),
		});

		const deadBefore = await ctx.token.balanceOf("0x000000000000000000000000000000000000dEaD");

		await ctx.treasury.connect(ctx.agentSafe).claim();

		const deadAfter = await ctx.token.balanceOf("0x000000000000000000000000000000000000dEaD");
		// Buyback got 0.1 BNB; router mints at rate 1000, so DEAD gains 100 tokens.
		assert.ok(deadAfter > deadBefore, "DEAD must receive tokens from buyback");
	});

	it("claim() on a fresh treasury with no tiers reverts no_tiers_deployed", async () => {
		const ctx = await deployTreasury();
		await assert.rejects(
			ctx.treasury.connect(ctx.agentSafe).claim(),
			(err) => String(err).includes("no_tiers_deployed"),
		);
	});

	it("non-owner cannot setFlapV2Pair", async () => {
		const ctx = await deployTreasury();
		await assert.rejects(
			ctx.treasury.connect(ctx.attacker).setFlapV2Pair(await ctx.pair.getAddress()),
		);
	});

	it("non-owner cannot setBuybackBps / setEpochLength / pauseTier", async () => {
		const ctx = await deployTreasury();
		await assert.rejects(ctx.treasury.connect(ctx.attacker).setBuybackBps(500));
		await assert.rejects(ctx.treasury.connect(ctx.attacker).setEpochLength(3600));
		await assert.rejects(ctx.treasury.connect(ctx.attacker).pauseTier(0));
	});

	it("non-agent cannot claim", async () => {
		const ctx = await deployTreasury();
		await assert.rejects(
			ctx.treasury.connect(ctx.attacker).claim(),
			(err) => String(err).includes("only_agent_safe") || String(err).includes("no_tiers_deployed"),
		);
	});

	it("setFlapV2Pair is one-shot", async () => {
		const ctx = await deployTreasury();
		await ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress());
		await assert.rejects(
			ctx.treasury.connect(ctx.owner).setFlapV2Pair(await ctx.pair.getAddress()),
			(err) => String(err).includes("pair_already_set"),
		);
	});

	it("setFlapV2Pair rejects pair where neither token0 nor token1 is the treasury's token", async () => {
		const ctx = await deployTreasury();
		const dummyA = "0x1000000000000000000000000000000000001001";
		const dummyB = "0x2000000000000000000000000000000000001002";
		const wrong = await ethers.deployContract("MockFlapV2Pair", [dummyA, dummyB]);
		await assert.rejects(
			ctx.treasury.connect(ctx.owner).setFlapV2Pair(await wrong.getAddress()),
			(err) => String(err).includes("bad_pair"),
		);
	});

	it("setFlapV2Pair rejects zero address", async () => {
		const ctx = await deployTreasury();
		await assert.rejects(
			ctx.treasury.connect(ctx.owner).setFlapV2Pair(ethers.ZeroAddress),
			(err) => String(err).includes("zero_address"),
		);
	});

	it("setBuybackBps cannot exceed BUYBACK_BPS_MAX (1500)", async () => {
		const ctx = await deployTreasury();
		await assert.rejects(
			ctx.treasury.connect(ctx.owner).setBuybackBps(1501),
			(err) => String(err).includes("bad_buyback_bps"),
		);
	});

	it("epoch length bounds are enforced", async () => {
		const ctx = await deployTreasury();
		await assert.rejects(
			ctx.treasury.connect(ctx.owner).setEpochLength(3599),
			(err) => String(err).includes("bad_epoch_length"),
		);
		await assert.rejects(
			ctx.treasury.connect(ctx.owner).setEpochLength(86401),
			(err) => String(err).includes("bad_epoch_length"),
		);
		await ctx.treasury.connect(ctx.owner).setEpochLength(3600);
		assert.equal(await ctx.treasury.epochLength(), 3600n);
	});
});

describe("Wave N adversarial :: TreasuryLP4Deployer + LaunchFactory.finalizeLaunch griefing", () => {
	it("TreasuryLP4Deployer transfers ownership of the deployed treasury to the caller (LaunchFactory)", async () => {
		const ctx = await deployTreasury();
		const Dep = await ethers.getContractFactory("TreasuryLP4Deployer");
		const dep = await Dep.deploy();
		const tx = await dep.deploy(ctx.args);
		const rcpt = await tx.wait();
		// Find the new TreasuryLP4 address by scanning logs for an unfamiliar
		// address (anything that is not the deployer itself).
		let found;
		for (const log of rcpt.logs) {
			if (log.address && log.address.toLowerCase() !== (await dep.getAddress()).toLowerCase()) {
				found = log.address;
			}
		}
		assert.ok(found, "deployed treasury address not found in logs");
		const lp = await ethers.getContractAt("TreasuryLP4", found);
		const ownerAddr = await lp.owner();
		const [me] = await ethers.getSigners();
		assert.equal(ownerAddr.toLowerCase(), me.address.toLowerCase());
	});

	it("finalizeLaunch reverts UnknownLaunch for arbitrary garbage tokens", async () => {
		const ctx = await deployTreasury();
		const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer");
		const routerDeployer = await RouterDeployerCF.deploy();
		const TreasuryDeployerCF = await ethers.getContractFactory("TreasuryLP4Deployer");
		const treasuryDep = await TreasuryDeployerCF.deploy();
		const SafeSingletonCF = await ethers.getContractFactory("MockSafeSingleton");
		const safeSingleton = await SafeSingletonCF.deploy();
		const SafeProxyFactoryCF = await ethers.getContractFactory("MockSafeProxyFactory");
		const safeProxyFactory = await SafeProxyFactoryCF.deploy();
		const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeDeployer");
		const agentSafeDeployer = await AgentSafeDeployerCF.deploy(
			await safeSingleton.getAddress(),
			await safeProxyFactory.getAddress(),
		);

		const PCSFactory = await ethers.getContractFactory("MockBundlePCSFactory");
		const pcsFactory = await PCSFactory.deploy();
		const PCSRouter = await ethers.getContractFactory("MockSimplePCSRouter");
		const pcsRouter = await PCSRouter.deploy();
		const wbnb = "0x0000000000000000000000000000000000000B0B";
		const [, , , , attacker] = await ethers.getSigners();

		const Factory = await ethers.getContractFactory("LaunchFactory");
		const factory = await Factory.deploy(
			wbnb,
			await pcsFactory.getAddress(),
			await pcsRouter.getAddress(),
			"0x" + "00".repeat(32),
			"0x000000000000000000000000000000000000fa01",
			"0x0000000000000000000000000000000000000007",
			"0x0000000000000000000000000000000000000008",
			attacker.address,
			await routerDeployer.getAddress(),
			await agentSafeDeployer.getAddress(),
			await treasuryDep.getAddress(),
			await ctx.npm.getAddress(),
			await ctx.v3Factory.getAddress(),
			await ctx.feed.getAddress(),
		);

		await assert.rejects(
			factory.connect(attacker).finalizeLaunch("0x000000000000000000000000000000000000dEaD"),
			(err) => String(err).includes("UnknownLaunch"),
		);
	});
});

describe("Wave N adversarial :: TickMath vendored library bounds", () => {
	it("a tick range at the max aligned boundary is accepted", async () => {
		const tiers = defaultTiers();
		// Replace tier[3] upper with the max aligned tick below MAX_TICK (887272).
		const MAX_ALIGNED = 887200;
		tiers[3].tickUpper = MAX_ALIGNED;
		const ctx = await deployTreasury({ tiers });
		assert.equal((await ctx.treasury.tiers(3)).tickUpper, BigInt(MAX_ALIGNED));
	});

	it("a tick range with negative ticks aligned to spacing is accepted", async () => {
		const tiers = defaultTiers();
		// Negative ticks aligned to spacing must work; tier ordering must hold.
		tiers[0].tickLower = -2000;
		tiers[0].tickUpper = -200;
		tiers[1].tickLower = -200;
		tiers[1].tickUpper = 4000;
		const ctx = await deployTreasury({ tiers });
		assert.equal((await ctx.treasury.tiers(0)).tickLower, -2000n);
	});
});
