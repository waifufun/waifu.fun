const { ethers } = require("hardhat");
const addresses = require("../../scripts/addresses");

/**
 * Deploy a mock WAIFU ERC-20 token for testing
 */
async function deployMockWaifu(deployer, initialSupply) {
	const supply = initialSupply || ethers.utils.parseEther("1000000000"); // 1B
	const MockToken = await ethers.getContractFactory("WaifuFunToken");
	const token = await MockToken.deploy("Waifu", "WAIFU", supply, 18);
	await token.deployed();
	// Transfer supply from token contract to deployer
	await token.mintToken(deployer.address, supply);
	return token;
}

/**
 * Deploy the full V2 system with mock WAIFU on local/fork
 */
async function deployV2System(deployer, overrides = {}) {
	const platformWallet = overrides.platformWallet || deployer.address;
	const pancakeRouter = overrides.pancakeRouter || addresses.bscMainnet.pancakeRouter;
	const pancakeFactory = overrides.pancakeFactory || addresses.bscMainnet.pancakeFactory;

	// Mock WAIFU token
	const waifu = await deployMockWaifu(deployer);

	// VeWaifuStaking
	const VeWaifuStaking = await ethers.getContractFactory("VeWaifuStaking");
	const staking = await VeWaifuStaking.deploy(waifu.address);
	await staking.deployed();

	// FeeRouter
	const FeeRouter = await ethers.getContractFactory("FeeRouter");
	const feeRouter = await FeeRouter.deploy(waifu.address, staking.address, platformWallet);
	await feeRouter.deployed();

	// WaifuFunV2
	const WaifuFunV2 = await ethers.getContractFactory("WaifuFunV2");
	const config = overrides.config || {
		teamWallet: platformWallet,
		buyFee: 200,
		sellFee: 200,
		curveLimit: ethers.utils.parseEther("1000"), // 1K WAIFU for tests
		initBondingCurveRate: 800000,
		minWAIFUAmount: ethers.utils.parseEther("1"),
		maxWAIFUAmount: ethers.utils.parseEther("10000000"),
		minTotalSupply: 1000,
		maxTotalSupply: ethers.utils.parseEther("1000000000000"),
		minDecimal: 18,
		maxDecimal: 18,
	};
	const waifuFun = await WaifuFunV2.deploy(waifu.address, pancakeRouter, pancakeFactory, feeRouter.address, config);
	await waifuFun.deployed();

	// AgentTokenFactoryV2
	const AgentTokenFactoryV2 = await ethers.getContractFactory("AgentTokenFactoryV2");
	const factory = await AgentTokenFactoryV2.deploy(waifuFun.address, feeRouter.address);
	await factory.deployed();

	// Wire everything
	await feeRouter.setAuthorizedCaller(waifuFun.address);
	await staking.setRewardDistributor(feeRouter.address);
	await waifuFun.updateFactory(factory.address);

	return {
		waifu,
		staking,
		feeRouter,
		waifuFun,
		factory,
		config,
		platformWallet,
	};
}

/**
 * Mint WAIFU tokens to an address
 */
async function mintWaifu(waifuToken, to, amount) {
	const amountWei = typeof amount === "string" ? ethers.utils.parseEther(amount) : amount;
	await waifuToken.mintToken(to, amountWei);
}

module.exports = {
	deployMockWaifu,
	deployV2System,
	mintWaifu,
};
