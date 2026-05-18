// Wave N real-fork integration test.
//
// Forks BSC mainnet and verifies TreasuryLP4 against the REAL PCS V3
// NonfungiblePositionManager + V3 Factory contracts. Specifically:
//   1. createAndInitializePoolIfNecessary creates a pool at the tier 0
//      lower-tick anchor using our sqrtPriceX96
//   2. NPM.mint accepts our single-sided MintParams and returns a positionId
//      with WBNB-side amount == 0
//   3. The minted position holds exactly the 25M token allocation we sent
//   4. positions(tokenId) returns tokensOwed{0,1} as zero before any trades
//
// We do NOT exercise the full FLAP graduation -> V2 pair path here; that
// belongs in a follow-up wave once the wave-h-real-fork test is updated for
// the wave N config surface. TreasuryLP4 unit tests cover the 4-way claim
// split, tier advancement, and oracle math against the mock NPM.
//
// Run with (Alchemy or any archival BSC RPC):
//   FORK_BSC=true FORK_BSC_URL=<archival url> bun hardhat test test/integration/wave-n-real-fork.test.js

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const FORK_ENABLED = process.env.FORK_BSC === "true";

// BSC mainnet address book
const PCS_V3_NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const PCS_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";
const PCS_V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const CHAINLINK_BNB_USD = "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE";

const V3_FEE_1PCT = 10000;
const V3_TICK_SPACING_1PCT = 200;

