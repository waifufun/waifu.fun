/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("dotenv").config();

module.exports = {
	defaultNetwork: "hardhat",
	networks: {
		localhost: {
			url: process.env.ETH_RPC || "http://127.0.0.1:8545",
			chainId: 31337,
			accounts: process.env.DEPLOYER ? [process.env.DEPLOYER] : undefined,
		},
		mainnet: {
			url: process.env.ETH_RPC || "http://127.0.0.1:8545",
			chainId: 1,
			accounts: process.env.DEPLOYER ? [process.env.DEPLOYER] : undefined,
		},
	},
	solidity: {
		compilers: [
			{
				version: "0.8.20",
				settings: {
					optimizer: {
						enabled: true,
						runs: 200,
					},
				},
			},
		],
	},
	mocha: {
		timeout: 200000,
	},
};
