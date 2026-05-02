const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeRouter", () => {
	let waifu;
	let feeRouter;
	let staking;
	let owner;
	let platform;
	let agentTreasury;
	let caller;
	const FEE_AMOUNT = ethers.parseEther("1000");

	beforeEach(async function () {
		[owner, platform, agentTreasury, caller] = await ethers.getSigners();

		const Token = await ethers.getContractFactory("WaifuFunToken");
		waifu = await Token.deploy("Waifu", "WAIFU", ethers.parseEther("1000000000"), 18);
		await waifu.waitForDeployment();
		await waifu.mintToken(caller.address, ethers.parseEther("1000000"));

		const Staking = await ethers.getContractFactory("VeWaifuStaking");
		staking = await Staking.deploy(await waifu.getAddress());
		await staking.waitForDeployment();

		const FeeRouter = await ethers.getContractFactory("FeeRouter");
		feeRouter = await FeeRouter.deploy(await waifu.getAddress(), await staking.getAddress(), platform.address);
		await feeRouter.waitForDeployment();

		await feeRouter.setAuthorizedCaller(caller.address, true);
		await staking.setRewardDistributor(await feeRouter.getAddress());

		const agentToken = ethers.Wallet.createRandom().address;
		await feeRouter.setAgentTreasury(agentToken, agentTreasury.address);

		await waifu.connect(caller).approve(await feeRouter.getAddress(), ethers.MaxUint256);

		this.agentToken = agentToken;
	});

	it("should split fees 50/25/25", async function () {
		await waifu.mintToken(owner.address, ethers.parseEther("10000"));
		await waifu.approve(await staking.getAddress(), ethers.MaxUint256);
		await staking.stake(ethers.parseEther("1000"));

		const treasuryBefore = await waifu.balanceOf(agentTreasury.address);
		const platformBefore = await waifu.balanceOf(platform.address);

		await feeRouter.connect(caller).distributeFees(this.agentToken, FEE_AMOUNT);

		const treasuryAfter = await waifu.balanceOf(agentTreasury.address);
		const platformAfter = await waifu.balanceOf(platform.address);

		const treasuryDelta = treasuryAfter - treasuryBefore;
		const half = FEE_AMOUNT / 2n;
		const tol = ethers.parseEther("1");
		expect(treasuryDelta >= half - tol && treasuryDelta <= half + tol).to.equal(true);
		expect(platformAfter - platformBefore).to.equal(FEE_AMOUNT / 4n);
	});

	it("should revert from unauthorized caller", async function () {
		await expect(feeRouter.distributeFees(this.agentToken, FEE_AMOUNT)).to.be.reverted;
	});
});
