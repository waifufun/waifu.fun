/**
 * deploy-wave-n.js - deploy LaunchFactory for Wave N (TreasuryLP4 + PCS V3 NPM).
 *
 * Wave N adds three new factory immutables on top of the Wave H / M3 args:
 *   - PCS_V3_NPM        : real PancakeSwap V3 NonfungiblePositionManager
 *   - PCS_V3_FACTORY    : real PancakeSwap V3 Factory
 *   - BNB_USD_FEED      : Chainlink BNB/USD aggregator (8 decimals)
 *
 * Also deploys the new TreasuryLP4Deployer helper, which factors TreasuryLP4
 * creation bytecode out of LaunchFactory to keep it under EIP-170.
 *
 * Per-launch contracts (LaunchVault, BundleRouter, TreasuryLP4, TaxSplitter,
 * AgentSafe) are created by the factory inside createLaunch() at launch time,
 * not here.
 *
 * Usage:
 *   NETWORK=bscMainnet \
 *   PRIVATE_KEY=0x... \
 *   PLATFORM_COMMISSION_RECEIVER=0x... \
 *   FACTORY_OWNER=0xMultisig... \
 *   bunx hardhat run scripts/deploy/deploy-wave-n.js --network bscMainnet
 *
 * Required env (same as wave H):
 *   PRIVATE_KEY                  - deployer EOA, must hold enough BNB
 *   FACTORY_OWNER                - production multisig/timelock that receives
 *                                  LaunchFactory ownership (required on mainnet)
 *   PLATFORM_COMMISSION_RECEIVER - platform fee wallet enforced by factory
 *
 * Optional env (override the BSC mainnet address book):
 *   WBNB, PCS_FACTORY, PCS_ROUTER, FLAP_PORTAL, TOKEN_IMPL_TAXED_V3,
 *   TIP_RECEIVER, SAFE_SINGLETON, SAFE_PROXY_FACTORY,
 *   PCS_V3_NPM, PCS_V3_FACTORY, BNB_USD_FEED
 *
 * Output:
 *   deployments/{network}-wave-n.json - full deployment record incl. factory
 *   address, helper addresses, constructor args, and init code hash.
 */

const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

// ---------------------------------------------------------------------
// BSC mainnet address book (verified PCS V3 + Chainlink BNB/USD)
// ---------------------------------------------------------------------
const BSC_MAINNET = {
	WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
	PCS_FACTORY: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
	PCS_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
	FLAP_PORTAL: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
	TOKEN_IMPL_TAXED_V3: "0x024f18294970B5c76c0691b87f138A0317156422",
	TIP_RECEIVER: "0x4848489f0b2BEdd788c696e2D79b6b69D7484848",
	SAFE_SINGLETON: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
	SAFE_PROXY_FACTORY: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
	// Wave N additions
	PCS_V3_NPM: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
	PCS_V3_FACTORY: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
	BNB_USD_FEED: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE",
};

const BSC_TESTNET = {
	WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
	PCS_FACTORY: "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
	PCS_ROUTER: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
	FLAP_PORTAL: "0x0000000000000000000000000000000000000000",
	TOKEN_IMPL_TAXED_V3: "0x0000000000000000000000000000000000000000",
	TIP_RECEIVER: "0x0000000000000000000000000000000000000000",
	SAFE_SINGLETON: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
	SAFE_PROXY_FACTORY: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
	// PCS V3 testnet addresses (verified against pancakeswap docs)
	PCS_V3_NPM: "0x427bF5b37357632377eCbEC9de3626C71A5396c1",
	PCS_V3_FACTORY: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
	BNB_USD_FEED: "0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526",
};

function deriveFlapInitCodeHash(impl) {
	if (!impl || impl === ethers.ZeroAddress) return ethers.ZeroHash;
	const prefix = "0x3d602d80600a3d3981f3363d3d373d3d3d363d73";
	const suffix = "5af43d82803e903d91602b57fd5bf3";
	const implStripped = impl.slice(2).toLowerCase();
	const bytecode = `${prefix}${implStripped}${suffix}`;
	return ethers.keccak256(bytecode);
}

