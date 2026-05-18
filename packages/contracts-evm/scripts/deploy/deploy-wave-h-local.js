/**
 * deploy-wave-h-local.js — deploy LaunchFactory against a local hardhat node.
 *
 * Useful for end-to-end testing of the bundle-bot service without burning
 * real BNB. Spins up the factory with placeholder (zero) Flap addresses,
 * which means createLaunch() will work but the actual bundle flow against
 * Flap is mocked out. Real-Flap integration tests live in
 * test/wave-h-phase2.test.js (post-phase-2).
 *
 * Usage:
 *   npx hardhat node                            # in one terminal
 *   bunx hardhat run scripts/deploy/deploy-wave-h-local.js --network localhost
 *
 * Auto-funds: if BUNDLE_BOT_ADDRESSES env is set (comma-separated), the
 * deployer transfers 100 ETH to each address using the default hardhat
 * funded account.
 */

const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

async function main() {
	if (network.name !== "localhost" && network.name !== "hardhat") {
		throw new Error(`deploy-wave-h-local must run on localhost or hardhat (got ${network.name})`);
	}

	const [deployer] = await ethers.getSigners();
	console.log("=== Wave H local deploy ===");
	console.log("  network:  ", network.name);
	console.log("  deployer: ", deployer.address);
	console.log("");

	// Deploy mock PCS V2 stack so the factory has something to point at.
	// MockPancakeSwap.sol contains a minimal factory + router with mintable
	// LP pair fixtures.
	console.log("deploying mock PCS V2 stack...");
	const MockFactory = await ethers.getContractFactory("MockPancakeFactory");
	const mockFactory = await MockFactory.deploy();
	await mockFactory.waitForDeployment();

	const MockRouter = await ethers.getContractFactory("MockPancakeRouter");
	const mockRouter = await MockRouter.deploy(await mockFactory.getAddress());
	await mockRouter.waitForDeployment();

	const MockWBNB = await ethers.getContractFactory("ERC20Mock");
	const mockWbnb = await MockWBNB.deploy();
	await mockWbnb.waitForDeployment();

	console.log("  MockPancakeFactory:", await mockFactory.getAddress());
	console.log("  MockPancakeRouter: ", await mockRouter.getAddress());
	console.log("  WBNB (ERC20Mock):  ", await mockWbnb.getAddress());
	console.log("");

	// LaunchFactory rejects zero addresses for Flap-side fields. Use the
	// existing MockFlapPortal stub from LaunchRouterMocks.sol so the deploy
	// actually succeeds. The mock matches the OLD Portal ABI (swapExactInput)
	// and will be upgraded to MockFlapPortalV6 by phase 2A; for now it satisfies
	// the non-zero constructor check and lets the factory deploy locally.
	console.log("deploying MockFlapPortal stub for non-zero constructor args...");
	const MockFlapPortal = await ethers.getContractFactory("MockFlapPortal");
	const mockPortal = await MockFlapPortal.deploy();
	await mockPortal.waitForDeployment();
	const mockPortalAddress = await mockPortal.getAddress();
	console.log("  MockFlapPortal:    ", mockPortalAddress);

	// Sentinel placeholders for tokenImplTaxedV3 + tipReceiver. The factory
	// only enforces non-zero at construction time; bodies don't dereference
	// these in phase 1 (every entrypoint reverts WaveH:phase2). Phase 2A's
	// fork integration tests replace these with real fixtures.
	const SENTINEL_IMPL = "0x0000000000000000000000000000000000000001";
	const SENTINEL_TIP = "0x0000000000000000000000000000000000000002";
	const platformCommissionReceiver = process.env.PLATFORM_COMMISSION_RECEIVER || deployer.address;
	const initCodeHash = ethers.ZeroHash;

	console.log("deploying RouterDeployer + AgentSafeDeployer helpers...");
	const RouterDeployer = await ethers.getContractFactory("RouterDeployer");
	const routerDeployer = await RouterDeployer.deploy();
	await routerDeployer.waitForDeployment();
	const routerDeployerAddress = await routerDeployer.getAddress();

	// Local mode: use the in-package Safe v1.4.1 mocks so AgentSafeDeployer's
	// non-zero constructor checks pass without needing canonical bytecode.
	const SafeSingleton = await ethers.getContractFactory("MockSafeSingleton");
	const safeSingleton = await SafeSingleton.deploy();
	await safeSingleton.waitForDeployment();
	const SafeProxyFactory = await ethers.getContractFactory("MockSafeProxyFactory");
	const safeProxyFactory = await SafeProxyFactory.deploy();
	await safeProxyFactory.waitForDeployment();
	const AgentSafeDeployer = await ethers.getContractFactory("AgentSafeDeployer");
	const agentSafeDeployer = await AgentSafeDeployer.deploy(
		await safeSingleton.getAddress(),
		await safeProxyFactory.getAddress(),
	);
	await agentSafeDeployer.waitForDeployment();
	const agentSafeDeployerAddress = await agentSafeDeployer.getAddress();
	console.log("  RouterDeployer:    ", routerDeployerAddress);
	console.log("  AgentSafeDeployer: ", agentSafeDeployerAddress);

	console.log("deploying LaunchFactory...");
	const LaunchFactory = await ethers.getContractFactory("LaunchFactory");
	const factory = await LaunchFactory.deploy(
		await mockWbnb.getAddress(),
		await mockFactory.getAddress(),
		await mockRouter.getAddress(),
		initCodeHash,
		mockPortalAddress,
		SENTINEL_IMPL,
		SENTINEL_TIP,
		platformCommissionReceiver,
		routerDeployerAddress,
		agentSafeDeployerAddress,
	);
	await factory.waitForDeployment();
	const factoryAddress = await factory.getAddress();
	console.log("  LaunchFactory:     ", factoryAddress);
	console.log("");

	// Optional: fund bundle bot wallets from the deployer
	if (process.env.BUNDLE_BOT_ADDRESSES) {
		const addrs = process.env.BUNDLE_BOT_ADDRESSES.split(",")
			.map((a) => a.trim())
			.filter(Boolean);
		console.log(`funding ${addrs.length} bundle bot wallet(s)...`);
		for (const addr of addrs) {
			const tx = await deployer.sendTransaction({
				to: addr,
				value: ethers.parseEther("100"),
			});
			await tx.wait();
			console.log(`  ${addr}: +100 ETH`);
		}
		console.log("");
	}

	const out = {
		network: network.name,
		chainId: Number((await ethers.provider.getNetwork()).chainId),
		deployer: deployer.address,
		deployedAt: new Date().toISOString(),
		contracts: {
			LaunchFactory: factoryAddress,
			MockPancakeFactory: await mockFactory.getAddress(),
			MockPancakeRouter: await mockRouter.getAddress(),
			WBNB: await mockWbnb.getAddress(),
			MockFlapPortal: mockPortalAddress,
		},
		placeholders: {
			tokenImplTaxedV3: SENTINEL_IMPL,
			tipReceiver: SENTINEL_TIP,
		},
		notes: [
			"MockFlapPortal stub uses the old swapExactInput ABI. Phase 2A replaces it",
			"with MockFlapPortalV6 once that mock is wired into LaunchRouterMocks.sol.",
			"createLaunch() reverts WaveH:phase2 in phase 1 regardless.",
		],
	};

	const outPath = path.join(__dirname, "..", "..", "deployments", "local.json");
	fs.mkdirSync(path.dirname(outPath), { recursive: true });
	fs.writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
	console.log(`wrote ${outPath}`);

	// Back-compat: the root `test:contracts` runner (scripts/run-local-contract-tests.mjs)
	// calls this script with PRINT_JSON=1 and pulls the last single-line JSON off
	// stdout to feed downstream test stages. Preserve that contract.
	if (process.env.PRINT_JSON === "1") {
		console.log(JSON.stringify(out));
	}
}

main().catch((err) => {
	console.error(err);
	process.exitCode = 1;
});
