/**
 * @type import('hardhat/config').HardhatUserConfig
 */
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("dotenv").config();
const { subtask } = require("hardhat/config");
const {
	TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS,
} = require("hardhat/builtin-tasks/task-names");

// Skip compiling anything under contracts/archive/
// (legacy V1/V2 launchpad suite preserved for reference only).
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, __, runSuper) => {
	const paths = await runSuper();
	return paths.filter((p) => !p.includes("/contracts/archive/"));
});

module.exports = {
	defaultNetwork: "hardhat",
	paths: {
		sources: "./contracts",
		// archived V1/V2 launchpad sources live under contracts/archive/ and are
		// excluded by the TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS subtask above.
	},
	networks: {
		hardhat: {
			forking: process.env.FORK_BSC === "true" ? {
				url: process.env.FORK_BSC_URL || "https://bsc-dataseed1.binance.org/",
			} : undefined,
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
		compilers: [
			{
				version: "0.8.20",
				settings: {
					viaIR: true,
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
