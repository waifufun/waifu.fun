const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("E2E V2 Lifecycle", () => {
	let waifu;
	let waifuFun;
	let factory;
	let feeRouter;
	let staking;
	let owner;
	let alice;
	let bob;
	let platform;
	let treasury;

	const TOTAL_SUPPLY = ethers.parseEther("1000000000");
	const CURVE_LIMIT = ethers.parseEther("1000");

	beforeEach(async () => {
		[owner, alice, bob, platform, treasury] = await ethers.getSigners();

		const Token = await ethers.getContractFactory("WaifuFunToken");
		waifu = await Token.deploy("Waifu", "WAIFU", ethers.parseEther("10000000000"), 18);
		await waifu.waitForDeployment();
		await waifu.mintToken(owner.address, ethers.parseEther("1000000"));
		await waifu.mintToken(alice.address, ethers.parseEther("1000000"));
		await waifu.mintToken(bob.address, ethers.parseEther("1000000"));

		const MockFactory = await ethers.getContractFactory("MockPancakeFactory");
		const mockFactory = await MockFactory.deploy();
		await mockFactory.waitForDeployment();
		const MockRouter = await ethers.getContractFactory("MockPancakeRouter");
		const mockRouter = await MockRouter.deploy(await mockFactory.getAddress());
		await mockRouter.waitForDeployment();

		const Staking = await ethers.getContractFactory("VeWaifuStaking");
		staking = await Staking.deploy(await waifu.getAddress());
		await staking.waitForDeployment();

		const FeeRouter = await ethers.getContractFactory("FeeRouter");
		feeRouter = await FeeRouter.deploy(await waifu.getAddress(), await staking.getAddress(), platform.address);
		await feeRouter.waitForDeployment();

		const config = {
			buyFee: 200,
			sellFee: 200,
			curveLimit: CURVE_LIMIT,
			minWAIFUAmount: ethers.parseEther("1"),
			maxWAIFUAmount: ethers.parseEther("10000000"),
			minTotalSupply: 1000,
			maxTotalSupply: ethers.parseEther("1000000000000"),
			minDecimal: 18,
			maxDecimal: 18,
		};

		const WaifuFunV2 = await ethers.getContractFactory("WaifuFunV2");
		waifuFun = await WaifuFunV2.deploy(
			await waifu.getAddress(),
			await feeRouter.getAddress(),
			await mockRouter.getAddress(),
			config,
		);
		await waifuFun.waitForDeployment();

		const Factory = await ethers.getContractFactory("AgentTokenFactoryV2");
		factory = await Factory.deploy(await waifuFun.getAddress(), await feeRouter.getAddress());
		await factory.waitForDeployment();

		await feeRouter.setAuthorizedCaller(await waifuFun.getAddress(), true);
		await staking.setRewardDistributor(owner.address);
		await waifuFun.updateFactory(await factory.getAddress());
		await feeRouter.setAuthorizedCaller(await factory.getAddress(), true);

		await waifu.connect(alice).approve(await waifuFun.getAddress(), ethers.MaxUint256);
		await waifu.connect(bob).approve(await waifuFun.getAddress(), ethers.MaxUint256);
		await waifu.connect(alice).approve(await staking.getAddress(), ethers.MaxUint256);
		await waifu.connect(bob).approve(await staking.getAddress(), ethers.MaxUint256);
	});

	it("should deploy full V2 system", async () => {
		expect(await waifuFun.getAddress()).to.be.properAddress;
		expect(await factory.getAddress()).to.be.properAddress;
		expect(await feeRouter.getAddress()).to.be.properAddress;
		expect(await staking.getAddress()).to.be.properAddress;
	});

	it("should create agent token with correct supply split", async () => {
		await factory.createAgent("TestAgent", "AGENT", TOTAL_SUPPLY, treasury.address);
		const tokens = await factory.getAgentTokens();
		expect(tokens.length).to.equal(1);

		const agentToken = await ethers.getContractAt("AgentToken", tokens[0]);
		expect(await agentToken.balanceOf(await waifuFun.getAddress())).to.equal((TOTAL_SUPPLY * 80n) / 100n);
		expect(await agentToken.balanceOf(treasury.address)).to.equal((TOTAL_SUPPLY * 10n) / 100n);
	});

	it("should track multiple agents by creator", async () => {
		await factory.createAgent("Agent1", "AG1", TOTAL_SUPPLY, treasury.address);
		await factory.createAgent("Agent2", "AG2", TOTAL_SUPPLY, treasury.address);
		expect(await factory.totalAgents()).to.equal(2);
		expect((await factory.getAgentsByCreator(owner.address)).length).to.equal(2);
	});

	it("should stake and earn rewards", async () => {
		const stakeAmount = ethers.parseEther("10000");
		const rewardAmount = ethers.parseEther("500");

		await staking.connect(alice).stake(stakeAmount);
		await staking.connect(bob).stake(stakeAmount);

		await waifu.transfer(await staking.getAddress(), rewardAmount);
		await staking.notifyRewardAmount(rewardAmount);

		expect(await staking.earned(alice.address)).to.equal(rewardAmount / 2n);
		expect(await staking.earned(bob.address)).to.equal(rewardAmount / 2n);
	});

	it("should allow exit (withdraw + claim)", async () => {
		const stakeAmount = ethers.parseEther("5000");
		const rewardAmount = ethers.parseEther("100");

		await staking.connect(alice).stake(stakeAmount);
		await waifu.transfer(await staking.getAddress(), rewardAmount);
		await staking.notifyRewardAmount(rewardAmount);

		const balBefore = await waifu.balanceOf(alice.address);
		await staking.connect(alice).exit();
		const balAfter = await waifu.balanceOf(alice.address);

		expect(balAfter - balBefore).to.equal(stakeAmount + rewardAmount);
		expect(await staking.balanceOf(alice.address)).to.equal(0);
	});
});
