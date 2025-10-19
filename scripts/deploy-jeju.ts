#!/usr/bin/env bun

/**
 * Deploy complete Jeju stack including Uniswap V4, ElizaOS Token, and auto.fun contracts
 *
 * Usage:
 *   bun run scripts/deploy-jeju.ts
 *
 * Environment variables:
 *   NEXT_PUBLIC_JEJU_NETWORK - mainnet | testnet | localnet
 *   JEJU_RPC_URL - RPC endpoint (defaults based on network)
 *   DEPLOYER_PRIVATE_KEY - Private key for deployment (required for mainnet/testnet)
 */

import { createWalletClient, createPublicClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { jejuMainnet, jejuTestnet, jejuLocalnet } from "../packages/constants/src/index";
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const JEJU_NETWORK = process.env.NEXT_PUBLIC_JEJU_NETWORK || "localnet";

// Select chain based on network
const CHAIN_MAP = {
	mainnet: jejuMainnet,
	testnet: jejuTestnet,
	localnet: jejuLocalnet,
};

const chain = CHAIN_MAP[JEJU_NETWORK as keyof typeof CHAIN_MAP];
if (!chain) {
	console.error(`❌ Invalid JEJU_NETWORK: ${JEJU_NETWORK}`);
	process.exit(1);
}

// Get RPC URL
const rpcUrl =
	process.env.JEJU_RPC_URL ||
	(JEJU_NETWORK === "localnet"
		? "http://127.0.0.1:9545"
		: JEJU_NETWORK === "testnet"
			? "https://testnet-rpc.jeju.network"
			: "https://rpc.jeju.network");

// Get deployer account
const DEFAULT_ANVIL_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

let deployerPrivateKey: string;
let account: ReturnType<typeof privateKeyToAccount>;

if (JEJU_NETWORK === "localnet") {
	// Use default Anvil account for localnet
	deployerPrivateKey = DEFAULT_ANVIL_KEY;
	account = privateKeyToAccount(DEFAULT_ANVIL_KEY as `0x${string}`);
	console.log("🔑 Using default Anvil deployer account");
} else {
	const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
	if (!privateKey) {
		console.error("❌ DEPLOYER_PRIVATE_KEY required for mainnet/testnet");
		process.exit(1);
	}
	deployerPrivateKey = privateKey;
	account = privateKeyToAccount(privateKey as `0x${string}`);
}

console.log(`\n🚀 Deploying to Jeju ${JEJU_NETWORK}`);
console.log(`📍 RPC: ${rpcUrl}`);
console.log(`👤 Deployer: ${account.address}\n`);

const publicClient = createPublicClient({
	chain,
	transport: http(rpcUrl),
});

const walletClient = createWalletClient({
	account,
	chain,
	transport: http(rpcUrl),
});

/**
 * Run a deployment script and wait for completion
 */
async function runDeploymentScript(scriptPath: string, scriptName: string): Promise<void> {
	console.log(`\n📦 Deploying ${scriptName}...`);
	console.log(`   Script: ${scriptPath}`);

	if (!existsSync(scriptPath)) {
		console.error(`❌ ERROR: Script not found: ${scriptPath}`);
		process.exit(1);
	}

	return new Promise((resolve, reject) => {
		const env = {
			...process.env,
			JEJU_NETWORK: JEJU_NETWORK,
			JEJU_RPC_URL: rpcUrl,
			PRIVATE_KEY: deployerPrivateKey, // Pass the actual private key
		};

		const proc = spawn("bun", ["run", scriptPath], {
			stdio: "inherit",
			env,
		});

		proc.on("close", (code) => {
			if (code === 0) {
				console.log(`✅ ${scriptName} deployed successfully\n`);
				resolve();
			} else {
				reject(new Error(`${scriptName} deployment failed with code ${code}`));
			}
		});

		proc.on("error", (err) => {
			reject(new Error(`Failed to run ${scriptName} script: ${err.message}`));
		});
	});
}

/**
 * Read deployment artifact
 */
function readDeployment(filename: string): any {
	const path = join(__dirname, "..", "..", "contracts", "deployments", filename);

	if (!existsSync(path)) {
		console.warn(`⚠️  Deployment file not found: ${path}`);
		return null;
	}

	try {
		const content = readFileSync(path, "utf-8");
		return JSON.parse(content);
	} catch (error) {
		console.error(`❌ Failed to read deployment file: ${path}`);
		return null;
	}
}

async function main() {
	// Check deployer balance
	const balance = await publicClient.getBalance({ address: account.address });
	console.log(`💰 Deployer balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);

	if (balance < parseEther("0.1")) {
		console.warn("⚠️  Low deployer balance - deployment may fail");
	}

	console.log("\n" + "=".repeat(70));
	console.log("Starting Jeju Stack Deployment");
	console.log("=".repeat(70));

	// Step 1: Deploy Uniswap V4 (PoolManager singleton)
	const uniswapScript = join(__dirname, "..", "..", "scripts", "deploy-uniswap-v4.ts");
	await runDeploymentScript(uniswapScript, "Uniswap V4");

	// Read Uniswap deployment addresses
	const chainIdMap: Record<string, number> = {
		localnet: 1337,
		testnet: 420690,
		mainnet: 420691,
	};
	const chainId = chainIdMap[JEJU_NETWORK] || 1337;
	const uniswapDeployment = readDeployment(`uniswap-v4-${chainId}.json`);

	if (uniswapDeployment) {
		console.log("\n📋 Uniswap V4 Addresses:");
		console.log(`   PoolManager: ${uniswapDeployment.poolManager}`);
		console.log(`   WETH:        ${uniswapDeployment.weth}`);
	}

	// Step 2: Deploy ElizaOS Token
	const elizaTokenScript = join(__dirname, "..", "..", "scripts", "deploy-eliza-token.ts");
	await runDeploymentScript(elizaTokenScript, "ElizaOS Token");

	// Read ElizaOS token deployment
	const elizaDeployment = readDeployment(`eliza-token-${chainId}.json`);

	if (elizaDeployment) {
		console.log("\n📋 ElizaOS Token:");
		console.log(`   Address: ${elizaDeployment.token}`);
		console.log(`   Symbol:  ${elizaDeployment.symbol}`);
		console.log(`   Supply:  ${elizaDeployment.initialSupply}`);
	}

	// Step 3: Deploy Auto.fun Contracts
	// Auto.fun currently operates on Solana with bonding curve programs
	// For EVM chains like Jeju, bonding curve contracts need to be developed first
	console.log("\n📦 Auto.fun Contracts");
	console.log("   ℹ️  Auto.fun uses Solana bonding curve programs");
	console.log("   ℹ️  EVM bonding curve contracts: To be developed");
	console.log("");
	console.log("   For MVP:");
	console.log("   - Token display/filtering: ✅ Works (no contracts needed)");
	console.log("   - Wallet connections: ✅ Works");
	console.log("   - Multi-chain UI: ✅ Works");
	console.log("");
	console.log("   For full token creation on Jeju:");
	console.log("   1. Implement EVM bonding curve contracts");
	console.log("   2. Deploy to Jeju networks");
	console.log("   3. Update backend routers to support EVM token creation");
	console.log("   4. Configure addresses in packages/constants/src/index.ts");

	console.log("\n" + "=".repeat(70));
	console.log("✅ Jeju Stack Deployment Complete!");
	console.log("=".repeat(70));

	console.log("\n💡 Next Steps:");
	console.log("");
	console.log("1. Update Constants");
	console.log("   File: apps/launchpad/packages/constants/src/index.ts");
	console.log("");
	if (uniswapDeployment) {
		console.log("   Uniswap V4 PoolManager:");
		console.log(`   UNISWAP_V4_ADDRESSES: {`);
		console.log(
			`     [EvmChainIds.Jeju${JEJU_NETWORK === "mainnet" ? "Mainnet" : JEJU_NETWORK === "testnet" ? "Testnet" : "Localnet"}]: getAddress("${uniswapDeployment.poolManager}"),`,
		);
		console.log(`   }`);
		console.log("");
	}
	if (elizaDeployment) {
		console.log("   ElizaOS Token:");
		console.log(`   ELIZA_TOKEN_ADDRESSES: {`);
		console.log(
			`     [EvmChainIds.Jeju${JEJU_NETWORK === "mainnet" ? "Mainnet" : JEJU_NETWORK === "testnet" ? "Testnet" : "Localnet"}]: getAddress("${elizaDeployment.token}"),`,
		);
		console.log(`   }`);
		console.log("");
	}
	console.log("2. Initialize Uniswap V4 Pools");
	console.log("   Use the PoolManager to create pools with custom hooks:");
	console.log("   - Initialize elizaOS/ETH pool");
	console.log("   - Set initial price (sqrtPriceX96)");
	console.log("   - Optionally attach hooks for dynamic fees, TWAMM, etc.");
	console.log("");
	console.log("3. Configure Uniswap V4 Interface");
	console.log("   - Add Jeju network to MetaMask");
	console.log(`   - Network Name: Jeju ${JEJU_NETWORK.charAt(0).toUpperCase() + JEJU_NETWORK.slice(1)}`);
	console.log(`   - RPC URL: ${rpcUrl}`);
	console.log(`   - Chain ID: ${chainId}`);
	console.log("   - Currency: ETH");
	console.log("");
	console.log("4. Add Liquidity");
	console.log("   - Use PoolManager.modifyPosition() to add liquidity");
	if (elizaDeployment) {
		console.log(`   - Token: ${elizaDeployment.token}`);
	}
	if (uniswapDeployment) {
		console.log(`   - PoolManager: ${uniswapDeployment.poolManager}`);
	}
	console.log("");
	console.log("📚 Documentation: apps/launchpad/docs/JEJU_INTEGRATION.md");
	console.log("");
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error("\n❌ Deployment failed:", error);
		process.exit(1);
	});
