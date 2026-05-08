const fs = require("node:fs");
const path = require("node:path");
const hre = require("hardhat");
const { ethers, upgrades, network } = require("hardhat");
const addresses = require("../addresses");
const { getDeploymentParams } = require("../params");

const deploymentsDir = path.join(__dirname, "..", "..", "deployments");

function serializeValue(value) {
	if (value == null) {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(serializeValue);
	}
	if (typeof value === "object") {
		if (typeof value.toHexString === "function") {
			return value.toString();
		}
		return Object.fromEntries(
			Object.entries(value)
				.filter(([key]) => Number.isNaN(Number(key)))
				.map(([key, nestedValue]) => [key, serializeValue(nestedValue)]),
		);
	}
	if (typeof value === "bigint") {
		return value.toString();
	}
	return value;
}

async function resolveGlobalConfig(networkName) {
	const globalConfig = {
		...getDeploymentParams(networkName),
	};

	if (process.env.TEAM_WALLET) {
		globalConfig.teamWallet = process.env.TEAM_WALLET;
		return globalConfig;
	}

	if (networkName === "localhost" || networkName === "hardhat") {
		const signers = await ethers.getSigners();
		const teamWalletSigner = signers[3] || signers[1] || signers[0];
		globalConfig.teamWallet = teamWalletSigner.address;
	}

	return globalConfig;
}

/** WaifuFun V1 — upgradeable WaifuFun + WaifuFunTokenFactory */
async function deployWaifuFunV1() {
	const [deployer] = await ethers.getSigners();
	const globalConfig = await resolveGlobalConfig(network.name);
	const printJson = process.env.PRINT_JSON === "1";

	if (!printJson) {
		console.log("Deploying WaifuFun with wallet:", deployer.address);
	}

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

	const deployment = {
		network: network.name,
		owner: deployer.address,
		waifuFun: waifuAddr,
		waifuFunTokenFactory: factoryAddr,
		globalConfig: serializeValue(globalConfig),
	};

	if (printJson) {
		process.stdout.write(`${JSON.stringify(deployment)}\n`);
	} else {
		console.log("WaifuFun deployed at:", waifuAddr);
		console.log("WaifuFunTokenFactory deployed at:", factoryAddr);
		console.log("Team wallet:", deployment.globalConfig.teamWallet);
	}

	return deployment;
}

/**
 * WaifuFun V2 — existing WAIFU token + Pancake router from addresses.
 * Env: WAIFU_TOKEN_ADDRESS, PLATFORM_WALLET
 */
