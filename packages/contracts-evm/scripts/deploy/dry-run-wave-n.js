/**
 * dry-run-wave-n.js - fork-mainnet dry run of the Wave O.1 (LP5) deploy.
 *
 * Reuses BSC_MAINNET address book + deriveFlapInitCodeHash from deploy-wave-n.js,
 * then walks the exact same constructor sequence against a forked BSC node.
 * Reports per-contract gas usage so we can estimate the real deploy cost.
 *
 * Usage:
 *   FORK_BSC=true FORK_BSC_URL=https://bsc-mainnet.public.blastapi.io \
 *   FACTORY_OWNER=0x... PLATFORM_COMMISSION_RECEIVER=0x... \
 *   bunx hardhat run scripts/deploy/dry-run-wave-n.js --network hardhat
 */

const { ethers, network } = require("hardhat");
const { BSC_MAINNET, deriveFlapInitCodeHash } = require("./deploy-wave-n.js");

async function main() {
	if (network.name !== "hardhat" && network.name !== "localhost") {
		throw new Error(`dry-run-wave-n must run on hardhat/localhost, got ${network.name}`);
	}

	const chainId = Number((await ethers.provider.getNetwork()).chainId);
	const isForked = chainId === 56;
	console.log("=== Wave N DRY RUN ===");
	console.log("  network:    ", network.name);
	console.log("  chainId:    ", chainId, isForked ? "(forked BSC mainnet)" : "(NOT forked)");

	const book = BSC_MAINNET;
	const initCodeHash = deriveFlapInitCodeHash(book.TOKEN_IMPL_TAXED_V3);

	const [deployer] = await ethers.getSigners();
	const balance = await ethers.provider.getBalance(deployer.address);
	const factoryOwner = process.env.FACTORY_OWNER || deployer.address;
	const platformReceiver = process.env.PLATFORM_COMMISSION_RECEIVER || deployer.address;

	console.log("  deployer:   ", deployer.address);
	console.log("  balance:    ", ethers.formatEther(balance), "BNB");
	console.log("  factoryOwn: ", factoryOwner);
	console.log("  platformRx: ", platformReceiver);
	console.log("");

	const gasReport = [];

	async function deployAndTrack(name, cf, args) {
		const inst = await cf.deploy(...args);
		const receipt = await inst.deploymentTransaction().wait();
		const addr = await inst.getAddress();
		console.log(`  OK ${name.padEnd(22)}${addr}  gasUsed=${receipt.gasUsed.toString().padStart(8)}`);
		gasReport.push({ name: name, address: addr, gasUsed: Number(receipt.gasUsed) });
		return { inst: inst, addr: addr };
	}

	console.log("Deploying helpers + factory ...");
	const RouterDeployer = await ethers.getContractFactory("RouterDeployer");
	const { addr: routerAddr } = await deployAndTrack("RouterDeployer", RouterDeployer, []);

	const AgentSafeZodiacDeployer = await ethers.getContractFactory("AgentSafeZodiacDeployer");
	const { addr: agentAddr } = await deployAndTrack("AgentSafeZodiacDeployer", AgentSafeZodiacDeployer, [
		book.SAFE_SINGLETON,
		book.SAFE_PROXY_FACTORY,
		book.ZODIAC_ROLES_FACTORY,
		book.ZODIAC_ROLES_MASTERCOPY,
	]);

	const TreasuryDeployer = await ethers.getContractFactory("TreasuryLP5Deployer");
	const { addr: treasuryAddr } = await deployAndTrack("TreasuryLP5Deployer", TreasuryDeployer, []);

	const LaunchFactory = await ethers.getContractFactory("LaunchFactory");
	const factoryArgs = [
		book.WBNB,
		book.PCS_FACTORY,
		book.PCS_ROUTER,
		initCodeHash,
		book.FLAP_PORTAL,
		book.TOKEN_IMPL_TAXED_V3,
		book.TIP_RECEIVER,
		platformReceiver,
		routerAddr,
		agentAddr,
		treasuryAddr,
		book.PCS_V3_NPM,
		book.PCS_V3_FACTORY,
	];
	const { inst: factory, addr: factoryAddr } = await deployAndTrack("LaunchFactory", LaunchFactory, factoryArgs);

	console.log("");
	console.log("Verifying factory immutables ...");
	const checks = [
		["WBNB", await factory.WBNB(), book.WBNB],
		["PCS_FACTORY", await factory.PCS_FACTORY(), book.PCS_FACTORY],
		["PCS_ROUTER", await factory.PCS_ROUTER(), book.PCS_ROUTER],
		["INIT_CODE_HASH", await factory.INIT_CODE_HASH(), initCodeHash],
		["FLAP_PORTAL", await factory.FLAP_PORTAL(), book.FLAP_PORTAL],
		["TOKEN_IMPL_TAXED_V3", await factory.TOKEN_IMPL_TAXED_V3(), book.TOKEN_IMPL_TAXED_V3],
		["TIP_RECEIVER", await factory.TIP_RECEIVER(), book.TIP_RECEIVER],
		["ROUTER_DEPLOYER", await factory.ROUTER_DEPLOYER(), routerAddr],
		["AGENT_SAFE_DEPLOYER", await factory.AGENT_SAFE_DEPLOYER(), agentAddr],
		["TREASURY_LP5_DEPLOYER", await factory.TREASURY_LP5_DEPLOYER(), treasuryAddr],
		["PCS_V3_NPM", await factory.PCS_V3_NPM(), book.PCS_V3_NPM],
		["PCS_V3_FACTORY", await factory.PCS_V3_FACTORY(), book.PCS_V3_FACTORY],
	];
	let ok = true;
	for (const [name, actual, expected] of checks) {
		const match = String(actual).toLowerCase() === String(expected).toLowerCase();
		console.log(`  ${match ? "OK  " : "FAIL"} ${name}: ${actual}`);
		if (!match) {
			console.log(`        EXPECTED ${expected}`);
			ok = false;
		}
	}
	if (!ok) throw new Error("immutable verification failed");

	console.log("");
	console.log("=== Gas summary ===");
	const totalGas = gasReport.reduce((a, b) => a + b.gasUsed, 0);
	const gwei5 = 5n;
	const gwei3 = 3n;
	for (const r of gasReport) {
		const cost5 = BigInt(r.gasUsed) * gwei5 * 10n ** 9n;
		console.log(
			`  ${r.name.padEnd(22)} ${r.gasUsed.toString().padStart(8)} gas  @5gwei=${ethers.formatEther(cost5)} BNB`,
		);
	}
	const totalCost5 = BigInt(totalGas) * gwei5 * 10n ** 9n;
	const totalCost3 = BigInt(totalGas) * gwei3 * 10n ** 9n;
	console.log(`  ${"TOTAL".padEnd(22)} ${totalGas.toString().padStart(8)} gas`);
	console.log(`    @ 3 gwei : ${ethers.formatEther(totalCost3)} BNB`);
	console.log(`    @ 5 gwei : ${ethers.formatEther(totalCost5)} BNB`);
	console.log("");
	console.log("DRY RUN SUCCESS.  Factory =", factoryAddr);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