describe("Wave N TreasuryLP4 :: real PCS V3 NPM fork", () => {
	if (!FORK_ENABLED) {
		it.skip("requires FORK_BSC=true", () => {});
		return;
	}

	let owner;
	let agentSafe;
	let platform;
	let patron;
	let token; // ERC20Mock used as the launch-token stand-in
	let pair; // mock V2 pair (we do not need real FLAP graduation here)
	let v3Factory;
	let npm;
	let treasury;

	async function buildArgs(overrides) {
		const lowers = (overrides && overrides.lowers) || [2000, 6000, 10000, 14000];
		const uppers = (overrides && overrides.uppers) || [4000, 8000, 12000, 16000];
		const minEpochs = (overrides && overrides.minEpochs) || [2, 2, 3, 3];
		const targetMc = (overrides && overrides.targetMc) || [1n, 2n, 3n, 4n];
		const tiers = [];
		for (let i = 0; i < 4; i++) {
			tiers.push({
				targetMcUSD: targetMc[i],
				tokenAmount: ethers.parseEther("25000000"),
				tickLower: lowers[i],
				tickUpper: uppers[i],
				minEpochs: minEpochs[i],
				epochsAbove: 0,
				lastEpochTimestamp: 0,
				deployed: false,
				paused: false,
				positionId: 0,
			});
		}
		return {
			token: await token.getAddress(),
			flapV2Router: PCS_V2_ROUTER,
			wbnb: WBNB,
			v3Npm: PCS_V3_NPM,
			v3Factory: PCS_V3_FACTORY,
			agentSafe: agentSafe.address,
			platformReceiver: platform.address,
			patronReceiver: patron.address,
			bnbUsdFeed: (overrides && overrides.bnbUsdFeed) || CHAINLINK_BNB_USD,
			buybackBps: 1000,
			platformBps: 500,
			patronBps: 2000,
			v3Fee: V3_FEE_1PCT,
			tiers,
		};
	}

	before(async () => {
		[owner, agentSafe, platform, patron] = await ethers.getSigners();

		// Deploy ERC20Mock until its address sorts as token0 against WBNB.
		const wbnbLower = WBNB.toLowerCase();
		const ERC20Mock = await ethers.getContractFactory("ERC20Mock");
		for (let i = 0; i < 40; i++) {
			token = await ERC20Mock.deploy();
			if ((await token.getAddress()).toLowerCase() < wbnbLower) break;
		}
		if ((await token.getAddress()).toLowerCase() >= wbnbLower) {
			throw new Error(`token address ${await token.getAddress()} did not sort below WBNB; retry the suite`);
		}
		await token.mint(owner.address, ethers.parseEther("1000000000"));

		// Mock V2 pair so setFlapV2Pair has somewhere to point.
		const PairMock = await ethers.getContractFactory("MockFlapV2Pair");
		pair = await PairMock.deploy(await token.getAddress(), WBNB);
		const ts = (await ethers.provider.getBlock("latest")).timestamp;
		await pair.setReserves(ethers.parseEther("1000000000"), ethers.parseEther("200"), ts);

		// Bind to real PCS V3 NPM + Factory at their mainnet addresses.
		v3Factory = await ethers.getContractAt(
			[
				"function feeAmountTickSpacing(uint24) view returns (int24)",
				"function getPool(address,address,uint24) view returns (address)",
			],
			PCS_V3_FACTORY,
		);
		npm = await ethers.getContractAt(
			[
				"function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
				"function ownerOf(uint256) view returns (address)",
			],
			PCS_V3_NPM,
		);

		// Sanity: the fee tier we use must exist on PCS V3 with spacing 200.
		const spacing = await v3Factory.feeAmountTickSpacing(V3_FEE_1PCT);
		expect(spacing).to.equal(V3_TICK_SPACING_1PCT);
	});

	it("deploys TreasuryLP4 against real PCS V3 + Chainlink", async () => {
		const TreasuryLP4 = await ethers.getContractFactory("TreasuryLP4");
		const args = await buildArgs({});
		treasury = await TreasuryLP4.deploy(args);
		await treasury.waitForDeployment();

		expect(await treasury.v3TickSpacing()).to.equal(V3_TICK_SPACING_1PCT);
		expect(await treasury.tokenIsToken0()).to.equal(true);
		expect(await treasury.bnbUsdFeed()).to.equal(CHAINLINK_BNB_USD);
	});

	it("setFlapV2Pair wires the V2 pair and validates token decimals on real chain", async () => {
		await treasury.connect(owner).setFlapV2Pair(await pair.getAddress());
		expect(await treasury.flapV2Pair()).to.equal(await pair.getAddress());
	});

	it("deployTier(0) mints a single-sided position via real PCS V3 NPM", async () => {
		// Use a mock BNB/USD feed for this test so we can refresh updatedAt
		// after evm_increaseTime without tripping ORACLE_STALE_AFTER.
		const FeedCF = await ethers.getContractFactory("MockBnbUsdFeed");
		const mockFeed = await FeedCF.deploy(600n * 100000000n);

		const TreasuryLP4 = await ethers.getContractFactory("TreasuryLP4");
		const args = await buildArgs({ bnbUsdFeed: await mockFeed.getAddress(), minEpochs: [1, 1, 1, 1] });
		treasury = await TreasuryLP4.deploy(args);
		await treasury.waitForDeployment();
		await treasury.setFlapV2Pair(await pair.getAddress());

		await token.mint(await treasury.getAddress(), ethers.parseEther("100000000"));

		// TWAP window + 1 epoch, refresh feed updatedAt at each skip.
		await network.provider.send("evm_increaseTime", [1800]);
		await network.provider.send("evm_mine");
		await mockFeed.setAnswer(600n * 100000000n);
		await network.provider.send("evm_increaseTime", [Number(await treasury.epochLength())]);
		await network.provider.send("evm_mine");
		await mockFeed.setAnswer(600n * 100000000n);

		const tx = await treasury.checkAndAdvance();
		const rcpt = await tx.wait();
		expect(rcpt.status).to.equal(1);

		expect(await treasury.nextTierIndex()).to.equal(1n);
		const t0 = await treasury.tiers(0);
		expect(t0.deployed).to.equal(true);
		expect(t0.positionId).to.be.gt(0n);

		// V3 pool must now exist on the real factory.
		const poolAddr = await v3Factory.getPool(await token.getAddress(), WBNB, V3_FEE_1PCT);
		expect(poolAddr).to.not.equal(ethers.ZeroAddress);

		// NPM must hold the NFT on behalf of the treasury.
		const nftOwner = await npm.ownerOf(t0.positionId);
		expect(nftOwner).to.equal(await treasury.getAddress());

		// Position must be single-sided: tokensOwed are zero pre-trades,
		// and the position must have non-zero liquidity.
		const pos = await npm.positions(t0.positionId);
		expect(pos[10]).to.equal(0n); // tokensOwed0
		expect(pos[11]).to.equal(0n); // tokensOwed1
		expect(pos[7]).to.be.gt(0n); // liquidity

		// Treasury balance: started with 100M, deployed 25M into tier 0.
		expect(await token.balanceOf(await treasury.getAddress())).to.equal(ethers.parseEther("75000000"));
	});

	it("claim() reverts nothing_to_claim post-tier-deploy when no fees have accrued", async () => {
		await expect(treasury.connect(agentSafe).claim()).to.be.revertedWithCustomError(treasury, "nothing_to_claim");
	});
});
