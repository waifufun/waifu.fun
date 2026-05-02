/**
 * Unified deploy entrypoint.
 *
 * Targets (DEPLOY_TARGET env or `-- --target <name>`):
 *   v1          — WaifuFun V1 upgradeable (default)
 *   v2          — WaifuFun V2 + staking + fee router (needs WAIFU_TOKEN_ADDRESS, PLATFORM_WALLET)
 *   testnet     — Mock WAIFU + V2 stack; writes deployments/{testnet,local}.json
 *   agent-safe  — AgentSafeFactory from scripts/addresses.js
 *
 * Examples:
 *   hardhat run scripts/deploy/run.js --network localhost
 *   DEPLOY_TARGET=v2 WAIFU_TOKEN_ADDRESS=0x... PLATFORM_WALLET=0x... hardhat run scripts/deploy/run.js --network bscMainnet
 *   DEPLOY_TARGET=testnet hardhat run scripts/deploy/run.js --network bscTestnet
 *   DEPLOY_TARGET=agent-safe hardhat run scripts/deploy/run.js --network bscMainnet
 */

const tasks = require("./tasks");

function parseTarget() {
	const env = process.env.DEPLOY_TARGET?.trim().toLowerCase();
	if (env) return normalizeTarget(env);

	const dash = process.argv.indexOf("--");
	const argv = dash === -1 ? [] : process.argv.slice(dash + 1);
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if ((a === "--target" || a === "-t") && argv[i + 1]) return normalizeTarget(argv[i + 1]);
		if (a.startsWith("--target=")) return normalizeTarget(a.slice("--target=".length));
	}
	return "v1";
}

function normalizeTarget(raw) {
	const t = raw.trim().toLowerCase();
	if (t === "waifu-v1") return "v1";
	if (t === "waifu-v2") return "v2";
	if (t === "v2-testnet") return "testnet";
	if (t === "agent-safe-factory") return "agent-safe";
	return t;
}

async function main() {
	const target = parseTarget();

	switch (target) {
		case "v1":
			await tasks.deployWaifuFunV1();
			return;
		case "v2":
			await tasks.deployWaifuFunV2();
			return;
		case "testnet":
			await tasks.deployWaifuFunV2Testnet();
			return;
		case "agent-safe":
			await tasks.deployAgentSafeFactory();
			return;
		default:
			throw new Error(`Unknown deploy target "${target}". Use: v1 | v2 | testnet | agent-safe`);
	}
}

main().catch((error) => {
	console.error(error.message || error);
	process.exit(1);
});
