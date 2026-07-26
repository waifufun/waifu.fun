/**
 * verify-wave-n.js - BscScan source verification helper for Wave N deploy.
 *
 * Reads the deployment artifact written by deploy-wave-n.js
 * (deployments/<network>-wave-n.json) and invokes `hardhat verify` for each
 * contract with the correct constructor args.
 *
 * Uses Etherscan v2 API key from ETHERSCAN_API_KEY (or legacy BSCSCAN_API_KEY)
 * env var (configured in hardhat.config.js).
 *
 * "Already Verified" + "Smart-contract already verified" are treated as success.
 *
 * Usage:
 *   NETWORK=bscMainnet \
 *   ETHERSCAN_API_KEY=... \
 *   bunx hardhat run scripts/deploy/verify-wave-n.js --network bscMainnet
 *
 * Optional env:
 *   DEPLOYMENT_FILE - override the path to the deployment artifact JSON
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { ethers, network } = require("hardhat");

const DEFAULT_ZODIAC_ROLES_FACTORY = "0x000000000000aDdB49795b0f9bA5BC298cDda236";
const DEFAULT_ZODIAC_ROLES_MASTERCOPY = "0x9646fDAD06d3e24444381f44362a3B0eB343D337";

function loadArtifact(netName) {
	if (process.env.DEPLOYMENT_FILE) {
		const p = path.resolve(process.env.DEPLOYMENT_FILE);
		if (!fs.existsSync(p)) throw new Error(`DEPLOYMENT_FILE not found: ${p}`);
		return { path: p, data: JSON.parse(fs.readFileSync(p, "utf8")) };
	}
	const fname = `${netName.toLowerCase().replace("bsc", "bsc-")}-wave-n.json`;
	const p = path.join(__dirname, "..", "..", "deployments", fname);
	if (!fs.existsSync(p)) {
		throw new Error(`Deployment artifact not found: ${p}\nDid deploy-wave-n.js run yet?`);
	}
	return { path: p, data: JSON.parse(fs.readFileSync(p, "utf8")) };
}

function runVerify(args, label) {
	const cmd = ["./node_modules/.bin/hardhat", "verify", ...args].join(" ");
	console.log(`$ ${cmd}`);
	try {
		const out = execSync(cmd, { stdio: "pipe", encoding: "utf8", cwd: path.join(__dirname, "..", "..") });
		console.log(out.trim());
		console.log(`OK   ${label}`);
		return true;
	} catch (e) {
		const stdout = (e.stdout || "").toString();
		const stderr = (e.stderr || "").toString();
		const combined = `${stdout}\n${stderr}`;
		console.log(combined.trim());
		if (
			combined.includes("Already Verified") ||
			combined.includes("already verified") ||
			combined.includes("Already verified")
		) {
			console.log(`OK   ${label} (already verified)`);
			return true;
		}
		console.log(`FAIL ${label}`);
		return false;
	}
}

async function main() {
	const netName = network.name;
	if (netName !== "bscMainnet" && netName !== "bscTestnet") {
		throw new Error(`verify-wave-n must run with --network bscMainnet or bscTestnet (got ${netName})`);
	}
	const apiKey = process.env.ETHERSCAN_API_KEY || process.env.BSCSCAN_API_KEY;
	if (!apiKey) {
		throw new Error("ETHERSCAN_API_KEY (or BSCSCAN_API_KEY) must be set in env.");
	}

	const { path: artPath, data: art } = loadArtifact(netName);
	console.log("Loaded deployment artifact:", artPath);
	console.log("  factory     :", art.contracts.LaunchFactory);
	console.log("  router dep  :", art.contracts.RouterDeployer);
	console.log("  agentsafe   :", art.contracts.AgentSafeZodiacDeployer);
	console.log("  treasury    :", art.contracts.TreasuryLP5Deployer);
	console.log("");

	const results = [];
	const netFlag = ["--network", netName];

	// 1. RouterDeployer (no constructor args)
	results.push({
		name: "RouterDeployer",
		ok: runVerify([...netFlag, art.contracts.RouterDeployer], "RouterDeployer"),
	});

	const rolesFactory = art.safeAddressBook.rolesFactory || DEFAULT_ZODIAC_ROLES_FACTORY;
	const rolesMastercopy = art.safeAddressBook.rolesMastercopy || DEFAULT_ZODIAC_ROLES_MASTERCOPY;
	for (const [label, value] of [
		["contracts.AgentSafeZodiacDeployer", art.contracts.AgentSafeZodiacDeployer],
		["safeAddressBook.singleton", art.safeAddressBook.singleton],
		["safeAddressBook.proxyFactory", art.safeAddressBook.proxyFactory],
		["safeAddressBook.rolesFactory", rolesFactory],
		["safeAddressBook.rolesMastercopy", rolesMastercopy],
	]) {
		if (!ethers.isAddress(value) || value === ethers.ZeroAddress) throw new Error(`Invalid ${label}: ${value}`);
	}

	// 2. AgentSafeZodiacDeployer (safe singleton, proxy factory, Roles module factory, Roles v2 mastercopy)
	results.push({
		name: "AgentSafeZodiacDeployer",
		ok: runVerify(
			[
				...netFlag,
				art.contracts.AgentSafeZodiacDeployer,
				art.safeAddressBook.singleton,
				art.safeAddressBook.proxyFactory,
				rolesFactory,
				rolesMastercopy,
			],
			"AgentSafeZodiacDeployer",
		),
	});

	// 3. TreasuryLP5Deployer (no constructor args)
	results.push({
		name: "TreasuryLP5Deployer",
		ok: runVerify([...netFlag, art.contracts.TreasuryLP5Deployer], "TreasuryLP5Deployer"),
	});

	// 4. LaunchFactory (13 constructor args in exact order; BNB_USD_FEED dropped in Wave O.1)
	const ca = art.constructorArgs;
	results.push({
		name: "LaunchFactory",
		ok: runVerify(
			[
				...netFlag,
				art.contracts.LaunchFactory,
				ca.wbnb,
				ca.pcsFactory,
				ca.pcsRouter,
				ca.initCodeHash,
				ca.flapPortal,
				ca.tokenImplTaxedV3,
				ca.tipReceiver,
				ca.platformCommissionReceiver,
				ca.routerDeployer,
				ca.agentSafeDeployer,
				ca.treasuryLp5Deployer,
				ca.pcsV3Npm,
				ca.pcsV3Factory,
			],
			"LaunchFactory",
		),
	});

	console.log("");
	console.log("=== Verify summary ===");
	for (const r of results) console.log(`  ${r.ok ? "OK  " : "FAIL"} ${r.name}`);
	const allOk = results.every((r) => r.ok);
	if (!allOk) {
		console.error("");
		console.error("One or more verifications failed. Re-run after fixing.");
		process.exitCode = 1;
		return;
	}
	console.log("");
	console.log("All contracts verified on BscScan.");
	const base = netName === "bscMainnet" ? "https://bscscan.com/address/" : "https://testnet.bscscan.com/address/";
	console.log(`  ${base}${art.contracts.LaunchFactory}#code`);
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