async function deployWaifuFunV2() {
	const net = hre.network.name;
	const networkAddrs = addresses[net];

	if (!networkAddrs && net !== "hardhat" && net !== "localhost") {
		throw new Error(`No addresses configured for network: ${net}`);
	}

	const waifuToken = process.env.WAIFU_TOKEN_ADDRESS;
	const platformWallet = process.env.PLATFORM_WALLET;

	if (!waifuToken) throw new Error("WAIFU_TOKEN_ADDRESS env var required");
	if (!platformWallet) throw new Error("PLATFORM_WALLET env var required");

	const pancakeRouter = networkAddrs?.pancakeRouter || "0x10ED43C718714eb63d5aA57B78B54704E256024E";

	const [deployer] = await hre.ethers.getSigners();
	console.log("Deploying with:", deployer.address);
	console.log("Network:", net);
	console.log("WAIFU token:", waifuToken);
	console.log("Platform wallet:", platformWallet);
	console.log("PancakeSwap Router:", pancakeRouter);
	console.log("");

	console.log("1. Deploying VeWaifuStaking...");
	const VeWaifuStaking = await hre.ethers.getContractFactory("VeWaifuStaking");
	const staking = await VeWaifuStaking.deploy(waifuToken);
	await staking.waitForDeployment();
	console.log("   VeWaifuStaking:", await staking.getAddress());

	console.log("2. Deploying FeeRouter...");
	const FeeRouter = await hre.ethers.getContractFactory("FeeRouter");
	const feeRouter = await FeeRouter.deploy(waifuToken, await staking.getAddress(), platformWallet);
	await feeRouter.waitForDeployment();
	const feeRouterAddr = await feeRouter.getAddress();
	console.log("   FeeRouter:", feeRouterAddr);

	console.log("3. Deploying WaifuFunV2...");
	const WaifuFunV2 = await hre.ethers.getContractFactory("WaifuFunV2");
	const config = {
		buyFee: 200,
		sellFee: 200,
		curveLimit: hre.ethers.parseEther("2000000"),
		minWAIFUAmount: hre.ethers.parseEther("100"),
		maxWAIFUAmount: hre.ethers.parseEther("10000000"),
		minTotalSupply: 1000,
		maxTotalSupply: hre.ethers.parseEther("1000000000000"),
		minDecimal: 18,
		maxDecimal: 18,
	};
	const waifuFun = await WaifuFunV2.deploy(waifuToken, feeRouterAddr, pancakeRouter, config);
	await waifuFun.waitForDeployment();
	const waifuFunAddr = await waifuFun.getAddress();
	console.log("   WaifuFunV2:", waifuFunAddr);

	console.log("4. Deploying AgentTokenFactoryV2...");
	const AgentTokenFactoryV2 = await hre.ethers.getContractFactory("AgentTokenFactoryV2");
	const factory = await AgentTokenFactoryV2.deploy(waifuFunAddr, feeRouterAddr);
	await factory.waitForDeployment();
	const factoryAddr = await factory.getAddress();
	console.log("   AgentTokenFactoryV2:", factoryAddr);

	console.log("5. Configuring FeeRouter...");
	await (await feeRouter.setAuthorizedCaller(waifuFunAddr, true)).wait();
	console.log("   FeeRouter authorized caller set to WaifuFunV2");

	console.log("6. Configuring VeWaifuStaking...");
	await (await staking.setRewardDistributor(feeRouterAddr)).wait();
	console.log("   VeWaifuStaking reward distributor set to FeeRouter");

	console.log("7. Configuring WaifuFunV2...");
	await (await waifuFun.updateFactory(factoryAddr)).wait();
	console.log("   WaifuFunV2 factory set to AgentTokenFactoryV2");

	const deployment = {
		network: net,
		waifuToken,
		platformWallet,
		contracts: {
			VeWaifuStaking: await staking.getAddress(),
			FeeRouter: feeRouterAddr,
			WaifuFunV2: waifuFunAddr,
			AgentTokenFactoryV2: factoryAddr,
		},
		pancakeSwap: {
			router: pancakeRouter,
			factory: networkAddrs?.pancakeFactory,
		},
		config,
	};

	console.log("\n=== DEPLOYMENT COMPLETE ===");
	console.log(JSON.stringify(deployment, null, 2));

	if (net !== "hardhat" && net !== "localhost") {
		console.log("\nVerifying contracts on BSCScan...");
		try {
			await hre.run("verify:verify", { address: await staking.getAddress(), constructorArguments: [waifuToken] });
			await hre.run("verify:verify", {
				address: feeRouterAddr,
				constructorArguments: [waifuToken, await staking.getAddress(), platformWallet],
			});
			await hre.run("verify:verify", {
				address: waifuFunAddr,
				constructorArguments: [waifuToken, feeRouterAddr, pancakeRouter, config],
			});
			await hre.run("verify:verify", {
				address: factoryAddr,
				constructorArguments: [waifuFunAddr, feeRouterAddr],
			});
			console.log("Verification complete.");
		} catch (e) {
			console.log("Verification failed (non-blocking):", e.message);
		}
	}

	return deployment;
}