function resolveAddressBook(networkName) {
	const def = networkName === "bscMainnet" ? BSC_MAINNET : networkName === "bscTestnet" ? BSC_TESTNET : null;
	if (!def) {
		throw new Error(
			`Unsupported network "${networkName}". Use bscMainnet or bscTestnet, or extend resolveAddressBook() with a new entry.`,
		);
	}
	const book = {
		WBNB: process.env.WBNB || def.WBNB,
		PCS_FACTORY: process.env.PCS_FACTORY || def.PCS_FACTORY,
		PCS_ROUTER: process.env.PCS_ROUTER || def.PCS_ROUTER,
		FLAP_PORTAL: process.env.FLAP_PORTAL || def.FLAP_PORTAL,
		TOKEN_IMPL_TAXED_V3: process.env.TOKEN_IMPL_TAXED_V3 || def.TOKEN_IMPL_TAXED_V3,
		TIP_RECEIVER: process.env.TIP_RECEIVER || def.TIP_RECEIVER,
		SAFE_SINGLETON: process.env.SAFE_SINGLETON || def.SAFE_SINGLETON,
		SAFE_PROXY_FACTORY: process.env.SAFE_PROXY_FACTORY || def.SAFE_PROXY_FACTORY,
		PCS_V3_NPM: process.env.PCS_V3_NPM || def.PCS_V3_NPM,
		PCS_V3_FACTORY: process.env.PCS_V3_FACTORY || def.PCS_V3_FACTORY,
		BNB_USD_FEED: process.env.BNB_USD_FEED || def.BNB_USD_FEED,
	};
	const missing = Object.entries(book)
		.filter(([, v]) => !v || v === ethers.ZeroAddress)
		.map(([k]) => k);
	if (missing.length > 0) {
		throw new Error(
			`Missing required address(es) for ${networkName}: ${missing.join(", ")}. Supply via env or extend the default address book.`,
		);
	}
	return book;
}

async function resolveFactoryOwner(networkName, deployerAddress) {
	const configuredOwner = process.env.FACTORY_OWNER;
	if (!configuredOwner && networkName === "bscMainnet") {
		throw new Error("FACTORY_OWNER is required on bscMainnet and must be a multisig/timelock contract.");
	}
	const owner = configuredOwner || deployerAddress;
	if (!ethers.isAddress(owner)) throw new Error(`Invalid FACTORY_OWNER address: ${owner}`);
	if (networkName === "bscMainnet") {
		if (owner.toLowerCase() === deployerAddress.toLowerCase()) {
			throw new Error("FACTORY_OWNER must not be the deployer EOA on bscMainnet.");
		}
		const code = await ethers.provider.getCode(owner);
		if (code === "0x") {
			throw new Error("FACTORY_OWNER must be a deployed multisig/timelock contract on bscMainnet.");
		}
	}
	return ethers.getAddress(owner);
}

