const { ethers, upgrades } = require("hardhat");
const { getDeploymentParams } = require("../../scripts/params");

function normalizeGlobalConfig(config) {
	return {
		teamWallet: config.teamWallet,
		buyFee: Number(config.buyFee.toString()),
		sellFee: Number(config.sellFee.toString()),
		curveLimit: BigInt(config.curveLimit.toString()),
		initBondingCurveRate: Number(config.initBondingCurveRate.toString()),
		minETHAmount: BigInt(config.minETHAmount.toString()),
		maxETHAmount: BigInt(config.maxETHAmount.toString()),
		minTotalSupply: Number(config.minTotalSupply.toString()),
		maxTotalSupply: BigInt(config.maxTotalSupply.toString()),
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
				(signer) => signer?.address.toLowerCase() === globalConfig.teamWallet.toLowerCase(),
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

	const WaifuFunTokenFactoryCF = await ethers.getContractFactory("WaifuFunTokenFactory");
	const WaifuFunTokenFactory = await upgrades.deployProxy(WaifuFunTokenFactoryCF, [], {
		initializer: "initialize",
	});
	await WaifuFunTokenFactory.waitForDeployment();

	const WaifuFunCF = await ethers.getContractFactory("WaifuFun");
	const WaifuFun = await upgrades.deployProxy(WaifuFunCF, [globalConfig], {
		initializer: "initialize",
	});
	await WaifuFun.waitForDeployment();

	const factoryAddr = await WaifuFunTokenFactory.getAddress();
	const waifuAddr = await WaifuFun.getAddress();

	await (await WaifuFunTokenFactory.transferOwnership(waifuAddr)).wait();
	await (await WaifuFun.updateFactory(factoryAddr)).wait();

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
			waifuFun: waifuAddr,
			waifuFunTokenFactory: factoryAddr,
			globalConfig,
		},
	};
}

module.exports = {
	normalizeGlobalConfig,
	setupWaifuFunSuite,
};
