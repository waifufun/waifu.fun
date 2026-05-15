// W33b: TreasuryLP4 — 4-tier reconfigured TreasuryLP for v3 burn edition
// Smoke tests focused on 4-tier-specific behavior. Full TreasuryLP test suite
// in TreasuryLP.test.js (12-tier) covers shared internal logic.

const { ethers, network } = require("hardhat");
const { strict: assert } = require("node:assert");

function tier(targetMcUSD, tickLower, tickUpper, minEpochs = 2) {
	return {
		targetMcUSD: BigInt(targetMcUSD),
		tokenAmount: ethers.parseEther("25000000"), // 25M tokens per tier (4 × 25M = 100M = 10% supply)
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
	// W33b: 4 tiers, $250k → $625k → $1.5M → $5M MC targets
	const targets = [250000n, 625000n, 1500000n, 5000000n];
	const mins = [2, 2, 3, 3];
	return targets.map((target, idx) => tier(target * 100000000n, idx * 600 + 60, idx * 600 + 600, mins[idx]));
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
	const [owner, agentSafe] = await ethers.getSigners();

	const token = await ethers.deployContract("ERC20Mock");
	await token.mint(owner.address, ethers.parseEther("1000000000"));
	const wbnb = await ethers.deployContract("ERC20Mock");
	const router = await ethers.deployContract("MockFlapV2Router", [await wbnb.getAddress()]);
	const pair = await ethers.deployContract("MockFlapV2Pair", [await token.getAddress(), await wbnb.getAddress()]);
	const feed = await ethers.deployContract("MockBnbUsdFeed", [600n * 100000000n]);
	const v4 = await ethers.deployContract("MockV4PoolManager");

	// Seed pair reserves before deploying TreasuryLP4 (constructor calls oraclePoke)
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
	const treasury = await ethers.deployContract("TreasuryLP4", [
		await token.getAddress(),
		await pair.getAddress(),
		await router.getAddress(),
		await v4.getAddress(),
		poolKey,
		agentSafe.address,
		await feed.getAddress(),
		tiers,
	]);

	return { owner, agentSafe, token, wbnb, router, pair, feed, v4, treasury, tiers, poolKey };
}

describe("TreasuryLP4", () => {
	it("deploys with exactly 4 tiers", async () => {
		const { treasury } = await deployFixture();
		// Read tier 3 (last one); should not revert
		const tier3 = await treasury.tiers(3);
		assert.equal(tier3.minEpochs, 3n);
	});

	it("rejects access to tier 4 (out of bounds)", async () => {
		const { treasury } = await deployFixture();
		try {
			await treasury.tiers(4);
			assert.fail("expected revert on tier 4");
		} catch (_e) {
			// expected
		}
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
		const fixture = await deployFixture();
		const tiers = defaultTiers();
		tiers[0].tokenAmount = ethers.parseEther("25000001");

		await expectError(
			ethers.deployContract("TreasuryLP4", [
				await fixture.token.getAddress(),
				await fixture.pair.getAddress(),
				await fixture.router.getAddress(),
				await fixture.v4.getAddress(),
				fixture.poolKey,
				fixture.agentSafe.address,
				await fixture.feed.getAddress(),
				tiers,
			]),
			"bad_tier",
		);
	});

	it("nextTierIndex starts at 0", async () => {
		const { treasury } = await deployFixture();
		assert.equal(await treasury.nextTierIndex(), 0n);
	});

	it("tier 0 starts undeployed", async () => {
		const { treasury } = await deployFixture();
		const t0 = await treasury.tiers(0);
		assert.equal(t0.deployed, false);
	});

	it("targetMcUSD scales correctly", async () => {
		const { treasury } = await deployFixture();
		const t0 = await treasury.tiers(0);
		// $250k * 1e8 (chainlink decimals)
		assert.equal(t0.targetMcUSD, 250000n * 100000000n);
	});

	it("claim forwards token-side V4 fees to the agentSafe", async () => {
		const tiers = defaultTiers();
		tiers[0].targetMcUSD = 1n;
		tiers[0].minEpochs = 1;
		const { agentSafe, token, feed, v4, treasury } = await deployFixture({ tiers });
		await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));
		await readyOracle();
		await advanceOneEpoch(treasury, feed);
		assert.equal(await treasury.nextTierIndex(), 1n);
		await v4.setClaimableToken(1, ethers.parseEther("77"));

		await treasury.connect(agentSafe).claim();

		assert.equal(await token.balanceOf(agentSafe.address), ethers.parseEther("77"));
		assert.equal(await token.balanceOf(await treasury.getAddress()), ethers.parseEther("75000000"));
	});
});
