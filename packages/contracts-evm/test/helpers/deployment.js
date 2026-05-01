const { ethers } = require("hardhat");
const { deployProxy } = require("hardhat-libutils");
const { getDeploymentParams } = require("../../scripts/params");

function normalizeGlobalConfig(config) {
	return {
		teamWallet: config.teamWallet,
		buyFee: Number(config.buyFee.toString()),
		sellFee: Number(config.sellFee.toString()),
		curveLimit: config.curveLimit.toString(),
		initBondingCurveRate: Number(config.initBondingCurveRate.toString()),
		minETHAmount: config.minETHAmount.toString(),
		maxETHAmount: config.maxETHAmount.toString(),
		minTotalSupply: Number(config.minTotalSupply.toString()),
		maxTotalSupply: Number(config.maxTotalSupply.toString()),
		minDecimal: Number(config.minDecimal.toString()),
		maxDecimal: Number(config.maxDecimal.toString()),
	};
}

function parseDeployment() {
	if (!process.env.WAIFUFUN_DEPLOYMENT) {
		return null;
	}

	return JSON.parse(process.env.WAIFUFUN_DEPLOYMENT);
}

async function setupWaifuFunSuite() {
	const [deployer, user_1, user_2, fallbackTeamWallet] = await ethers.getSigners();

	const deployment = parseDeployment();

	if (deployment) {
		const WaifuFun = await ethers.getContractAt("WaifuFun", deployment.waifuFun, deployer);
		const WaifuFunTokenFactory = await ethers.getContractAt(
			"WaifuFunTokenFactory",
			deployment.waifuFunTokenFactory,
			deployer,
		);
		const globalConfig = deployment.globalConfig
			? normalizeGlobalConfig(deployment.globalConfig)
			: normalizeGlobalConfig(await WaifuFun.globalConfig());
		const teamWallet =
			[deployer, user_1, user_2, fallbackTeamWallet].find(
				(signer) => signer && signer.address.toLowerCase() === globalConfig.teamWallet.toLowerCase(),
			) || fallbackTeamWallet;

		return {
			deployer,
			user_1,
			user_2,
			teamWallet,
			WaifuFun,
			WaifuFunTokenFactory,
			globalConfig,
			deployment,
		};
	}

	const teamWallet = fallbackTeamWallet || user_2 || user_1 || deployer;
	const globalConfig = normalizeGlobalConfig(getDeploymentParams());
	globalConfig.teamWallet = teamWallet.address;

	const WaifuFunTokenFactory = await deployProxy("WaifuFunTokenFactory", "WaifuFunTokenFactory");
	const WaifuFun = await deployProxy("WaifuFun", "WaifuFun", [globalConfig]);

	await WaifuFunTokenFactory.transferOwnership(WaifuFun.address);
	await WaifuFun.updateFactory(WaifuFunTokenFactory.address);

	return {
		deployer,
		user_1,
		user_2,
		teamWallet,
		WaifuFun,
		WaifuFunTokenFactory,
		globalConfig,
		deployment: {
			owner: deployer.address,
			waifuFun: WaifuFun.address,
			waifuFunTokenFactory: WaifuFunTokenFactory.address,
			globalConfig,
		},
	};
}

module.exports = {
	normalizeGlobalConfig,
	setupWaifuFunSuite,
};
