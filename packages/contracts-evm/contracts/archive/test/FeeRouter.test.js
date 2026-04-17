const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("FeeRouter", function () {
  let waifu, feeRouter, staking, owner, platform, agentTreasury, caller;
  const FEE_AMOUNT = ethers.utils.parseEther("1000");

  beforeEach(async function () {
    [owner, platform, agentTreasury, caller] = await ethers.getSigners();

    // Mock WAIFU
    const Token = await ethers.getContractFactory("WaifuFunToken");
    waifu = await Token.deploy("Waifu", "WAIFU", ethers.utils.parseEther("1000000000"), 18);
    await waifu.deployed();
    await waifu.mintToken(caller.address, ethers.utils.parseEther("1000000"));

    // Deploy staking
    const Staking = await ethers.getContractFactory("VeWaifuStaking");
    staking = await Staking.deploy(waifu.address);
    await staking.deployed();

    // Deploy fee router
    const FeeRouter = await ethers.getContractFactory("FeeRouter");
    feeRouter = await FeeRouter.deploy(waifu.address, staking.address, platform.address);
    await feeRouter.deployed();

    // Configure
    await feeRouter.setAuthorizedCaller(caller.address, true);
    await staking.setRewardDistributor(feeRouter.address);

    // Register agent treasury
    const agentToken = ethers.Wallet.createRandom().address;
    await feeRouter.setAgentTreasury(agentToken, agentTreasury.address);

    // Approve fee router
    await waifu.connect(caller).approve(feeRouter.address, ethers.constants.MaxUint256);

    // Store for tests
    this.agentToken = agentToken;
  });

  it("should split fees 50/25/25", async function () {
    // Need a staker first so notifyRewardAmount doesn't revert
    await waifu.mintToken(owner.address, ethers.utils.parseEther("10000"));
    await waifu.approve(staking.address, ethers.constants.MaxUint256);
    await staking.stake(ethers.utils.parseEther("1000"));

    const treasuryBefore = await waifu.balanceOf(agentTreasury.address);
    const platformBefore = await waifu.balanceOf(platform.address);

    await feeRouter.connect(caller).distributeFees(this.agentToken, FEE_AMOUNT);

    const treasuryAfter = await waifu.balanceOf(agentTreasury.address);
    const platformAfter = await waifu.balanceOf(platform.address);

    // 50% to agent treasury
    expect(treasuryAfter.sub(treasuryBefore)).to.be.closeTo(
      FEE_AMOUNT.div(2), ethers.utils.parseEther("1") // allow 1 token rounding
    );
    // 25% to platform
    expect(platformAfter.sub(platformBefore)).to.equal(FEE_AMOUNT.div(4));
  });

  it("should revert from unauthorized caller", async function () {
    await expect(feeRouter.distributeFees(this.agentToken, FEE_AMOUNT))
      .to.be.reverted;
  });
});
