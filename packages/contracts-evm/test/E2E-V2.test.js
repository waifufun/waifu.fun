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

	const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000");
	const CURVE_LIMIT = ethers.utils.parseEther("1000");

	beforeEach(async () => {
		[owner, alice, bob, platform, treasury] = await ethers.getSigners();

		const Token = await ethers.getContractFactory("WaifuFunToken");
		waifu = await Token.deploy("Waifu", "WAIFU", ethers.utils.parseEther("10000000000"), 18);
		await waifu.mintToken(owner.address, ethers.utils.parseEther("1000000"));
		await waifu.mintToken(alice.address, ethers.utils.parseEther("1000000"));
		await waifu.mintToken(bob.address, ethers.utils.parseEther("1000000"));

		const MockFactory = await ethers.getContractFactory("MockPancakeFactory");
		const mockFactory = await MockFactory.deploy();
		const MockRouter = await ethers.getContractFactory("MockPancakeRouter");
		const mockRouter = await MockRouter.deploy(mockFactory.address);

		const Staking = await ethers.getContractFactory("VeWaifuStaking");
		staking = await Staking.deploy(waifu.address);

		const FeeRouter = await ethers.getContractFactory("FeeRouter");
		feeRouter = await FeeRouter.deploy(waifu.address, staking.address, platform.address);

		// ConfigParams struct: buyFee, sellFee, curveLimit, minWAIFU, maxWAIFU, minSupply, maxSupply, minDec, maxDec
		const config = [
			200, // buyFee (2%)
			200, // sellFee (2%)
			CURVE_LIMIT, // curveLimit
			ethers.utils.parseEther("1"), // minWAIFUAmount
			ethers.utils.parseEther("10000000"), // maxWAIFUAmount
			1000, // minTotalSupply
			ethers.utils.parseEther("1000000000000"), // maxTotalSupply
			18, // minDecimal
			18, // maxDecimal
		];

		const WaifuFunV2 = await ethers.getContractFactory("WaifuFunV2");
		waifuFun = await WaifuFunV2.deploy(waifu.address, feeRouter.address, mockRouter.address, config);

		const Factory = await ethers.getContractFactory("AgentTokenFactoryV2");
		factory = await Factory.deploy(waifuFun.address, feeRouter.address);

		await feeRouter.setAuthorizedCaller(waifuFun.address, true);
		await staking.setRewardDistributor(owner.address);
		await waifuFun.updateFactory(factory.address);
		await feeRouter.setAuthorizedCaller(factory.address, true);

		await waifu.connect(alice).approve(waifuFun.address, ethers.constants.MaxUint256);
		await waifu.connect(bob).approve(waifuFun.address, ethers.constants.MaxUint256);
		await waifu.connect(alice).approve(staking.address, ethers.constants.MaxUint256);
		await waifu.connect(bob).approve(staking.address, ethers.constants.MaxUint256);
	});

	it("should deploy full V2 system", async () => {
		expect(waifuFun.address).to.be.properAddress;
		expect(factory.address).to.be.properAddress;
		expect(feeRouter.address).to.be.properAddress;
		expect(staking.address).to.be.properAddress;
	});

	it("should create agent token with correct supply split", async () => {
		await factory.createAgent("TestAgent", "AGENT", TOTAL_SUPPLY, treasury.address);
		const tokens = await factory.getAgentTokens();
		expect(tokens.length).to.equal(1);

		const agentToken = await ethers.getContractAt("AgentToken", tokens[0]);
		expect(await agentToken.balanceOf(waifuFun.address)).to.equal(TOTAL_SUPPLY.mul(80).div(100));
		expect(await agentToken.balanceOf(treasury.address)).to.equal(TOTAL_SUPPLY.mul(10).div(100));
	});

	it("should track multiple agents by creator", async () => {
		await factory.createAgent("Agent1", "AG1", TOTAL_SUPPLY, treasury.address);
		await factory.createAgent("Agent2", "AG2", TOTAL_SUPPLY, treasury.address);
		expect(await factory.totalAgents()).to.equal(2);
		expect((await factory.getAgentsByCreator(owner.address)).length).to.equal(2);
	});

	it("should stake and earn rewards", async () => {
		const stakeAmount = ethers.utils.parseEther("10000");
		const rewardAmount = ethers.utils.parseEther("500");

		await staking.connect(alice).stake(stakeAmount);
		await staking.connect(bob).stake(stakeAmount);

		await waifu.transfer(staking.address, rewardAmount);
		await staking.notifyRewardAmount(rewardAmount);

		expect(await staking.earned(alice.address)).to.equal(rewardAmount.div(2));
		expect(await staking.earned(bob.address)).to.equal(rewardAmount.div(2));
	});

	it("should allow exit (withdraw + claim)", async () => {
		const stakeAmount = ethers.utils.parseEther("5000");
		const rewardAmount = ethers.utils.parseEther("100");

		await staking.connect(alice).stake(stakeAmount);
		await waifu.transfer(staking.address, rewardAmount);
		await staking.notifyRewardAmount(rewardAmount);

		const balBefore = await waifu.balanceOf(alice.address);
		await staking.connect(alice).exit();
		const balAfter = await waifu.balanceOf(alice.address);

		expect(balAfter.sub(balBefore)).to.equal(stakeAmount.add(rewardAmount));
		expect(await staking.balanceOf(alice.address)).to.equal(0);
	});
});
