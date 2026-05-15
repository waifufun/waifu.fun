require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-verify");
require("@openzeppelin/hardhat-upgrades");
require("hardhat-contract-sizer");
require("solidity-coverage");
require("dotenv").config();

const forkBsc = process.env.FORK_BSC === "true";

// Wave H deploy scripts read PRIVATE_KEY; we accept DEPLOYER as a back-compat
// alias for the legacy V2 scripts that have been deleted. Prefer PRIVATE_KEY.
const deployerKey = process.env.PRIVATE_KEY || process.env.DEPLOYER;
const accounts = deployerKey ? [deployerKey] : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
	defaultNetwork: "hardhat",
	networks: {
		hardhat: {
			forking: forkBsc
				? {
						url: process.env.FORK_BSC_URL || "https://bsc-dataseed1.binance.org/",
						blockNumber: process.env.FORK_BSC_BLOCK ? Number.parseInt(process.env.FORK_BSC_BLOCK) : undefined,
					}
				: undefined,
			accounts: {
				// wave H real-fork tests use signers 0..16; bump default 20 to 25
				// to give headroom for additional tier-95/98 depositor sets.
				count: 25,
				accountsBalance: "10000000000000000000000", // 10k BNB each (tier 98 needs 160 BNB)
			},
			chainId: forkBsc ? 56 : 31337,
			chains: {
				56: {
					hardforkHistory: {
						shanghai: 0,
					},
				},
			},
		},
		localhost: {
			url: process.env.ETH_RPC || "http://127.0.0.1:8545",
			chainId: 31337,
			accounts: accounts.length ? accounts : undefined,
		},
		bscMainnet: {
			url: process.env.BSC_RPC_URL || process.env.BSC_RPC || "https://bsc-dataseed1.binance.org/",
			chainId: 56,
			accounts,
		},
		bscTestnet: {
			url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
			chainId: 97,
			accounts,
		},
	},
	// Etherscan V2 unified API: one key works across all supported chains
	// (BSC, Polygon, Arbitrum, Base, Optimism, etc.). Get a key at
	// https://etherscan.io/myapikey. Set BSCSCAN_API_KEY (legacy name kept
	// for back-compat) or ETHERSCAN_API_KEY in env.
	etherscan: {
		apiKey: process.env.ETHERSCAN_API_KEY || process.env.BSCSCAN_API_KEY || "",
	},
	sourcify: {
		enabled: true,
		apiUrl: "https://sourcify.dev/server",
		browserUrl: "https://repo.sourcify.dev",
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