/** V2 stack + MockWAIFU; local nets deploy mock Pancake. Writes deployments/*.json */
async function deployWaifuFunV2Testnet() {
	const net = hre.network.name;
	const isLocal = net === "hardhat" || net === "localhost";

	const [deployer] = await hre.ethers.getSigners();
	console.log("Deploying with:", deployer.address);
	console.log("Network:", net);
	console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "BNB");
	console.log("");

	let pancakeRouter;
	let pancakeFactoryAddr;

	if (isLocal) {
		console.log("-- Deploying Mock PancakeSwap --");
		const MockPancakeFactory = await hre.ethers.getContractFactory("MockPancakeFactory");
		const mockFactory = await MockPancakeFactory.deploy();
		await mockFactory.waitForDeployment();
		pancakeFactoryAddr = await mockFactory.getAddress();
		console.log("   MockPancakeFactory:", pancakeFactoryAddr);

		const MockPancakeRouter = await hre.ethers.getContractFactory("MockPancakeRouter");
		const mockRouter = await MockPancakeRouter.deploy(pancakeFactoryAddr);
		await mockRouter.waitForDeployment();
		pancakeRouter = await mockRouter.getAddress();
		console.log("   MockPancakeRouter:", pancakeRouter);
		console.log("");
	} else {
		const networkAddrs = addresses[net] || addresses.bscTestnet;
		pancakeRouter = networkAddrs.pancakeRouter;
	}

	console.log("PancakeSwap Router:", pancakeRouter);

	console.log("0. Deploying MockWAIFU...");
	const MockWAIFU = await hre.ethers.getContractFactory("MockWAIFU");
	const mockWaifu = await MockWAIFU.deploy();
	await mockWaifu.waitForDeployment();
	const waifuToken = await mockWaifu.getAddress();
	console.log("   MockWAIFU:", waifuToken);

	const platformWallet = deployer.address;

	console.log("1. Deploying VeWaifuStaking...");
	const VeWaifuStaking = await hre.ethers.getContractFactory("VeWaifuStaking");
	const staking = await VeWaifuStaking.deploy(waifuToken);
	await staking.waitForDeployment();
	console.log("   VeWaifuStaking:", await staking.getAddress());

	console.log("2. Deploying FeeRouter...");
	const FeeRouter = await hre.ethers.getContractFactory("FeeRouter");
	const feeRouter = await FeeRouter.deploy(waifuToken, await staking.getAddress(), platformWallet);
	await feeRouter.waitForDeployment();
	const feeRouterAddr = await feeRouter.getAddress();
	console.log("   FeeRouter:", feeRouterAddr);

	console.log("3. Deploying WaifuFunV2...");
	const WaifuFunV2 = await hre.ethers.getContractFactory("WaifuFunV2");
	const config = {
		buyFee: 200,
		sellFee: 200,
		curveLimit: hre.ethers.parseEther("2000000"),
		minWAIFUAmount: hre.ethers.parseEther("100"),
		maxWAIFUAmount: hre.ethers.parseEther("10000000"),
		minTotalSupply: 1000,
		maxTotalSupply: hre.ethers.parseEther("1000000000000"),
		minDecimal: 18,
		maxDecimal: 18,
	};
	const waifuFun = await WaifuFunV2.deploy(waifuToken, feeRouterAddr, pancakeRouter, config);
	await waifuFun.waitForDeployment();
	const waifuFunAddr = await waifuFun.getAddress();
	console.log("   WaifuFunV2:", waifuFunAddr);

	console.log("4. Deploying AgentTokenFactoryV2...");
	const AgentTokenFactoryV2 = await hre.ethers.getContractFactory("AgentTokenFactoryV2");
	const factory = await AgentTokenFactoryV2.deploy(waifuFunAddr, feeRouterAddr);
	await factory.waitForDeployment();
	const factoryAddr = await factory.getAddress();
	console.log("   AgentTokenFactoryV2:", factoryAddr);

	console.log("5. Configuring FeeRouter...");
	await (await feeRouter.setAuthorizedCaller(waifuFunAddr, true)).wait();
	console.log("   FeeRouter authorized caller set to WaifuFunV2");

	console.log("6. Configuring VeWaifuStaking...");
	await (await staking.setRewardDistributor(feeRouterAddr)).wait();
	console.log("   VeWaifuStaking reward distributor set to FeeRouter");

	console.log("7. Configuring WaifuFunV2...");
	await (await waifuFun.updateFactory(factoryAddr)).wait();
	console.log("   WaifuFunV2 factory set to AgentTokenFactoryV2");

	const deployment = {
		network: net,
		chainId: net === "bscTestnet" ? 97 : 31337,
		deployer: deployer.address,
		deployedAt: new Date().toISOString(),
		contracts: {
			MockWAIFU: waifuToken,
			VeWaifuStaking: await staking.getAddress(),
			FeeRouter: feeRouterAddr,
			WaifuFunV2: waifuFunAddr,
			AgentTokenFactoryV2: factoryAddr,
		},
		pancakeSwap: {
			router: pancakeRouter,
			...(pancakeFactoryAddr ? { factory: pancakeFactoryAddr } : {}),
		},
		config: {
			buyFee: 200,
			sellFee: 200,
			curveLimit: "2000000000000000000000000",
			minWAIFUAmount: "100000000000000000000",
			maxWAIFUAmount: "10000000000000000000000000",
			minTotalSupply: 1000,
			maxTotalSupply: "1000000000000000000000000000000",
			minDecimal: 18,
			maxDecimal: 18,
		},
	};

	console.log("\n=== DEPLOYMENT COMPLETE ===");
	console.log(JSON.stringify(deployment, null, 2));

	if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir, { recursive: true });
	const filename = net === "bscTestnet" ? "testnet.json" : "local.json";
	fs.writeFileSync(path.join(deploymentsDir, filename), JSON.stringify(deployment, null, 2));
	console.log(`\nSaved to deployments/${filename}`);

	if (net === "bscTestnet") {
		console.log("\nVerifying contracts on BSCScan testnet...");
		const verifications = [
			{ address: waifuToken, constructorArguments: [] },
			{ address: await staking.getAddress(), constructorArguments: [waifuToken] },
			{
				address: feeRouterAddr,
				constructorArguments: [waifuToken, await staking.getAddress(), platformWallet],
			},
			{ address: factoryAddr, constructorArguments: [waifuFunAddr, feeRouterAddr] },
		];
		for (const v of verifications) {
			try {
				await hre.run("verify:verify", v);
				console.log("   Verified:", v.address);
			} catch (e) {
				console.log("   Verify failed for", v.address, ":", e.message?.slice(0, 100));
			}
		}
	}

	return deployment;
}

