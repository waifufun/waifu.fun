const { network } = require("hardhat");

function buildMainnetParams() {
	const { ethers } = require("hardhat");
	return {
		teamWallet: "0x14AeDaF3Abd19C1279388A9b222Cf32Dd57A5D6e",
		buyFee: 30,
		sellFee: 50,
		curveLimit: ethers.parseEther("1"),
		initBondingCurveRate: 750000,
		minETHAmount: ethers.parseEther("0.1"),
		maxETHAmount: ethers.parseEther("5"),
		minTotalSupply: 10000,
		maxTotalSupply: 1000000,
		minDecimal: 6,
		maxDecimal: 18,
	};
}

const getDeploymentParams = (network_name = network.name) => {
	if (network_name === "mainnet" || network_name === "hardhat" || network_name === "localhost") {
		return buildMainnetParams();
	}
	return {};
};

module.exports = {
	getDeploymentParams,
};
