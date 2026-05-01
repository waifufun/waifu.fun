/**
 * waifu.fun V2 — BSC Testnet deployment
 *
 * Deploys MockWAIFU token first, then full V2 stack.
 * On hardhat network, also deploys mock PancakeSwap.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-testnet.js --network bscTestnet
 *   npx hardhat run scripts/deploy-testnet.js --network hardhat
 */

const hre = require("hardhat");
const addresses = require("./addresses");
const fs = require("node:fs");
const path = require("node:path");

async function main() {
	const network = hre.network.name;
	const isLocal = network === "hardhat" || network === "localhost";

	const [deployer] = await hre.ethers.getSigners();
	console.log("Deploying with:", deployer.address);
	console.log("Network:", network);
	console.log("Balance:", hre.ethers.utils.formatEther(await deployer.getBalance()), "BNB");
	console.log("");

	let pancakeRouter;
	let pancakeFactoryAddr;

	if (isLocal) {
		// Deploy mock PancakeSwap on local network
		console.log("-- Deploying Mock PancakeSwap --");
		const MockPancakeFactory = await hre.ethers.getContractFactory("MockPancakeFactory");
		const mockFactory = await MockPancakeFactory.deploy();
		await mockFactory.deployed();
		pancakeFactoryAddr = mockFactory.address;
		console.log("   MockPancakeFactory:", pancakeFactoryAddr);

		const MockPancakeRouter = await hre.ethers.getContractFactory("MockPancakeRouter");
		const mockRouter = await MockPancakeRouter.deploy(pancakeFactoryAddr);
		await mockRouter.deployed();
		pancakeRouter = mockRouter.address;
		console.log("   MockPancakeRouter:", pancakeRouter);
		console.log("");
	} else {
		const networkAddrs = addresses[network] || addresses.bscTestnet;
		pancakeRouter = networkAddrs.pancakeRouter;
	}

	console.log("PancakeSwap Router:", pancakeRouter);

	// 0. Deploy MockWAIFU
	console.log("0. Deploying MockWAIFU...");
	const MockWAIFU = await hre.ethers.getContractFactory("MockWAIFU");
	const mockWaifu = await MockWAIFU.deploy();
	await mockWaifu.deployed();
	const waifuToken = mockWaifu.address;
	console.log("   MockWAIFU:", waifuToken);

	const platformWallet = deployer.address;

	// 1. Deploy VeWaifuStaking
	console.log("1. Deploying VeWaifuStaking...");
	const VeWaifuStaking = await hre.ethers.getContractFactory("VeWaifuStaking");
	const staking = await VeWaifuStaking.deploy(waifuToken);
	await staking.deployed();
	console.log("   VeWaifuStaking:", staking.address);

	// 2. Deploy FeeRouter
	console.log("2. Deploying FeeRouter...");
	const FeeRouter = await hre.ethers.getContractFactory("FeeRouter");
	const feeRouter = await FeeRouter.deploy(waifuToken, staking.address, platformWallet);
	await feeRouter.deployed();
	console.log("   FeeRouter:", feeRouter.address);

	// 3. Deploy WaifuFunV2
	// Constructor: (waifuToken, feeRouter, pancakeRouter, config)
	console.log("3. Deploying WaifuFunV2...");
	const WaifuFunV2 = await hre.ethers.getContractFactory("WaifuFunV2");
	const config = {
		buyFee: 200, // 2% (out of 10_000)
		sellFee: 200, // 2%
		curveLimit: hre.ethers.utils.parseEther("2000000"), // 2M WAIFU
		minWAIFUAmount: hre.ethers.utils.parseEther("100"), // min virtual reserve
		maxWAIFUAmount: hre.ethers.utils.parseEther("10000000"), // max virtual reserve
		minTotalSupply: 1000,
		maxTotalSupply: hre.ethers.utils.parseEther("1000000000000"), // 1T max
		minDecimal: 18,
		maxDecimal: 18,
	};
	const waifuFun = await WaifuFunV2.deploy(waifuToken, feeRouter.address, pancakeRouter, config);
	await waifuFun.deployed();
	console.log("   WaifuFunV2:", waifuFun.address);

	// 4. Deploy AgentTokenFactoryV2
	console.log("4. Deploying AgentTokenFactoryV2...");
	const AgentTokenFactoryV2 = await hre.ethers.getContractFactory("AgentTokenFactoryV2");
	const factory = await AgentTokenFactoryV2.deploy(waifuFun.address, feeRouter.address);
	await factory.deployed();
	console.log("   AgentTokenFactoryV2:", factory.address);

	// 5. Configure FeeRouter
	console.log("5. Configuring FeeRouter...");
	await (await feeRouter.setAuthorizedCaller(waifuFun.address, true)).wait();
	console.log("   FeeRouter authorized caller set to WaifuFunV2");

	// 6. Configure VeWaifuStaking
	console.log("6. Configuring VeWaifuStaking...");
	await (await staking.setRewardDistributor(feeRouter.address)).wait();
	console.log("   VeWaifuStaking reward distributor set to FeeRouter");

	// 7. Configure WaifuFunV2
	console.log("7. Configuring WaifuFunV2...");
	await (await waifuFun.updateFactory(factory.address)).wait();
	console.log("   WaifuFunV2 factory set to AgentTokenFactoryV2");

	// Build deployment JSON
	const deployment = {
		network,
		chainId: network === "bscTestnet" ? 97 : 31337,
		deployer: deployer.address,
		deployedAt: new Date().toISOString(),
		contracts: {
			MockWAIFU: waifuToken,
			VeWaifuStaking: staking.address,
			FeeRouter: feeRouter.address,
			WaifuFunV2: waifuFun.address,
			AgentTokenFactoryV2: factory.address,
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

	// Save to file
	const deployDir = path.join(__dirname, "..", "deployments");
	if (!fs.existsSync(deployDir)) fs.mkdirSync(deployDir, { recursive: true });
	const filename = network === "bscTestnet" ? "testnet.json" : "local.json";
	fs.writeFileSync(path.join(deployDir, filename), JSON.stringify(deployment, null, 2));
	console.log(`\nSaved to deployments/${filename}`);

	// Verify on BSCScan
	if (network === "bscTestnet") {
		console.log("\nVerifying contracts on BSCScan testnet...");
		const verifications = [
			{ address: waifuToken, constructorArguments: [] },
			{ address: staking.address, constructorArguments: [waifuToken] },
			{ address: feeRouter.address, constructorArguments: [waifuToken, staking.address, platformWallet] },
			{ address: factory.address, constructorArguments: [waifuFun.address, feeRouter.address] },
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
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
