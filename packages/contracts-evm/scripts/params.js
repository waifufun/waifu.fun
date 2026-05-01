const { network, ethers } = require("hardhat");

const DEPLOY_PARAMS = {
	mainnet: {
		teamWallet: "0x14AeDaF3Abd19C1279388A9b222Cf32Dd57A5D6e",
		buyFee: 30, // 100% = 10,000, 30 = 0.3%
		sellFee: 50, // 0.5%,
		curveLimit: ethers.utils.parseEther("1"),
		initBondingCurveRate: 750000, // 100% = 1,000,000, 300000 = 30%
		minETHAmount: ethers.utils.parseEther("0.1"),
		maxETHAmount: ethers.utils.parseEther("5"),
		minTotalSupply: 10000, // amount that divided by 10**decimals
		maxTotalSupply: 1000000, // amount that divided by 10**decimals
		minDecimal: 6,
		maxDecimal: 18,
	},
};

const getDeploymentParams = (network_name = network.name) => {
	if (network_name === "mainnet" || network_name === "hardhat" || network_name === "localhost") {
		return DEPLOY_PARAMS.mainnet;
	}
	return {};
};

module.exports = {
	getDeploymentParams,
};
