const assert = require("node:assert/strict");
const { ethers, network } = require("hardhat");

const Q112 = 2n ** 112n;
const ONE = ethers.parseEther("1");
const TOKEN_SUPPLY = ethers.parseEther("1000000000");
const TIER_AMOUNT = ethers.parseEther("45000000");
const DEAD = "0x000000000000000000000000000000000000dEaD";

async function latestTimestamp() {
	const block = await ethers.provider.getBlock("latest");
	return BigInt(block.timestamp);
}

async function increase(seconds) {
	await network.provider.send("evm_increaseTime", [seconds]);
	await network.provider.send("evm_mine");
}

async function expectError(promise, errorName) {
	await assert.rejects(promise, (err) => String(err).includes(errorName));
}

function assertApprox(actual, expected, tolerance) {
	const delta = actual > expected ? actual - expected : expected - actual;
	assert.equal(delta <= tolerance, true, `${actual} not within ${tolerance} of ${expected}`);
}

function tier(targetMcUSD, tickLower, tickUpper, minEpochs = 2) {
	return {
		targetMcUSD,
		tokenAmount: TIER_AMOUNT,
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
	const targets = [
		100000n,
		250000n,
		500000n,
		1000000n,
		2500000n,
		5000000n,
		10000000n,
		25000000n,
		50000000n,
		100000000n,
		250000000n,
		500000000n,
	];
	const mins = [2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6];
	return targets.map((target, idx) => tier(target * 100000000n, idx * 600 + 60, idx * 600 + 600, mins[idx]));
}

async function deployFixture(overrides = {}) {
	const [owner, agentSafe, other] = await ethers.getSigners();
	const token = await ethers.deployContract("ERC20Mock");
	await token.waitForDeployment();
	const wbnb = await ethers.deployContract("ERC20Mock");
	await wbnb.waitForDeployment();
	await token.mint(owner.address, TOKEN_SUPPLY);

	const router = await ethers.deployContract("MockFlapV2Router", [await wbnb.getAddress()]);
	await router.waitForDeployment();
	const pair = await ethers.deployContract("MockFlapV2Pair", [await token.getAddress(), await wbnb.getAddress()]);
	await pair.waitForDeployment();
	const feed = await ethers.deployContract("MockBnbUsdFeed", [600n * 100000000n]);
	await feed.waitForDeployment();
	const v4 = await ethers.deployContract("MockV4PoolManager");
	await v4.waitForDeployment();

	const now = await latestTimestamp();
	await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("200"), Number(now));

	const poolKey = {
		currency0: ethers.ZeroAddress,
		currency1: await token.getAddress(),
		hooks: ethers.ZeroAddress,
		poolManager: await v4.getAddress(),
		fee: 2500,
		tickSpacing: 60,
	};
	const tiers = overrides.tiers || defaultTiers();
	const TreasuryLP = await ethers.getContractFactory("TreasuryLP");
	const treasury = await TreasuryLP.deploy(
		await token.getAddress(),
		await pair.getAddress(),
		await router.getAddress(),
		await v4.getAddress(),
		overrides.poolKey || poolKey,
		overrides.agentSafe || agentSafe.address,
		await feed.getAddress(),
		tiers,
	);
	await treasury.waitForDeployment();
	await token.transfer(await treasury.getAddress(), TIER_AMOUNT * 12n);

	return { owner, agentSafe, other, token, wbnb, router, pair, feed, v4, treasury, tiers, poolKey };
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

describe("TreasuryLP", () => {
	it("constructor stores immutable launch addresses and default knobs", async () => {
		const { token, pair, router, v4, feed, agentSafe, treasury } = await deployFixture();

		assert.equal(await treasury.token(), await token.getAddress());
		assert.equal(await treasury.flapV2Pair(), await pair.getAddress());
		assert.equal(await treasury.flapV2Router(), await router.getAddress());
		assert.equal(await treasury.v4PoolManager(), await v4.getAddress());
		assert.equal(await treasury.bnbUsdFeed(), await feed.getAddress());
		assert.equal(await treasury.agentSafe(), agentSafe.address);
		assert.equal(await treasury.buybackBps(), 700n);
		assert.equal(await treasury.epochLength(), 14400n);
	});

	it("constructor supports reversed Pancake V2 token ordering", async () => {
		const fixture = await deployFixture();
		const reversedPair = await ethers.deployContract("MockFlapV2Pair", [
			await fixture.wbnb.getAddress(),
			await fixture.token.getAddress(),
		]);
		await reversedPair.waitForDeployment();
		const now = await latestTimestamp();
		await reversedPair.setReserves(ethers.parseEther("200"), ethers.parseEther("1000000000"), Number(now));
		const TreasuryLP = await ethers.getContractFactory("TreasuryLP");
		const treasury = await TreasuryLP.deploy(
			await fixture.token.getAddress(),
			await reversedPair.getAddress(),
			await fixture.router.getAddress(),
			await fixture.v4.getAddress(),
			fixture.poolKey,
			fixture.agentSafe.address,
			await fixture.feed.getAddress(),
			defaultTiers(),
		);
		await treasury.waitForDeployment();

		await readyOracle();
		assertApprox(await treasury.currentMcUSD(), 120000n * 100000000n, 10000000n);
	});

	it("constructor rejects a pair that is not token and wbnb", async () => {
		const fixture = await deployFixture();
		const otherToken = await ethers.deployContract("ERC20Mock");
		await otherToken.waitForDeployment();
		const badPair = await ethers.deployContract("MockFlapV2Pair", [
			await fixture.token.getAddress(),
			await otherToken.getAddress(),
		]);
		await badPair.waitForDeployment();
		const now = await latestTimestamp();
		await badPair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("200"), Number(now));
		const TreasuryLP = await ethers.getContractFactory("TreasuryLP");

		await expectError(
			TreasuryLP.deploy(
				await fixture.token.getAddress(),
				await badPair.getAddress(),
				await fixture.router.getAddress(),
				await fixture.v4.getAddress(),
				fixture.poolKey,
				fixture.agentSafe.address,
				await fixture.feed.getAddress(),
				defaultTiers(),
			),
			"bad_pair",
		);
	});

	it("constructor rejects invalid tick spacing, V4 counter-currency, and unaligned ticks", async () => {
		const fixture = await deployFixture();
		const badKey = { ...fixture.poolKey, tickSpacing: 10 };
		const TreasuryLP = await ethers.getContractFactory("TreasuryLP");
		await expectError(
			TreasuryLP.deploy(
				await fixture.token.getAddress(),
				await fixture.pair.getAddress(),
				await fixture.router.getAddress(),
				await fixture.v4.getAddress(),
				badKey,
				fixture.agentSafe.address,
				await fixture.feed.getAddress(),
				defaultTiers(),
			),
			"bad_tier",
		);

		const otherToken = await ethers.deployContract("ERC20Mock");
		await otherToken.waitForDeployment();
		const badCounterKey = { ...fixture.poolKey, currency0: await otherToken.getAddress() };
		await expectError(
			TreasuryLP.deploy(
				await fixture.token.getAddress(),
				await fixture.pair.getAddress(),
				await fixture.router.getAddress(),
				await fixture.v4.getAddress(),
				badCounterKey,
				fixture.agentSafe.address,
				await fixture.feed.getAddress(),
				defaultTiers(),
			),
			"bad_tier",
		);

		const badTiers = defaultTiers();
		badTiers[0].tickLower = 61;
		await expectError(
			TreasuryLP.deploy(
				await fixture.token.getAddress(),
				await fixture.pair.getAddress(),
				await fixture.router.getAddress(),
				await fixture.v4.getAddress(),
				fixture.poolKey,
				fixture.agentSafe.address,
				await fixture.feed.getAddress(),
				badTiers,
			),
			"bad_tier",
		);
	});

	it("oraclePoke stores a V2 cumulative snapshot", async () => {
		const { treasury } = await deployFixture();
		const snapshot = await treasury.oracleSnapshot();

		assert.equal(snapshot.price0CumulativeLast >= 0n, true);
		assert.equal(snapshot.blockTimestampLast > 0n, true);
	});

	it("currentMcUSD reverts before the 1800 second TWAP window", async () => {
		const { treasury } = await deployFixture();
		await expectError(treasury.currentMcUSD(), "twap_not_ready");
	});

	it("currentMcUSD converts V2 price0 TWAP and Chainlink BNB USD to 8 decimals", async () => {
		const { treasury } = await deployFixture();
		await readyOracle();

		assertApprox(await treasury.currentMcUSD(), 120000n * 100000000n, 10000000n);
	});

	it("currentMcUSD rejects stale or zero BNB USD feed data", async () => {
		const { treasury, feed } = await deployFixture();
		await readyOracle();

		await feed.setAnswer(0);
		await expectError(treasury.currentMcUSD(), "stale_bnb_usd");

		await feed.setAnswer(600n * 100000000n);
		await feed.setUpdatedAt(1);
		await expectError(treasury.currentMcUSD(), "stale_bnb_usd");
	});

	it("checkAndAdvance advances only nextTierIndex and counts one epoch per call", async () => {
		const { treasury, feed } = await deployFixture();
		await readyOracle();
		await expectError(treasury.checkAndAdvance(), "epoch_not_ready");

		await increase(Number(await treasury.epochLength()));
		await refreshFeed(feed);
		await treasury.checkAndAdvance();
		const [current, required] = await treasury.epochsTowardTier(0);
		assert.equal(current, 1n);
		assert.equal(required, 2n);
		assert.equal(await treasury.nextTierIndex(), 0n);

		await expectError(treasury.checkAndAdvance(), "epoch_not_ready");
	});

	it("checkAndAdvance deploys tier 0 after sustained min epochs", async () => {
		const { treasury, token, v4, feed } = await deployFixture();
		await readyOracle();

		await advanceOneEpoch(treasury, feed);
		await treasury.checkAndAdvance();

		assert.equal(await treasury.nextTierIndex(), 1n);
		assert.equal(await treasury.tierDeployed(0), true);
		const storedTier = await treasury.tiers(0);
		assert.equal(storedTier.positionId, 1n);
		assert.equal(await token.balanceOf(await v4.getAddress()), TIER_AMOUNT);
	});

	it("checkAndAdvance resets epochs when MC drops below target", async () => {
		const { treasury, pair, feed } = await deployFixture();
		await readyOracle();
		await advanceOneEpoch(treasury, feed);

		const now = await latestTimestamp();
		await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("100"), Number(now));
		await increase(1800);
		await refreshFeed(feed);
		await treasury.oraclePoke();
		await increase(1800);
		await refreshFeed(feed);
		await treasury.checkAndAdvance();

		const [current] = await treasury.epochsTowardTier(0);
		assert.equal(current, 0n);
		assert.equal(await treasury.nextTierIndex(), 0n);
	});

	it("sequential ordering prevents tier 1 from deploying in the same epoch as tier 0", async () => {
		const { treasury, pair, feed } = await deployFixture();
		const now = await latestTimestamp();
		await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("2000"), Number(now));
		await readyOracle();

		await advanceOneEpoch(treasury, feed);
		await treasury.checkAndAdvance();
		assert.equal(await treasury.nextTierIndex(), 1n);
		assert.equal(await treasury.tierDeployed(1), false);
		await expectError(treasury.checkAndAdvance(), "epoch_not_ready");
	});

	it("deployTier preserves token ordering when token is currency1", async () => {
		const { treasury, v4, feed } = await deployFixture();
		await readyOracle();
		await advanceOneEpoch(treasury, feed);
		await treasury.checkAndAdvance();

		const position = await v4.positions(1);
		assert.equal(position.tokenIsCurrency0, false);
		assert.equal(position.tokenAmount, TIER_AMOUNT);
	});

	it("deployTier supports token as currency0 via the V4 pool key branch", async () => {
		const fixture = await deployFixture();
		const poolKey = {
			currency0: await fixture.token.getAddress(),
			currency1: ethers.ZeroAddress,
			hooks: ethers.ZeroAddress,
			poolManager: await fixture.v4.getAddress(),
			fee: 2500,
			tickSpacing: 60,
		};
		const TreasuryLP = await ethers.getContractFactory("TreasuryLP");
		const treasury = await TreasuryLP.deploy(
			await fixture.token.getAddress(),
			await fixture.pair.getAddress(),
			await fixture.router.getAddress(),
			await fixture.v4.getAddress(),
			poolKey,
			fixture.agentSafe.address,
			await fixture.feed.getAddress(),
			defaultTiers(),
		);
		await treasury.waitForDeployment();
		await fixture.token.mint(fixture.owner.address, TIER_AMOUNT * 12n);
		await fixture.token.transfer(await treasury.getAddress(), TIER_AMOUNT * 12n);
		await readyOracle();
		await advanceOneEpoch(treasury, fixture.feed);
		await treasury.checkAndAdvance();

		const position = await fixture.v4.positions(1);
		assert.equal(position.tokenIsCurrency0, true);
		assert.equal(position.tokenAmount, TIER_AMOUNT);
	});

	it("deployTier reverts when TreasuryLP lacks the tranche tokens", async () => {
		const fixture = await deployFixture();
		const TreasuryLP = await ethers.getContractFactory("TreasuryLP");
		const treasury = await TreasuryLP.deploy(
			await fixture.token.getAddress(),
			await fixture.pair.getAddress(),
			await fixture.router.getAddress(),
			await fixture.v4.getAddress(),
			fixture.poolKey,
			fixture.agentSafe.address,
			await fixture.feed.getAddress(),
			defaultTiers(),
		);
		await treasury.waitForDeployment();
		await readyOracle();
		await advanceOneEpoch(treasury, fixture.feed);
		await expectError(treasury.checkAndAdvance(), "insufficient_tokens");
	});

	it("pauseTier only pauses future undeployed tiers", async () => {
		const { treasury, feed } = await deployFixture();
		await treasury.pauseTier(2);
		const pausedTier = await treasury.tiers(2);
		assert.equal(pausedTier.paused, true);

		await readyOracle();
		await advanceOneEpoch(treasury, feed);
		await treasury.checkAndAdvance();
		await expectError(treasury.pauseTier(0), "bad_tier");
	});

	it("paused next tier blocks checkAndAdvance", async () => {
		const { treasury } = await deployFixture();
		await treasury.pauseTier(0);
		await readyOracle();
		await expectError(treasury.checkAndAdvance(), "tier_paused");
	});

	it("setBuybackBps is owner only and bounded to 1500", async () => {
		const { treasury, other } = await deployFixture();
		await treasury.setBuybackBps(1500);
		assert.equal(await treasury.buybackBps(), 1500n);
		await expectError(treasury.setBuybackBps(1501), "bad_buyback_bps");
		await expectError(treasury.connect(other).setBuybackBps(100), "Ownable");
	});

	it("setEpochLength is owner only and bounded from 1 hour to 24 hours", async () => {
		const { treasury, other } = await deployFixture();
		await treasury.setEpochLength(3600);
		assert.equal(await treasury.epochLength(), 3600n);
		await treasury.setEpochLength(86400);
		assert.equal(await treasury.epochLength(), 86400n);
		await expectError(treasury.setEpochLength(3599), "bad_epoch_length");
		await expectError(treasury.setEpochLength(86401), "bad_epoch_length");
		await expectError(treasury.connect(other).setEpochLength(3600), "Ownable");
	});

	it("claimable sums deployed V4 native BNB proceeds", async () => {
		const { treasury, v4, feed } = await deployFixture();
		await readyOracle();
		await advanceOneEpoch(treasury, feed);
		await treasury.checkAndAdvance();
		await v4.setClaimable(1, ethers.parseEther("10"), { value: ethers.parseEther("10") });

		const [total, perTier] = await treasury.claimable();
		assert.equal(total, ethers.parseEther("10"));
		assert.equal(perTier[0], ethers.parseEther("10"));
		assert.equal(perTier[1], 0n);
	});

	it("claim is restricted to the immutable agentSafe", async () => {
		const { treasury, other } = await deployFixture();
		await expectError(treasury.connect(other).claim(), "only_agent_safe");
	});

	it("claim reverts before any tier is deployed", async () => {
		const { treasury, agentSafe } = await deployFixture();
		await expectError(treasury.connect(agentSafe).claim(), "no_tiers_deployed");
	});

	it("claim reverts when deployed tiers have no BNB proceeds", async () => {
		const { treasury, agentSafe, feed } = await deployFixture();
		await readyOracle();
		await advanceOneEpoch(treasury, feed);
		await treasury.checkAndAdvance();

		await expectError(treasury.connect(agentSafe).claim(), "nothing_to_claim");
	});

	it("claim collects BNB, buys back 7 percent, burns tokens, and sends remainder to agentSafe", async () => {
		const { treasury, agentSafe, v4, token, feed } = await deployFixture();
		await readyOracle();
		await advanceOneEpoch(treasury, feed);
		await treasury.checkAndAdvance();
		await v4.setClaimable(1, ethers.parseEther("10"), { value: ethers.parseEther("10") });

		const safeBefore = await ethers.provider.getBalance(agentSafe.address);
		const tx = await treasury.connect(agentSafe).claim();
		const receipt = await tx.wait();
		const gas = receipt.gasUsed * receipt.gasPrice;
		const safeAfter = await ethers.provider.getBalance(agentSafe.address);

		assert.equal(safeAfter - safeBefore + gas, ethers.parseEther("9.3"));
		assert.equal(await token.balanceOf(DEAD), ethers.parseEther("700"));
		assert.equal(await ethers.provider.getBalance(await treasury.getAddress()), 0n);
		const [total] = await treasury.claimable();
		assert.equal(total, 0n);
	});

	it("claim respects buybackBps zero and sends all collected BNB to agentSafe", async () => {
		const { treasury, agentSafe, v4, token, feed } = await deployFixture();
		await treasury.setBuybackBps(0);
		await readyOracle();
		await advanceOneEpoch(treasury, feed);
		await treasury.checkAndAdvance();
		await v4.setClaimable(1, ethers.parseEther("3"), { value: ethers.parseEther("3") });

		const safeBefore = await ethers.provider.getBalance(agentSafe.address);
		const tx = await treasury.connect(agentSafe).claim();
		const receipt = await tx.wait();
		const gas = receipt.gasUsed * receipt.gasPrice;
		const safeAfter = await ethers.provider.getBalance(agentSafe.address);

		assert.equal(safeAfter - safeBefore + gas, ethers.parseEther("3"));
		assert.equal(await token.balanceOf(DEAD), 0n);
	});

	it("oraclePoke can reseed the V2 TWAP snapshot after a reserve change", async () => {
		const { treasury, pair, feed } = await deployFixture();
		await readyOracle();
		assertApprox(await treasury.currentMcUSD(), 120000n * 100000000n, 10000000n);

		const now = await latestTimestamp();
		await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("400"), Number(now));
		await treasury.oraclePoke();
		await readyOracle();
		await refreshFeed(feed);

		assertApprox(await treasury.currentMcUSD(), 240000n * 100000000n, 10000000n);
	});

	it("oraclePoke cannot be spammed to block a ready tier check", async () => {
		const { treasury, feed } = await deployFixture();
		await readyOracle();
		await increase(Number(await treasury.epochLength()));
		await refreshFeed(feed);

		await treasury.oraclePoke();
		assertApprox(await treasury.currentMcUSD(), 120000n * 100000000n, 10000000n);
		await treasury.checkAndAdvance();

		const [current] = await treasury.epochsTowardTier(0);
		assert.equal(current, 1n);
	});

	it("all 12 tiers use 45M tokens, aligned ticks, and configured epoch requirements", async () => {
		const { treasury } = await deployFixture();
		let total = 0n;
		for (let i = 0; i < 12; i++) {
			const stored = await treasury.tiers(i);
			total += stored.tokenAmount;
			assert.equal(stored.tickLower % 60n, 0n);
			assert.equal(stored.tickUpper % 60n, 0n);
			assert.equal(stored.tickLower < stored.tickUpper, true);
			assert.equal(stored.minEpochs >= 2n && stored.minEpochs <= 6n, true);
		}
		assert.equal(total, ethers.parseEther("540000000"));
	});

	it("nextTierIndex remains monotonic across multiple deployed tiers", async () => {
		const { treasury, pair, feed } = await deployFixture();
		const now = await latestTimestamp();
		await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("1000"), Number(now));
		await readyOracle();

		await advanceOneEpoch(treasury, feed);
		await treasury.checkAndAdvance();
		assert.equal(await treasury.nextTierIndex(), 1n);

		for (let i = 0; i < 3; i++) {
			await increase(Number(await treasury.epochLength()));
			await refreshFeed(feed);
			await treasury.checkAndAdvance();
		}
		assert.equal(await treasury.nextTierIndex(), 2n);
		assert.equal(await treasury.tierDeployed(0), true);
		assert.equal(await treasury.tierDeployed(1), true);
		assert.equal(await treasury.tierDeployed(2), false);
	});

	it("rejects tier schedules above the 540M token cap", async () => {
		const fixture = await deployFixture();
		const tiers = defaultTiers();
		tiers[0].tokenAmount = ethers.parseEther("45000001");
		const TreasuryLP = await ethers.getContractFactory("TreasuryLP");

		await expectError(
			TreasuryLP.deploy(
				await fixture.token.getAddress(),
				await fixture.pair.getAddress(),
				await fixture.router.getAddress(),
				await fixture.v4.getAddress(),
				fixture.poolKey,
				fixture.agentSafe.address,
				await fixture.feed.getAddress(),
				tiers,
			),
			"bad_tier",
		);
	});

	it("uses UQ112x112 cumulative price rather than spot-only arithmetic", async () => {
		const { treasury, pair, feed } = await deployFixture();
		const cumulative = 5n * Q112;
		await pair.setPrice0CumulativeLast(cumulative);
		await readyOracle();
		await treasury.oraclePoke();
		await readyOracle();
		await refreshFeed(feed);

		const snapshot = await treasury.oracleSnapshot();
		assert.equal(snapshot.price0CumulativeLast >= cumulative, true);
		assertApprox(await treasury.currentMcUSD(), 120000n * 100000000n, 10000000n);
	});
});
