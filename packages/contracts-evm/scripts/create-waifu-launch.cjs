// $WAIFU createLaunch script
// Fires the createLaunch tx on the freshly-deployed Wave O.1 factory using
// Sol burner as creator (the "Sol creates Sol" framing).

const { ethers } = require("ethers");
const fs = require("node:fs");
const path = require("node:path");

const RPC = process.env.ALCHEMY_BSC_URL || "https://bsc-dataseed.binance.org";
const FACTORY = "0xdaDb600e4f68a4bEd886191E5574590d19B7c87f";
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";

// Read mined vanity + secrets
const vanity = JSON.parse(fs.readFileSync("/home/shad0w/.moltbot/secrets/waifu-vanity-sol-creator.json", "utf-8"));

const SHADOW_HOT = "0xdc78E5230d5e55B98a199919109F126752c22EDE";
const PLATFORM_SAFE = "0x0985cCC0fD7C568d493874D845471D5F4B1D9c3c";
const SOL_BURNER = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";

const META_CID = "bafkreichi6xrm7nemmzqvj4zo3lokp2up456feptk6bprep2d2phhbcpwa";

// Treasury tick ladder (WAGMI MC targets: $10M / $25M / $100M / $1B).
// Wait — Shadow earlier said for $WAIFU it was decided to skip LP5 entirely
// (treasury -> AgentSafe per #672), so the LP5 contract will get 0 tokens
// and finalizeLaunch is a no-op. Tick values just need to PASS factory
// validation: aligned to PCS V3 1% tickSpacing (200), lower < upper,
// upper <= MAX_TICK_PCS_V3_1PCT (887200). We use the standard offsets but
// nothing functional depends on them tonight.
const TREASURY_TICK_LOWERS = [53600, 62800, 76600, 92000];
const TREASURY_TICK_UPPERS = [887200, 887200, 887200, 887200];

// Launch config
const PRESALE_WINDOW_SECONDS = 3600; // 1h
const TIER_95 = 2;

// Read sol burner PK from local secret
const SOL_WALLET_PATH = "/home/shad0w/.moltbot/secrets/sol-wallet.json";
const solWalletData = JSON.parse(fs.readFileSync(SOL_WALLET_PATH, "utf-8"));
const SOL_PK = solWalletData.privateKey || solWalletData.pk;
if (!SOL_PK) {
	console.error("missing sol burner PK at", SOL_WALLET_PATH);
	process.exit(1);
}

// LaunchFactory ABI (only the bits we need)
const FACTORY_ABI = [
	"function createLaunch((string name,string symbol,string metaCid,address creator,address bundleBot,uint8 tier,uint16 buyTaxBps,uint16 sellTaxBps,uint64 taxDuration,uint64 antiFarmerDuration,uint256 closeTimestamp,bytes32 vanitySalt,address predictedTokenAddress,bool noBurn,address platformReceiver,address patron,address[] agentSafeOwners,uint256 agentSafeThreshold,uint16 platformBps,uint16 patronBps,int24[4] treasuryTickLowers,int24[4] treasuryTickUppers)) returns ((address vault,address router,address treasuryLp,address predictedTokenAddress,address taxSplitter,address agentSafe))",
	"function owner() view returns (address)",
	"function effectiveSalt(address creator, bytes32 rawSalt) pure returns (bytes32)",
	"event LaunchCreated(address indexed predictedToken, address indexed creator, address vault, address router, address treasuryLp, address taxSplitter, address agentSafe, uint8 tier, uint256 presaleCap, uint256 v2BuyBnb, uint256 closeTimestamp)",
];

