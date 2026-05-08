require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	defaultNetwork: "hardhat",
	networks: {
		hardhat: {
			forking:
				process.env.FORK_BSC === "true"
					? {
							url: process.env.FORK_BSC_URL || "https://bsc-dataseed1.binance.org/",
							blockNumber: process.env.FORK_BSC_BLOCK ? Number.parseInt(process.env.FORK_BSC_BLOCK) : undefined,
						}
					: undefined,
			chainId: 31337,
		},
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
		bscMainnet: {
			url: process.env.BSC_RPC || "https://bsc-dataseed1.binance.org/",
			chainId: 56,
			accounts: process.env.DEPLOYER ? [process.env.DEPLOYER] : [],
		},
		bscTestnet: {
			url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
			chainId: 97,
			accounts: process.env.DEPLOYER ? [process.env.DEPLOYER] : [],
		},
	},
	etherscan: {
		apiKey: {
			bsc: process.env.BSCSCAN_API_KEY || "",
			bscTestnet: process.env.BSCSCAN_API_KEY || "",
		},
	},
	solidity: {
		version: "0.8.24",
		settings: {
			viaIR: true,
			optimizer: {
				enabled: true,
				runs: 200,
			},
		},
	},
	mocha: {
		timeout: 200000,
	},
};