async function main() {
	const netName = network.name;
	const book = resolveAddressBook(netName);
	const initCodeHash = deriveFlapInitCodeHash(book.TOKEN_IMPL_TAXED_V3);

	const [deployer] = await ethers.getSigners();
	const balance = await ethers.provider.getBalance(deployer.address);
	const factoryOwner = await resolveFactoryOwner(netName, deployer.address);

	console.log("=== Wave N deploy ===");
	console.log("  network:           ", netName);
	console.log("  deployer:          ", deployer.address);
	console.log("  factory owner:     ", factoryOwner);
	console.log("  balance (BNB):     ", ethers.formatEther(balance));
	console.log("  WBNB:              ", book.WBNB);
	console.log("  PCS factory:       ", book.PCS_FACTORY);
	console.log("  PCS router:        ", book.PCS_ROUTER);
	console.log("  PCS V3 NPM:        ", book.PCS_V3_NPM);
	console.log("  PCS V3 factory:    ", book.PCS_V3_FACTORY);
	console.log("  BNB/USD feed:      ", book.BNB_USD_FEED);
	console.log("  Flap portal:       ", book.FLAP_PORTAL);
	console.log("  TaxToken V3 impl:  ", book.TOKEN_IMPL_TAXED_V3);
	console.log("  tip receiver:      ", book.TIP_RECEIVER);
	console.log("  init code hash:    ", initCodeHash);
	console.log("");

	const platformCommissionReceiver = process.env.PLATFORM_COMMISSION_RECEIVER;
	if (!platformCommissionReceiver || platformCommissionReceiver === ethers.ZeroAddress) {
		throw new Error("PLATFORM_COMMISSION_RECEIVER is required and must be non-zero.");
	}
	console.log("  platform commission receiver:", platformCommissionReceiver);
	console.log("");

	if (process.env.DRY_RUN === "true" || process.env.DRY_RUN === "1") {
		console.log("=== DRY_RUN mode: NOT broadcasting transaction ===");
		console.log("Would deploy RouterDeployer + AgentSafeDeployer + TreasuryLP4Deployer + LaunchFactory.");
		if (factoryOwner.toLowerCase() !== deployer.address.toLowerCase()) {
			console.log(`Would transfer LaunchFactory ownership to ${factoryOwner}.`);
		}
		return;
	}

	// 1. RouterDeployer
	console.log("Deploying RouterDeployer ...");
	const RouterDeployer = await ethers.getContractFactory("RouterDeployer");
	const routerDeployer = await RouterDeployer.deploy();
	await routerDeployer.waitForDeployment();
	const routerDeployerAddress = await routerDeployer.getAddress();
	console.log("RouterDeployer:    ", routerDeployerAddress);

	// 2. AgentSafeDeployer
	console.log("Deploying AgentSafeDeployer ...");
	const AgentSafeDeployer = await ethers.getContractFactory("AgentSafeDeployer");
	const agentSafeDeployer = await AgentSafeDeployer.deploy(book.SAFE_SINGLETON, book.SAFE_PROXY_FACTORY);
	await agentSafeDeployer.waitForDeployment();
	const agentSafeDeployerAddress = await agentSafeDeployer.getAddress();
	console.log("AgentSafeDeployer: ", agentSafeDeployerAddress);

	// 3. TreasuryLP4Deployer (Wave N)
	console.log("Deploying TreasuryLP4Deployer ...");
	const TreasuryDeployer = await ethers.getContractFactory("TreasuryLP4Deployer");
	const treasuryDeployer = await TreasuryDeployer.deploy();
	await treasuryDeployer.waitForDeployment();
	const treasuryDeployerAddress = await treasuryDeployer.getAddress();
	console.log("TreasuryLP4Deployer:", treasuryDeployerAddress);
	console.log("");

	// 4. LaunchFactory
	console.log("Deploying LaunchFactory ...");
	const LaunchFactory = await ethers.getContractFactory("LaunchFactory");
	const factory = await LaunchFactory.deploy(
		book.WBNB,
		book.PCS_FACTORY,
		book.PCS_ROUTER,
		initCodeHash,
		book.FLAP_PORTAL,
		book.TOKEN_IMPL_TAXED_V3,
		book.TIP_RECEIVER,
		platformCommissionReceiver,
		routerDeployerAddress,
		agentSafeDeployerAddress,
		treasuryDeployerAddress,
		book.PCS_V3_NPM,
		book.PCS_V3_FACTORY,
		book.BNB_USD_FEED,
	);
	await factory.waitForDeployment();
	const factoryAddress = await factory.getAddress();
	console.log("LaunchFactory:     ", factoryAddress);
	console.log("");

	if (factoryOwner.toLowerCase() !== deployer.address.toLowerCase()) {
		console.log("Transferring LaunchFactory ownership to:", factoryOwner);
		const tx = await factory.transferOwnership(factoryOwner);
		await tx.wait();
		console.log("Ownership transferred.");
		console.log("");
	}

	console.log("=== Post-deploy verification ===");
	const checks = [
		["WBNB", await factory.WBNB(), book.WBNB],
		["PCS_FACTORY", await factory.PCS_FACTORY(), book.PCS_FACTORY],
		["PCS_ROUTER", await factory.PCS_ROUTER(), book.PCS_ROUTER],
		["INIT_CODE_HASH", await factory.INIT_CODE_HASH(), initCodeHash],
		["FLAP_PORTAL", await factory.FLAP_PORTAL(), book.FLAP_PORTAL],
		["TOKEN_IMPL_TAXED_V3", await factory.TOKEN_IMPL_TAXED_V3(), book.TOKEN_IMPL_TAXED_V3],
		["TIP_RECEIVER", await factory.TIP_RECEIVER(), book.TIP_RECEIVER],
		["ROUTER_DEPLOYER", await factory.ROUTER_DEPLOYER(), routerDeployerAddress],
		["AGENT_SAFE_DEPLOYER", await factory.AGENT_SAFE_DEPLOYER(), agentSafeDeployerAddress],
		["TREASURY_LP4_DEPLOYER", await factory.TREASURY_LP4_DEPLOYER(), treasuryDeployerAddress],
		["PCS_V3_NPM", await factory.PCS_V3_NPM(), book.PCS_V3_NPM],
		["PCS_V3_FACTORY", await factory.PCS_V3_FACTORY(), book.PCS_V3_FACTORY],
		["BNB_USD_FEED", await factory.BNB_USD_FEED(), book.BNB_USD_FEED],
		["owner", await factory.owner(), factoryOwner],
	];
	let ok = true;
	for (const [name, actual, expected] of checks) {
		const match = String(actual).toLowerCase() === String(expected).toLowerCase();
		console.log(`  ${match ? "OK" : "FAIL"} ${name}: ${actual}`);
		if (!match) {
			console.error(`     EXPECTED: ${expected}`);
			ok = false;
		}
	}
	if (!ok) throw new Error("Post-deploy verification failed.");
	console.log("  all checks passed");
	console.log("");

	const out = {
		wave: "N",
		network: netName,
		chainId: Number((await ethers.provider.getNetwork()).chainId),
		deployer: deployer.address,
		factoryOwner,
		deployedAt: new Date().toISOString(),
		contracts: {
			LaunchFactory: factoryAddress,
			RouterDeployer: routerDeployerAddress,
			AgentSafeDeployer: agentSafeDeployerAddress,
			TreasuryLP4Deployer: treasuryDeployerAddress,
		},
		constructorArgs: {
			wbnb: book.WBNB,
			pcsFactory: book.PCS_FACTORY,
			pcsRouter: book.PCS_ROUTER,
			initCodeHash,
			flapPortal: book.FLAP_PORTAL,
			tokenImplTaxedV3: book.TOKEN_IMPL_TAXED_V3,
			tipReceiver: book.TIP_RECEIVER,
			platformCommissionReceiver,
			routerDeployer: routerDeployerAddress,
			agentSafeDeployer: agentSafeDeployerAddress,
			treasuryLp4Deployer: treasuryDeployerAddress,
			pcsV3Npm: book.PCS_V3_NPM,
			pcsV3Factory: book.PCS_V3_FACTORY,
			bnbUsdFeed: book.BNB_USD_FEED,
		},
		safeAddressBook: {
			singleton: book.SAFE_SINGLETON,
			proxyFactory: book.SAFE_PROXY_FACTORY,
		},
		platformCommissionReceiver,
	};

	const fname = `${netName.toLowerCase().replace("bsc", "bsc-")}-wave-n.json`;
	const outPath = path.join(__dirname, "..", "..", "deployments", fname);
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
	console.log(`wrote ${outPath}`);

	console.log("");
	console.log("Next steps:");
	console.log("  1. verify on BscScan:");
	console.log(`     bunx hardhat verify --network ${netName} ${factoryAddress} \\`);
	console.log(`       "${book.WBNB}" "${book.PCS_FACTORY}" "${book.PCS_ROUTER}" \\`);
	console.log(`       "${initCodeHash}" "${book.FLAP_PORTAL}" \\`);
	console.log(`       "${book.TOKEN_IMPL_TAXED_V3}" "${book.TIP_RECEIVER}" \\`);
	console.log(`       "${platformCommissionReceiver}" "${routerDeployerAddress}" \\`);
	console.log(`       "${agentSafeDeployerAddress}" "${treasuryDeployerAddress}" \\`);
	console.log(`       "${book.PCS_V3_NPM}" "${book.PCS_V3_FACTORY}" "${book.BNB_USD_FEED}"`);
	console.log("  2. set LAUNCH_FACTORY_ADDRESS in the API + indexer env (replace wave-H factory)");
	console.log("  3. wizard must compute treasuryTickLowers/Uppers from live BNB/USD + supply");
	console.log("  4. bundle bot must call factory.finalizeLaunch(predictedToken) post-graduation");
}

if (require.main === module) {
	main().catch((err) => {
		console.error(err);
		process.exitCode = 1;
	});
}

module.exports = { deriveFlapInitCodeHash, BSC_MAINNET, BSC_TESTNET };