async function main() {
	const provider = new ethers.JsonRpcProvider(RPC);
	const wallet = new ethers.Wallet(SOL_PK, provider);

	console.log("=== $WAIFU CREATELAUNCH ===");
	console.log(`  factory:           ${FACTORY}`);
	console.log(`  creator (sol):     ${wallet.address}`);
	console.log(`  predicted token:   ${vanity.predictedToken}`);
	console.log(`  raw salt:          ${vanity.rawSalt}`);

	const balance = await provider.getBalance(wallet.address);
	console.log(`  sol burner BNB:    ${ethers.formatEther(balance)} BNB`);

	const factory = new ethers.Contract(FACTORY, FACTORY_ABI, wallet);

	const block = await provider.getBlock("latest");
	const closeTimestamp = block.timestamp + PRESALE_WINDOW_SECONDS;
	console.log(`  close timestamp:   ${closeTimestamp} (${new Date(closeTimestamp * 1000).toISOString()})`);

	const config = {
		name: "Sol the Architect",
		symbol: "WAIFU",
		metaCid: `ipfs://${META_CID}`,
		creator: SOL_BURNER, // SOL CREATES SOL
		bundleBot: SOL_BURNER, // sol drives the bundle too (for now; can re-delegate later)
		tier: TIER_95,
		buyTaxBps: 300, // 3%
		sellTaxBps: 300, // 3%
		taxDuration: 31_536_000, // 365 days
		antiFarmerDuration: 3600, // 1h
		closeTimestamp: closeTimestamp,
		vanitySalt: vanity.rawSalt,
		predictedTokenAddress: vanity.predictedToken,
		noBurn: false, // real launch — burn slice burns to dead
		platformReceiver: PLATFORM_SAFE,
		patron: SHADOW_HOT,
		agentSafeOwners: [SHADOW_HOT, PLATFORM_SAFE, SOL_BURNER],
		agentSafeThreshold: 2, // 2-of-3
		platformBps: 1000, // 10%
		patronBps: 2500, // 25%
		treasuryTickLowers: TREASURY_TICK_LOWERS,
		treasuryTickUppers: TREASURY_TICK_UPPERS,
	};

	console.log("\n=== config preview ===");
	console.log(JSON.stringify({ ...config, vanitySalt: vanity.rawSalt }, null, 2));

	console.log("\n=== estimating gas... ===");
	let gasEstimate;
	try {
		gasEstimate = await factory.createLaunch.estimateGas(config);
		console.log(`  gas estimate: ${gasEstimate.toString()}`);
	} catch (e) {
		console.error("  gas estimate FAILED:", e.message);
		if (e.data) console.error("  revert data:", e.data);
		process.exit(1);
	}

	const feeData = await provider.getFeeData();
	console.log(`  gas price: ${ethers.formatUnits(feeData.gasPrice, "gwei")} gwei`);
	const estCost = gasEstimate * feeData.gasPrice;
	console.log(`  est cost: ${ethers.formatEther(estCost)} BNB`);

	if (process.env.DRY_RUN === "1") {
		console.log("\n[DRY_RUN] Not broadcasting. Set DRY_RUN=0 to fire.");
		process.exit(0);
	}

	console.log("\n=== broadcasting createLaunch... ===");
	const tx = await factory.createLaunch(config, {
		gasLimit: (gasEstimate * 12n) / 10n, // 1.2x buffer
	});
	console.log(`  tx hash: ${tx.hash}`);
	console.log(`  bscscan: https://bscscan.com/tx/${tx.hash}`);

	console.log("\n=== waiting for confirmation... ===");
	const receipt = await tx.wait();
	console.log(`  block: ${receipt.blockNumber}`);
	console.log(`  gas used: ${receipt.gasUsed.toString()}`);
	console.log(`  status: ${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);

	if (receipt.status !== 1) {
		console.error("tx failed");
		process.exit(1);
	}

	// Parse LaunchCreated event
	const launchEvent = receipt.logs
		.map((log) => {
			try {
				return factory.interface.parseLog(log);
			} catch {
				return null;
			}
		})
		.find((parsed) => parsed && parsed.name === "LaunchCreated");

	if (launchEvent) {
		console.log("\n=== LAUNCH CREATED ===");
		console.log(`  predicted token:  ${launchEvent.args.predictedToken}`);
		console.log(`  vault:            ${launchEvent.args.vault}`);
		console.log(`  router:           ${launchEvent.args.router}`);
		console.log(`  treasuryLp:       ${launchEvent.args.treasuryLp}`);
		console.log(`  taxSplitter:      ${launchEvent.args.taxSplitter}`);
		console.log(`  agentSafe:        ${launchEvent.args.agentSafe}`);
		console.log(`  presale cap:      ${ethers.formatEther(launchEvent.args.presaleCap)} BNB`);
		console.log(`  v2 buy bnb:       ${ethers.formatEther(launchEvent.args.v2BuyBnb)} BNB`);

		// Persist launch record
		const launchRecord = {
			network: "bscMainnet",
			factory: FACTORY,
			creator: SOL_BURNER,
			predictedToken: launchEvent.args.predictedToken,
			vault: launchEvent.args.vault,
			router: launchEvent.args.router,
			treasuryLp: launchEvent.args.treasuryLp,
			taxSplitter: launchEvent.args.taxSplitter,
			agentSafe: launchEvent.args.agentSafe,
			presaleCapBnb: ethers.formatEther(launchEvent.args.presaleCap),
			v2BuyBnb: ethers.formatEther(launchEvent.args.v2BuyBnb),
			closeTimestamp: Number(launchEvent.args.closeTimestamp),
			tier: Number(launchEvent.args.tier),
			txHash: tx.hash,
			blockNumber: receipt.blockNumber,
			launchedAt: new Date().toISOString(),
			metaCid: META_CID,
			metaUri: `ipfs://${META_CID}`,
		};
		const outPath = "/home/shad0w/.moltbot/projects/waifu/launch-assets/waifu-launch-record.json";
		fs.writeFileSync(outPath, JSON.stringify(launchRecord, null, 2));
		console.log(`\n  launch record: ${outPath}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
