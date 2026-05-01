const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VeWaifuStaking", () => {
	let waifu;
	let staking;
	let owner;
	let alice;
	let bob;
	const STAKE_AMOUNT = ethers.utils.parseEther("1000");
	const REWARD_AMOUNT = ethers.utils.parseEther("100");

	beforeEach(async () => {
		[owner, alice, bob] = await ethers.getSigners();

		// Deploy mock WAIFU
		const Token = await ethers.getContractFactory("WaifuFunToken");
		waifu = await Token.deploy("Waifu", "WAIFU", ethers.utils.parseEther("1000000000"), 18);
		await waifu.deployed();

		// Distribute tokens
		await waifu.mintToken(owner.address, ethers.utils.parseEther("100000"));
		await waifu.mintToken(alice.address, ethers.utils.parseEther("100000"));
		await waifu.mintToken(bob.address, ethers.utils.parseEther("100000"));

		// Deploy staking
		const Staking = await ethers.getContractFactory("VeWaifuStaking");
		staking = await Staking.deploy(waifu.address);
		await staking.deployed();
		await staking.setRewardDistributor(owner.address);

		// Approve
		await waifu.connect(alice).approve(staking.address, ethers.constants.MaxUint256);
		await waifu.connect(bob).approve(staking.address, ethers.constants.MaxUint256);
		await waifu.approve(staking.address, ethers.constants.MaxUint256);
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
		// Send reward tokens to staking contract
		await waifu.transfer(staking.address, REWARD_AMOUNT);
		await staking.notifyRewardAmount(REWARD_AMOUNT);
		expect(await staking.earned(alice.address)).to.equal(REWARD_AMOUNT);
	});

	it("should distribute rewards proportionally to multiple stakers", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await staking.connect(bob).stake(STAKE_AMOUNT);
		await waifu.transfer(staking.address, REWARD_AMOUNT);
		await staking.notifyRewardAmount(REWARD_AMOUNT);
		// 50/50 split
		const aliceEarned = await staking.earned(alice.address);
		const bobEarned = await staking.earned(bob.address);
		expect(aliceEarned).to.equal(REWARD_AMOUNT.div(2));
		expect(bobEarned).to.equal(REWARD_AMOUNT.div(2));
	});

	it("should claim rewards", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await waifu.transfer(staking.address, REWARD_AMOUNT);
		await staking.notifyRewardAmount(REWARD_AMOUNT);
		const balBefore = await waifu.balanceOf(alice.address);
		await staking.connect(alice).claimReward();
		const balAfter = await waifu.balanceOf(alice.address);
		expect(balAfter.sub(balBefore)).to.equal(REWARD_AMOUNT);
	});

	it("should exit (withdraw all + claim)", async () => {
		await staking.connect(alice).stake(STAKE_AMOUNT);
		await waifu.transfer(staking.address, REWARD_AMOUNT);
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
});
