/**
 * deploy-wave-h.js — deploy LaunchFactory for Wave H.
 *
 * Wave H deploys exactly one contract from this package: the per-protocol
 * LaunchFactory. Per-launch contracts (LaunchVault, BundleRouter, TreasuryLP)
 * are created by the factory inside createLaunch() at launch time, not here.
 *
 * Usage:
 *   NETWORK=bscMainnet \
 *   PRIVATE_KEY=0x... \
 *   PLATFORM_COMMISSION_RECEIVER=0x... \
 *   bunx hardhat run scripts/deploy/deploy-wave-h.js --network bscMainnet
 *
 * Required env:
 *   PRIVATE_KEY                  — deployer EOA, must hold enough BNB
 *   PLATFORM_COMMISSION_RECEIVER — (optional) recorded only; the factory
 *                                  does not take this as a constructor arg
 *                                  (per-launch field on BundleRouter)
 *
 * Optional env:
 *   WBNB, PCS_FACTORY, PCS_ROUTER, FLAP_PORTAL, TOKEN_IMPL_TAXED_V3,
 *   TIP_RECEIVER — override the BSC mainnet address book defaults
 *
 * Output:
 *   deployments/{network}.json — full deployment record incl. factory address,
 *   constructor args, and the derived FlapTaxToken EIP-1167 init code hash.
 */

const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

// ---------------------------------------------------------------------
// BSC mainnet address book (verified against WAVE_H_FLAP_NATIVE_SPEC.md)
// ---------------------------------------------------------------------
const BSC_MAINNET = {
	WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
	PCS_FACTORY: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
	PCS_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
	FLAP_PORTAL: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
	TOKEN_IMPL_TAXED_V3: "0x29e6383f0Ce68507B5A72a53C2B118a118332aA8",
	TIP_RECEIVER: "0x4848489f0b2BEdd788c696e2D79b6b69D7484848",
};

// BSC testnet placeholder address book. Mostly real PCS V2 testnet
// addresses, with Flap-side fields left as zero because Flap doesn't run on
// BSC testnet. Deploys here will produce a factory you cannot actually
// `createLaunch()` against without further wiring (mock Portal + mock impl).
const BSC_TESTNET = {
	WBNB: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
	PCS_FACTORY: "0x6725F303b657a9451d8BA641348b6761A6CC7a17",
	PCS_ROUTER: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1",
	FLAP_PORTAL: "0x0000000000000000000000000000000000000000",
	TOKEN_IMPL_TAXED_V3: "0x0000000000000000000000000000000000000000",
	TIP_RECEIVER: "0x0000000000000000000000000000000000000000",
};

/**
 * Derive the EIP-1167 minimal-proxy init code hash for Flap's TaxToken clone.
 * Flap deploys tax tokens via CREATE2(deployer=portal, salt, initCode) where
 * initCode is the standard EIP-1167 prefix + impl address + suffix.
 * See WAVE_H_FLAP_NATIVE_SPEC.md section 4.2.
 */
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

	// env overrides win over defaults
	const book = {
		WBNB: process.env.WBNB || def.WBNB,
		PCS_FACTORY: process.env.PCS_FACTORY || def.PCS_FACTORY,
		PCS_ROUTER: process.env.PCS_ROUTER || def.PCS_ROUTER,
		FLAP_PORTAL: process.env.FLAP_PORTAL || def.FLAP_PORTAL,
		TOKEN_IMPL_TAXED_V3: process.env.TOKEN_IMPL_TAXED_V3 || def.TOKEN_IMPL_TAXED_V3,
		TIP_RECEIVER: process.env.TIP_RECEIVER || def.TIP_RECEIVER,
	};

	// LaunchFactory rejects zero/null in its constructor; fail fast here
	// with a clear message instead of deploying and reverting on-chain.
	const missing = Object.entries(book)
		.filter(([, v]) => !v || v === ethers.ZeroAddress)
		.map(([k]) => k);
	if (missing.length > 0) {
		throw new Error(
			`Missing required address(es) for ${networkName}: ${missing.join(", ")}. Supply via env (FLAP_PORTAL, TOKEN_IMPL_TAXED_V3, TIP_RECEIVER, etc.) or extend the default address book.`,
		);
	}

	return book;
}

async function main() {
	const netName = network.name;
	const book = resolveAddressBook(netName);
	const initCodeHash = deriveFlapInitCodeHash(book.TOKEN_IMPL_TAXED_V3);

	const [deployer] = await ethers.getSigners();
	const balance = await ethers.provider.getBalance(deployer.address);

	console.log("=== Wave H deploy ===");
	console.log("  network:           ", netName);
	console.log("  deployer:          ", deployer.address);
	console.log("  balance (BNB):     ", ethers.formatEther(balance));
	console.log("  WBNB:              ", book.WBNB);
	console.log("  PCS factory:       ", book.PCS_FACTORY);
	console.log("  PCS router:        ", book.PCS_ROUTER);
	console.log("  Flap portal:       ", book.FLAP_PORTAL);
	console.log("  TaxToken V3 impl:  ", book.TOKEN_IMPL_TAXED_V3);
	console.log("  tip receiver:      ", book.TIP_RECEIVER);
	console.log("  init code hash:    ", initCodeHash);
	console.log("");

	// resolveAddressBook() already fails fast on missing/zero addresses.

	const platformCommissionReceiver = process.env.PLATFORM_COMMISSION_RECEIVER;
	if (platformCommissionReceiver) {
		console.log("  platform commission receiver:", platformCommissionReceiver);
		console.log("  (recorded only; per-launch field on BundleRouter)");
		console.log("");
	}

	const LaunchFactory = await ethers.getContractFactory("LaunchFactory");
	const factory = await LaunchFactory.deploy(
		book.WBNB,
		book.PCS_FACTORY,
		book.PCS_ROUTER,
		initCodeHash,
		book.FLAP_PORTAL,
		book.TOKEN_IMPL_TAXED_V3,
		book.TIP_RECEIVER,
	);
	await factory.waitForDeployment();
	const factoryAddress = await factory.getAddress();

	console.log("LaunchFactory deployed at:", factoryAddress);
	console.log("");

	const out = {
		network: netName,
		chainId: Number((await ethers.provider.getNetwork()).chainId),
		deployer: deployer.address,
		deployedAt: new Date().toISOString(),
		contracts: {
			LaunchFactory: factoryAddress,
		},
		constructorArgs: {
			wbnb: book.WBNB,
			pcsFactory: book.PCS_FACTORY,
			pcsRouter: book.PCS_ROUTER,
			initCodeHash,
			flapPortal: book.FLAP_PORTAL,
			tokenImplTaxedV3: book.TOKEN_IMPL_TAXED_V3,
			tipReceiver: book.TIP_RECEIVER,
		},
		platformCommissionReceiver: platformCommissionReceiver || null,
	};

	const fname = `${netName.toLowerCase().replace("bsc", "bsc-")}.json`;
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
	console.log(`       "${book.TOKEN_IMPL_TAXED_V3}" "${book.TIP_RECEIVER}"`);
	console.log("  2. set LAUNCH_FACTORY_ADDRESS in the API + indexer env");
	console.log("  3. see WAVE_H_OPERATIONAL_PLAN.md for bundle-bot setup");
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});

module.exports = { deriveFlapInitCodeHash, BSC_MAINNET, BSC_TESTNET };
