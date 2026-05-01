const { ethers } = require("hardhat");
const { addresses } = require("./addresses");

/**
 * Deploys AgentSafeFactory using known Safe/Zodiac addresses for the selected network.
 *
 * This script is intentionally safe to run in dry deployment environments, but W1.10 does
 * not perform a live BSC deployment. Before mainnet ops:
 *   1. Verify addresses.js against upstream Safe/Zodiac deployment sources.
 *   2. Run with an ops signer funded on the target chain.
 *   3. Persist the resulting AgentSafeFactory address in API env/config.
 *
 * Usage:
 *   bun run --filter @waifufun/agent-contracts-evm hardhat run scripts/deploy-agent-safe-factory.js --network bscMainnet
 */
async function main() {
	const networkName = hre.network.name;
	const config = addresses[networkName];
	if (!config) {
		throw new Error(`No AgentSafeFactory address config for network: ${networkName}`);
	}

	for (const [key, value] of Object.entries(config)) {
		if (key === "chainId") continue;
		if (!value) throw new Error(`Missing ${networkName}.${key} in scripts/addresses.js`);
	}

	const factory = await ethers.deployContract("AgentSafeFactory", [
		config.safeSingleton,
		config.safeProxyFactory,
		config.safeFallbackHandler,
		config.rolesModifier,
	]);
	await factory.waitForDeployment();

	console.log(`AgentSafeFactory deployed on ${networkName}: ${await factory.getAddress()}`);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