/** AgentSafeFactory — uses scripts/addresses.js agentSafe registry */
async function deployAgentSafeFactory() {
	const net = hre.network.name;
	const cfg = addresses.agentSafe[net];
	if (!cfg) {
		throw new Error(`No AgentSafeFactory address config for network: ${net}`);
	}

	for (const [key, value] of Object.entries(cfg)) {
		if (key === "chainId") continue;
		if (!value) throw new Error(`Missing ${net}.${key} in scripts/addresses.js agentSafe`);
	}

	const factory = await hre.ethers.deployContract("AgentSafeFactory", [
		cfg.safeSingleton,
		cfg.safeProxyFactory,
		cfg.safeFallbackHandler,
		cfg.rolesModifier,
	]);
	await factory.waitForDeployment();

	console.log(`AgentSafeFactory deployed on ${net}: ${await factory.getAddress()}`);
	return { network: net, agentSafeFactory: await factory.getAddress() };
}

// PancakeSwap V2 INIT_CODE_HASH for create2 pair lookup. This is
// computed from the bytecode of UniswapV2Pair as deployed by PCS V2
// factory and is identical across BSC mainnet + testnet.
const PCS_INIT_CODE_HASH = "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";

async function deployLaunchV3() {
	const net = hre.network.name;
	const psCfg = addresses[net];
	if (!psCfg) {
		throw new Error(`No PancakeSwap address config for network: ${net}`);
	}

	const taxSplitter = process.env.TAX_SPLITTER;
	if (!taxSplitter) {
		throw new Error("Missing TAX_SPLITTER env var. Set to the deployed TaxSplitter address.");
	}

	console.log(`Deploying LaunchFactory v3 on ${net}\n`);
	console.log(`  WBNB:           ${psCfg.WBNB}`);
	console.log(`  PCS_FACTORY:    ${psCfg.pancakeFactory}`);
	console.log(`  PCS_ROUTER:     ${psCfg.pancakeRouter}`);
	console.log(`  INIT_CODE_HASH: ${PCS_INIT_CODE_HASH}`);
	console.log(`  TAX_SPLITTER:   ${taxSplitter}`);
	console.log();

	const LaunchFactory = await hre.ethers.getContractFactory("LaunchFactory");
	const factory = await LaunchFactory.deploy(
		psCfg.WBNB,
		psCfg.pancakeFactory,
		psCfg.pancakeRouter,
		PCS_INIT_CODE_HASH,
		taxSplitter,
	);
	await factory.waitForDeployment();
	const factoryAddr = await factory.getAddress();

	console.log(`LaunchFactory deployed on ${net}: ${factoryAddr}`);
	console.log();
	console.log("Set this in your API .env:");
	console.log(`  LAUNCH_FACTORY_ADDRESS=${factoryAddr}`);
	console.log();
	if (net === "bscMainnet" || net === "bscTestnet") {
		console.log("Verify on BSCScan:");
		console.log(`  bunx hardhat verify --network ${net} ${factoryAddr} \\`);
		console.log(`    ${psCfg.WBNB} \\`);
		console.log(`    ${psCfg.pancakeFactory} \\`);
		console.log(`    ${psCfg.pancakeRouter} \\`);
		console.log(`    ${PCS_INIT_CODE_HASH} \\`);
		console.log(`    ${taxSplitter}`);
	}

	return { network: net, launchFactory: factoryAddr };
}

module.exports = {
	deployWaifuFunV1,
	deployWaifuFunV2,
	deployWaifuFunV2Testnet,
	deployAgentSafeFactory,
	deployLaunchV3,
	deployContracts: deployWaifuFunV1,
	resolveGlobalConfig,
};
