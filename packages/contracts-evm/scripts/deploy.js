const { ethers, network } = require("hardhat");
const { deployProxy } = require("hardhat-libutils");
const { getDeploymentParams } = require("./params");

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

async function deployContracts() {
	const [deployer] = await ethers.getSigners();
	const globalConfig = await resolveGlobalConfig(network.name);
	const printJson = process.env.PRINT_JSON === "1";

	if (!printJson) {
		console.log("Deploying WaifuFun with wallet:", deployer.address);
	}

	const WaifuFunTokenFactory = await deployProxy("WaifuFunTokenFactory", "WaifuFunTokenFactory");
	const WaifuFun = await deployProxy("WaifuFun", "WaifuFun", [globalConfig]);

	let tx = await WaifuFunTokenFactory.transferOwnership(WaifuFun.address);
	await tx.wait();

	tx = await WaifuFun.updateFactory(WaifuFunTokenFactory.address);
	await tx.wait();

	const deployment = {
		network: network.name,
		owner: deployer.address,
		waifuFun: WaifuFun.address,
		waifuFunTokenFactory: WaifuFunTokenFactory.address,
		globalConfig: serializeValue(globalConfig),
	};

	if (printJson) {
		process.stdout.write(`${JSON.stringify(deployment)}\n`);
	} else {
		console.log("WaifuFun deployed at:", WaifuFun.address);
		console.log("WaifuFunTokenFactory deployed at:", WaifuFunTokenFactory.address);
		console.log("Team wallet:", deployment.globalConfig.teamWallet);
	}

	return deployment;
}

async function main() {
	await deployContracts();
}

if (require.main === module) {
	main()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error(error);
			process.exit(1);
		});
}

module.exports = {
	deployContracts,
	resolveGlobalConfig,
};
