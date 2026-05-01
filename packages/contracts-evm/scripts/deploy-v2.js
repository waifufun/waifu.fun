/**
 * waifu.fun V2 — Full deployment script
 *
 * Deployment order (dependencies):
 * 1. VeWaifuStaking(waifuToken)
 * 2. FeeRouter(waifuToken, stakingContract, platformWallet)
 * 3. WaifuFunV2(waifuToken, pancakeRouter, pancakeFactory, feeRouter, config)
 * 4. AgentTokenFactoryV2(waifuFunV2, feeRouter)
 * 5. Configure: FeeRouter.setAuthorizedCaller(waifuFunV2)
 * 6. Configure: VeWaifuStaking.setRewardDistributor(feeRouter)
 * 7. Configure: WaifuFunV2.updateFactory(agentTokenFactory)
 *
 * Usage:
 *   WAIFU_TOKEN_ADDRESS=0x... PLATFORM_WALLET=0x... npx hardhat run scripts/deploy-v2.js --network bscMainnet
 */

const hre = require("hardhat");
const addresses = require("./addresses");

async function main() {
	const network = hre.network.name;
	const networkAddrs = addresses[network];

	if (!networkAddrs && network !== "hardhat" && network !== "localhost") {
		throw new Error(`No addresses configured for network: ${network}`);
	}

	const waifuToken = process.env.WAIFU_TOKEN_ADDRESS;
	const platformWallet = process.env.PLATFORM_WALLET;

	if (!waifuToken) throw new Error("WAIFU_TOKEN_ADDRESS env var required");
	if (!platformWallet) throw new Error("PLATFORM_WALLET env var required");

	const pancakeRouter = networkAddrs?.pancakeRouter || "0x10ED43C718714eb63d5aA57B78B54704E256024E";
	const pancakeFactory = networkAddrs?.pancakeFactory || "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";

	const [deployer] = await hre.ethers.getSigners();
	console.log("Deploying with:", deployer.address);
	console.log("Network:", network);
	console.log("WAIFU token:", waifuToken);
	console.log("Platform wallet:", platformWallet);
	console.log("PancakeSwap Router:", pancakeRouter);
	console.log("PancakeSwap Factory:", pancakeFactory);
	console.log("");

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
	console.log("3. Deploying WaifuFunV2...");
	const WaifuFunV2 = await hre.ethers.getContractFactory("WaifuFunV2");
	const config = {
		teamWallet: platformWallet,
		buyFee: 200, // 2%
		sellFee: 200, // 2%
		curveLimit: hre.ethers.utils.parseEther("2000000"), // 2M WAIFU default
		initBondingCurveRate: 800000, // 80% (out of 1_000_000)
		minWAIFUAmount: hre.ethers.utils.parseEther("100"), // min virtual reserve
		maxWAIFUAmount: hre.ethers.utils.parseEther("10000000"), // max virtual reserve
		minTotalSupply: 1000,
		maxTotalSupply: hre.ethers.utils.parseEther("1000000000000"), // 1T max
		minDecimal: 18,
		maxDecimal: 18,
	};
	const waifuFun = await WaifuFunV2.deploy(waifuToken, pancakeRouter, pancakeFactory, feeRouter.address, config);
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
	await (await feeRouter.setAuthorizedCaller(waifuFun.address)).wait();
	console.log("   FeeRouter authorized caller set to WaifuFunV2");

	// 6. Configure VeWaifuStaking
	console.log("6. Configuring VeWaifuStaking...");
	await (await staking.setRewardDistributor(feeRouter.address)).wait();
	console.log("   VeWaifuStaking reward distributor set to FeeRouter");

	// 7. Configure WaifuFunV2
	console.log("7. Configuring WaifuFunV2...");
	await (await waifuFun.updateFactory(factory.address)).wait();
	console.log("   WaifuFunV2 factory set to AgentTokenFactoryV2");

	// Output JSON for backend config
	const deployment = {
		network,
		waifuToken,
		platformWallet,
		contracts: {
			VeWaifuStaking: staking.address,
			FeeRouter: feeRouter.address,
			WaifuFunV2: waifuFun.address,
			AgentTokenFactoryV2: factory.address,
		},
		pancakeSwap: {
			router: pancakeRouter,
			factory: pancakeFactory,
		},
		config,
	};

	console.log("\n=== DEPLOYMENT COMPLETE ===");
	console.log(JSON.stringify(deployment, null, 2));

	// Verify on BSCScan if not local
	if (network !== "hardhat" && network !== "localhost") {
		console.log("\nVerifying contracts on BSCScan...");
		try {
			await hre.run("verify:verify", { address: staking.address, constructorArguments: [waifuToken] });
			await hre.run("verify:verify", {
				address: feeRouter.address,
				constructorArguments: [waifuToken, staking.address, platformWallet],
			});
			await hre.run("verify:verify", {
				address: factory.address,
				constructorArguments: [waifuFun.address, feeRouter.address],
			});
			console.log("Verification complete.");
		} catch (e) {
			console.log("Verification failed (non-blocking):", e.message);
		}
	}
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
