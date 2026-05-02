const { ethers } = require("hardhat");

async function getCurrentTimestamp() {
	const block = await ethers.provider.getBlock("latest");
	if (!block) throw new Error("Missing latest block");
	return BigInt(block.timestamp);
}

async function getETHBalance(address) {
	return ethers.provider.getBalance(address);
}

function bigNum(amount, decimals) {
	return BigInt(amount) * 10n ** BigInt(decimals);
}

function smallNum(wei) {
	return Number(ethers.formatEther(wei));
}

module.exports = {
	getCurrentTimestamp,
	getETHBalance,
	bigNum,
	smallNum,
};
