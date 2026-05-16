const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VeWaifuStaking", () => {
	let waifu;
	let staking;
	let owner;
	let alice;
	let bob;
	const STAKE_AMOUNT = ethers.parseEther("1000");
	const REWARD_AMOUNT = ethers.parseEther("100");

	beforeEach(async () => {
		[owner, alice, bob] = await ethers.getSigners();

		// ERC20Mock has the same staking-relevant surface (transfer, approve,
		// balanceOf) as the deprecated WaifuFunToken used to. We just need an
		// ERC20 to stake; the exact contract doesn't matter for VeWaifuStaking.
		const Token = await ethers.getContractFactory("ERC20Mock");
		waifu = await Token.deploy();
		await waifu.waitForDeployment();

		await waifu.mint(owner.address, ethers.parseEther("100000"));
		await waifu.mint(alice.address, ethers.parseEther("100000"));
		await waifu.mint(bob.address, ethers.parseEther("100000"));

		const Staking = await ethers.getContractFactory("VeWaifuStaking");
		staking = await Staking.deploy(await waifu.getAddress());
		await staking.waitForDeployment();
		await staking.setRewardDistributor(owner.address);

		await waifu.connect(alice).approve(await staking.getAddress(), ethers.MaxUint256);
		await waifu.connect(bob).approve(await staking.getAddress(), ethers.MaxUint256);
		await waifu.approve(await staking.getAddress(), ethers.MaxUint256);
	});

	it("rejects zero token deployment", async () => {
		const Staking = await ethers.getContractFactory("VeWaifuStaking");
		await expect(Staking.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(Staking, "ZeroAddress");
	});

	it("should stake WAIFU", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		expect(await staking.balanceOf(alice.address)).to.equal(STAKE_AMOUNT);
		expect(await staking.totalStaked()).to.equal(STAKE_AMOUNT);
	});

	it("should withdraw WAIFU", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await staking.connect(alice).withdraw(STAKE_AMOUNT);
		expect(await staking.balanceOf(alice.address)).to.equal(0);
	});

	it("should revert on zero stake", async () => {
		await expect(staking.connect(alice).stake(0)).to.be.reverted;
	});

	it("should distribute rewards to single staker", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await staking.notifyRewardAmount(REWARD_AMOUNT);
		expect(await staking.earned(alice.address)).to.equal(REWARD_AMOUNT);
	});

	it("should distribute rewards proportionally to multiple stakers", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await staking.connect(bob).stake(STAKE_AMOUNT);
		await staking.notifyRewardAmount(REWARD_AMOUNT);
		expect(await staking.earned(alice.address)).to.equal(REWARD_AMOUNT / 2n);
		expect(await staking.earned(bob.address)).to.equal(REWARD_AMOUNT / 2n);
	});

	it("should claim rewards", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await staking.notifyRewardAmount(REWARD_AMOUNT);
		const balBefore = await waifu.balanceOf(alice.address);
		await staking.connect(alice).claimReward();
		const balAfter = await waifu.balanceOf(alice.address);
		expect(balAfter - balBefore).to.equal(REWARD_AMOUNT);
	});

	it("should exit (withdraw all + claim)", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await staking.notifyRewardAmount(REWARD_AMOUNT);
		await staking.connect(alice).exit();
		expect(await staking.balanceOf(alice.address)).to.equal(0);
		expect(await staking.earned(alice.address)).to.equal(0);
	});

	it("should revert notifyRewardAmount from non-distributor", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await expect(staking.connect(alice).notifyRewardAmount(REWARD_AMOUNT)).to.be.reverted;
	});

	it("should revert notifyRewardAmount with no stakers", async () => {
		await expect(staking.notifyRewardAmount(REWARD_AMOUNT)).to.be.reverted;
	});

	it("should revert notifyRewardAmount when distributor has not approved reward funding", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await staking.setRewardDistributor(bob.address);
		await waifu.connect(bob).approve(await staking.getAddress(), 0);
		await expect(staking.connect(bob).notifyRewardAmount(REWARD_AMOUNT)).to.be.reverted;
	});

	it("credits fee-on-transfer stakes by received balance", async () => {
		const Token = await ethers.getContractFactory("ERC20FeeMock");
		const taxed = await Token.deploy();
		await taxed.mint(alice.address, STAKE_AMOUNT);
		await taxed.setTransferTaxBps(1000);

		const Staking = await ethers.getContractFactory("VeWaifuStaking");
		const taxedStaking = await Staking.deploy(await taxed.getAddress());
		await taxedStaking.setRewardDistributor(owner.address);
		await taxed.connect(alice).approve(await taxedStaking.getAddress(), ethers.MaxUint256);

		await taxedStaking.connect(alice).stake(STAKE_AMOUNT);
		expect(await taxedStaking.balanceOf(alice.address)).to.equal(ethers.parseEther("900"));
		expect(await taxedStaking.totalStaked()).to.equal(ethers.parseEther("900"));
	});

	it("distributes fee-on-transfer rewards by received balance", async () => {
		const Token = await ethers.getContractFactory("ERC20FeeMock");
		const taxed = await Token.deploy();
		await taxed.mint(owner.address, REWARD_AMOUNT);
		await taxed.mint(alice.address, STAKE_AMOUNT);
		await taxed.setTransferTaxBps(1000);

		const Staking = await ethers.getContractFactory("VeWaifuStaking");
		const taxedStaking = await Staking.deploy(await taxed.getAddress());
		await taxedStaking.setRewardDistributor(owner.address);
		await taxed.approve(await taxedStaking.getAddress(), ethers.MaxUint256);
		await taxed.connect(alice).approve(await taxedStaking.getAddress(), ethers.MaxUint256);

		await taxedStaking.connect(alice).stake(STAKE_AMOUNT);
		await taxedStaking.notifyRewardAmount(REWARD_AMOUNT);
		expect(await taxedStaking.earned(alice.address)).to.equal(ethers.parseEther("90"));
	});
});
