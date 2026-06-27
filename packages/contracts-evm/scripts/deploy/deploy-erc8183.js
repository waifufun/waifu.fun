/**
 * deploy-erc8183.js — deploy waifu's OWN ERC-8183 agentic-commerce escrow stack.
 *
 * Deploys the three contracts that @stwd/erc8183's vendor-neutral client drives:
 *
 *   1. AgenticCommerce  — job registry + escrow (holds the payment token)
 *   2. EvaluatorRouter  — settlement coordinator (the only address trusted to
 *                          release a job's escrow)
 *   3. OptimisticPolicy — optimistic settlement policy (challenge-window based)
 *
 * The payment token is INJECTED (not deployed here for mainnet): pass its
 * address via ERC8183_PAYMENT_TOKEN. On a local/test network with no token set,
 * the script deploys an ERC20Mock so the stack is wired end-to-end.
 *
 * Default chain: BSC TESTNET (chainId 97). This script NEVER targets mainnet by
 * default and performs NO broadcast unless you explicitly run it with a network.
 *
 * Usage (writes nothing on-chain unless a network with a funded key is given):
 *   ERC8183_PAYMENT_TOKEN=0x... \
 *   bunx hardhat run scripts/deploy/deploy-erc8183.js --network bscTestnet
 *
 *   # local end-to-end (auto-deploys a mock token):
 *   bunx hardhat run scripts/deploy/deploy-erc8183.js --network localhost
 *
 * Output: prints the four addresses in the exact shape @stwd/erc8183's
 * RequiredERC8183Addresses expects:
 *   { agenticCommerce, evaluatorRouter, optimisticPolicy, paymentToken }
 *
 * SAFETY: This script refuses to run against BSC mainnet (chainId 56). ERC-8183
 * escrow custody is UNAUDITED — do not deploy to mainnet from here.
 */

const fs = require("node:fs");
const path = require("node:path");
const { ethers, network } = require("hardhat");

// Optimistic challenge window (seconds). A submitted deliverable settles to the
// provider after this window unless the client disputes. Override via env.
const CHALLENGE_WINDOW = BigInt(process.env.ERC8183_CHALLENGE_WINDOW || 24 * 3600); // default 24h

async function main() {
	const net = await ethers.provider.getNetwork();
	const chainId = Number(net.chainId);

	// Hard stop: never deploy this unaudited escrow to BSC mainnet.
	if (chainId === 56) {
		throw new Error(
			"refusing to deploy unaudited ERC-8183 escrow to BSC mainnet (chainId 56). " + "AUDIT REQUIRED before mainnet.",
		);
	}

	const [deployer] = await ethers.getSigners();
	console.log("=== ERC-8183 escrow deploy ===");
	console.log("  network:  ", network.name);
	console.log("  chainId:  ", chainId, chainId === 97 ? "(BSC testnet)" : "");
	console.log("  deployer: ", deployer.address);
	console.log("  challengeWindow:", CHALLENGE_WINDOW.toString(), "seconds");
	console.log("");

	// ------------------------------------------------------------------
	// 1. Resolve the payment token (injected; never hardcoded).
	// ------------------------------------------------------------------
	let paymentToken = process.env.ERC8183_PAYMENT_TOKEN;
	if (paymentToken) {
		if (!ethers.isAddress(paymentToken)) {
			throw new Error(`ERC8183_PAYMENT_TOKEN is not a valid address: ${paymentToken}`);
		}
		console.log("using injected payment token:", paymentToken);
	} else {
		if (chainId === 97) {
			throw new Error(
				"ERC8183_PAYMENT_TOKEN must be set for a real network deploy (testnet). " +
					"On localhost/hardhat a mock token is auto-deployed.",
			);
		}
		console.log("no ERC8183_PAYMENT_TOKEN set — deploying ERC20Mock for local wiring...");
		const Token = await ethers.getContractFactory("ERC20Mock");
		const token = await Token.deploy();
		await token.waitForDeployment();
		paymentToken = await token.getAddress();
		console.log("  mock payment token:", paymentToken);
	}

	// ------------------------------------------------------------------
	// 2. AgenticCommerce (escrow/registry) over the payment token.
	// ------------------------------------------------------------------
	const Commerce = await ethers.getContractFactory("AgenticCommerce");
	const commerce = await Commerce.deploy(paymentToken);
	await commerce.waitForDeployment();
	const agenticCommerce = await commerce.getAddress();
	console.log("AgenticCommerce deployed:", agenticCommerce);

	// ------------------------------------------------------------------
	// 3. EvaluatorRouter + OptimisticPolicy.
	//
	// The router needs a default policy address and the policy needs the router
	// address. We deploy the router first, predicting the policy's CREATE
	// address (deployer nonce + 1), then deploy the policy pointing at the
	// already-deployed router. This yields a clean 1:1 binding with no setters.
	// ------------------------------------------------------------------
	const nonce = await ethers.provider.getTransactionCount(deployer.address);
	const predictedRouter = ethers.getCreateAddress({ from: deployer.address, nonce });
	const predictedPolicy = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 1 });

	const Router = await ethers.getContractFactory("EvaluatorRouter");
	const router = await Router.deploy(agenticCommerce, predictedPolicy);
	await router.waitForDeployment();
	const evaluatorRouter = await router.getAddress();
	if (evaluatorRouter.toLowerCase() !== predictedRouter.toLowerCase()) {
		throw new Error(`router address prediction mismatch: predicted ${predictedRouter}, got ${evaluatorRouter}`);
	}
	console.log("EvaluatorRouter deployed:", evaluatorRouter);

	const Policy = await ethers.getContractFactory("OptimisticPolicy");
	const policy = await Policy.deploy(predictedRouter, CHALLENGE_WINDOW);
	await policy.waitForDeployment();
	const optimisticPolicy = await policy.getAddress();
	if (optimisticPolicy.toLowerCase() !== predictedPolicy.toLowerCase()) {
		throw new Error(`policy address prediction mismatch: predicted ${predictedPolicy}, got ${optimisticPolicy}`);
	}
	console.log("OptimisticPolicy deployed:", optimisticPolicy);

	// ------------------------------------------------------------------
	// 4. Emit the @stwd/erc8183 RequiredERC8183Addresses shape.
	// ------------------------------------------------------------------
	const addresses = {
		agenticCommerce,
		evaluatorRouter,
		optimisticPolicy,
		paymentToken,
	};

	console.log("");
	console.log("=== RequiredERC8183Addresses (inject into @stwd/erc8183 client) ===");
	console.log(JSON.stringify(addresses, null, 2));

	// Persist a deployment record alongside the other deploy artifacts.
	try {
		const outDir = path.join(__dirname, "..", "..", "deployments");
		fs.mkdirSync(outDir, { recursive: true });
		const outFile = path.join(outDir, `erc8183-${network.name}-${chainId}.json`);
		fs.writeFileSync(
			outFile,
			JSON.stringify(
				{
					chainId,
					network: network.name,
					deployedAt: new Date().toISOString(),
					challengeWindowSeconds: CHALLENGE_WINDOW.toString(),
					addresses,
				},
				null,
				2,
			),
		);
		console.log("");
		console.log("wrote deployment record:", outFile);
	} catch (err) {
		console.warn("could not write deployment record:", err.message);
	}

	return addresses;
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
