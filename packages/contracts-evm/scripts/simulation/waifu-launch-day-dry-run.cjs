// WAIFU Launch Day end-to-end dry-run on a BSC mainnet fork.
//
// Purpose: this is the FINAL go/no-go gate before real BNB hits the line.
// It replays the entire production flow for the first waifu.fun launch (WAIFU re-rehearsal 2026-05-21):
//
//   1. Deploy the Wave N / O.0 factory + helpers (as deploy-wave-n.js would)
//   2. Spin up a real Gnosis Safe to act as the Platform Safe
//   3. createLaunch with the locked WAIFU config (TIER_95, 3% / 3% tax, etc)
//   4. Multiple depositor EOAs fill the 64 BNB vault to the exact cap
//   5. Bundle bot closes the vault and runs executeBundle
//   6. finalizeLaunch deploys TreasuryLP5 and seeds the V3 pool
//   7. Real PCS V2 buys + sells drive tax events on the token
//   8. taxProcessor.dispatch() routes BNB through TaxSplitter
//   9. Treasury epochs advance, tier 0 deploys, claim() splits cash 3-way
//
// Every step is checked on chain (real PCS V2 + V3 + WBNB + Safe contracts
// from the forked mainnet block), and the final report is written to
//   /home/shad0w/.moltbot/projects/waifu/launch-day-waifu/LAUNCH_FLOW_DRY_RUN_REPORT.md
//
// Run:
//   cd packages/contracts-evm
//   FORK_BSC=true FORK_BSC_BLOCK=99073955 \
//     bunx hardhat run scripts/simulation/suki-launch-day-dry-run.cjs

const { ethers, network } = require("hardhat");
const fs = require("node:fs");
const path = require("node:path");

// =====================================================================
// Constants: real BSC mainnet addresses, copied from deploy-wave-n.js
// =====================================================================
const BSC = {
	WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
	PCS_FACTORY: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
	PCS_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
	PCS_V3_FACTORY: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
	PCS_V3_NPM: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
	PCS_V3_SWAP_ROUTER: "0x1b81D678ffb9C0263b24A97847620C99d213eB14",
	FLAP_PORTAL: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
	TOKEN_IMPL_TAXED_V3: "0x024f18294970B5c76c0691b87f138A0317156422",
	TIP_RECEIVER: "0x4848489f0b2BEdd788c696e2D79b6b69D7484848",
	SAFE_SINGLETON: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
	SAFE_PROXY_FACTORY: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
};

const REPORT = "/home/shad0w/.moltbot/projects/waifu/launch-day-waifu/LAUNCH_FLOW_DRY_RUN_REPORT.md";

// WAIFU production config (locked by Shadow, 2026-05-19)
const WAIFU = {
	name: "Waifu",
	symbol: "WAIFU",
	metaCid: "QmWaifuLaunchPlaceholderCidReplaceBeforeMainnet",
	tier: 2, // TIER_95 (WAGMI)
	buyTaxBps: 300, //  3%
	sellTaxBps: 300, //  3%
	taxDuration: 365 * 24 * 3600, // 365 days
	antiFarmerDuration: 3600, //  1 hour
	platformBps: 1000, // 10% of treasury claim BNB to platform
	patronBps: 2500, // 25% of treasury claim BNB to patron
	noBurn: false,
	// Wave O.1 LP5: ticks derived off-chain from WAGMI MC ladder via
	// scripts/lib/mc-to-tick.js. Computed below from a calibrated launch
	// FDV estimate (TIER_95 graduates around $47k FDV at $600 BNB on the
	// FLAP curve; if the real graduation FDV drifts, recompute via
	// computeTreasuryTicksFromMc(actualLaunchTick, actualLaunchFdvUsd)).
	mcCheckpoints: [5_000_000, 10_000_000, 25_000_000, 100_000_000],
	estimatedLaunchFdvUsd: 47_000,
};

const MAX_TICK = 887200;
const Q96 = 2n ** 96n;
const BNB_USD_PRICE = 600;

const { computeTreasuryTicksFromMc, WAGMI_MC_TARGETS_USD } = require("../lib/mc-to-tick.js");

// Derive treasury ticks from the WAGMI MC ladder using the canonical
// off-chain helper. Computed once at module load; the values flow into
// the createLaunch config below.
const { lowers: WAIFU_TREASURY_TICK_LOWERS, uppers: WAIFU_TREASURY_TICK_UPPERS } =
	computeTreasuryTicksFromMc(0, WAIFU.estimatedLaunchFdvUsd, WAIFU.mcCheckpoints || WAGMI_MC_TARGETS_USD);

// =====================================================================
// Logging + reporting
// =====================================================================
const lines = [];
const stepResults = []; // { step, status, detail }
const realNumbers = {}; // captured for final report

function log(s = "") {
	console.log(s);
	lines.push(s);
}
function banner(num, text) {
	log("");
	log(`## STEP ${num}: ${text}`);
	log("```text");
}
function endBanner() {
	log("```");
}
function kv(k, v) {
	log(`  ${k.padEnd(42)} ${v}`);
}
function pass(step, detail) {
	stepResults.push({ step, status: "PASS", detail });
	log(`PASS step ${step}: ${detail}`);
}
function fail(step, detail) {
	stepResults.push({ step, status: "FAIL", detail });
	log(`FAIL step ${step}: ${detail}`);
}
function investigate(step, detail) {
	stepResults.push({ step, status: "INVESTIGATE", detail });
	log(`INVESTIGATE step ${step}: ${detail}`);
}
function flushReport(extraTrailer = "") {
	const head = [
		"# WAIFU Launch Day End-to-End Dry-Run Report",
		`Generated: ${new Date().toISOString()}`,
		"Branch: chore/suki-launch-day-dry-run-2026-05-19 (off develop)",
		"Script: packages/contracts-evm/scripts/simulation/suki-launch-day-dry-run.cjs",
		"Fork: BSC mainnet (real PCS V2 + V3 + WBNB + Safe + FLAP portal)",
		"",
	];
	const passFailBlock = [
		"",
		"## Per-step verdicts",
		"",
		...stepResults.map(({ step, status, detail }) => `- step ${step}: ${status}  ${detail}`),
		"",
	];
	const numbersBlock = [
		"",
		"## Captured real numbers from the dry-run",
		"",
		...Object.entries(realNumbers).map(([k, v]) => `- ${k}: ${v}`),
		"",
	];
	const finalVerdict = computeFinalVerdict();
	const verdictBlock = ["", "## FINAL VERDICT", "", `> ${finalVerdict}`, ""];
	const body = [
		...head,
		...passFailBlock,
		...numbersBlock,
		...verdictBlock,
		"## Full log",
		"",
		"```text",
		...lines,
		"```",
	];
	if (extraTrailer) body.push("", extraTrailer);
	fs.mkdirSync(path.dirname(REPORT), { recursive: true });
	fs.writeFileSync(REPORT, `${body.join("\n")}\n`);
}
function computeFinalVerdict() {
	const fails = stepResults.filter((r) => r.status === "FAIL").length;
	const investigates = stepResults.filter((r) => r.status === "INVESTIGATE").length;
	if (fails > 0) return `BLOCKER: ${fails} step(s) failed. Do NOT launch until these are resolved.`;
	if (investigates > 0) return `NEEDS-FIX: ${investigates} step(s) need investigation. Triage before launch.`;
	return "WAIFU-LAUNCH-READY: all steps passed against real BSC mainnet fork.";
}

const bnb = (w) => `${ethers.formatEther(w || 0n)} BNB`;
const tok = (w) => `${ethers.formatUnits(w || 0n, 18)} WAIFU`;
const pct = (n, d) => (d === 0n ? "0" : (Number((n * 10000n) / d) / 100).toFixed(2));

// =====================================================================
// FLAP CREATE2 + vanity mining
// =====================================================================
function initCodeHash(impl) {
	return ethers.keccak256(
		`0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`,
	);
}
function effectiveSalt(creator, rawSalt) {
	return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [creator, rawSalt]));
}
// Mine for: ends in 7777 AND token address < WBNB (so token is token0 in the
// V2 + V3 pairs, which is what TreasuryLP5 expects for its tick math).
function mineVanity(deployer, codeHash, creator, label) {
	let rawSalt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string", "address"], [label, creator]));
	const wbnbLower = BSC.WBNB.toLowerCase();
	for (let i = 0; i < 8_000_000; i += 1) {
		const salt = effectiveSalt(creator, rawSalt);
		const predicted = ethers.getCreate2Address(deployer, salt, codeHash);
		const lower = predicted.toLowerCase();
		if (lower < wbnbLower && lower.endsWith("7777")) {
			return { rawSalt, salt, predicted, iterations: i };
		}
		rawSalt = ethers.keccak256(rawSalt);
	}
	throw new Error("vanity mining exceeded budget");
}

// =====================================================================
// Helpers (time, deadlines, V3 inventory)
// =====================================================================
async function latestDeadline() {
	return (await ethers.provider.getBlock("latest")).timestamp + 3600;
}
async function increase(seconds) {
	await network.provider.send("evm_increaseTime", [seconds]);
	await network.provider.send("evm_mine");
}
async function refreshFeed(mockFeed) {
	if (!mockFeed) return;
	const ts = (await ethers.provider.getBlock("latest")).timestamp;
	await (await mockFeed.setUpdatedAt(ts)).wait();
}
function tickToSqrtPriceX96Approx(tick) {
	return BigInt(Math.floor(Math.sqrt(1.0001 ** tick) * Number(Q96)));
}
function amount0ForLiquidity(liq, sqrtA, sqrtB) {
	let a = sqrtA;
	let b = sqrtB;
	if (a > b) {
		const t = a;
		a = b;
		b = t;
	}
	return (liq * (b - a) * Q96) / (b * a);
}
function amount1ForLiquidity(liq, sqrtA, sqrtB) {
	let a = sqrtA;
	let b = sqrtB;
	if (a > b) {
		const t = a;
		a = b;
		b = t;
	}
	return (liq * (b - a)) / Q96;
}
function tokenAmountInPosition(position, currentTick, tokenIsToken0) {
	const liq = position.liquidity;
	const sqrtL = tickToSqrtPriceX96Approx(Number(position.tickLower));
	const sqrtU = tickToSqrtPriceX96Approx(Number(position.tickUpper));
	const sqrtP = tickToSqrtPriceX96Approx(Number(currentTick));
	let amount0 = 0n;
	let amount1 = 0n;
	if (currentTick < position.tickLower) {
		amount0 = amount0ForLiquidity(liq, sqrtL, sqrtU);
	} else if (currentTick >= position.tickUpper) {
		amount1 = amount1ForLiquidity(liq, sqrtL, sqrtU);
	} else {
		amount0 = amount0ForLiquidity(liq, sqrtP, sqrtU);
		amount1 = amount1ForLiquidity(liq, sqrtL, sqrtP);
	}
	return tokenIsToken0 ? amount0 : amount1;
}
async function pairSnapshotMc(pair, token, wbnb) {
	const [pairWbnb, pairTokens, supply] = await Promise.all([
		wbnb.balanceOf(pair),
		token.balanceOf(pair),
		token.totalSupply(),
	]);
	if (pairTokens === 0n) return { pairWbnb, pairTokens, supply, mcUsd: 0 };
	const mcUsd =
		(Number(ethers.formatEther(pairWbnb)) / Number(ethers.formatEther(pairTokens))) *
		Number(ethers.formatEther(supply)) *
		BNB_USD_PRICE;
	return { pairWbnb, pairTokens, supply, mcUsd };
}

// =====================================================================
// MAIN
// =====================================================================
async function main() {
	const blockNumber = await ethers.provider.getBlockNumber();
	const net = await ethers.provider.getNetwork();
	log("# WAIFU Launch Day end-to-end dry-run");
	log(`Generated: ${new Date().toISOString()}`);
	log(`Fork block: ${blockNumber} (BSC mainnet, chain ${net.chainId})`);
	realNumbers.forkBlock = blockNumber;
	realNumbers.chainId = Number(net.chainId);

	const signers = await ethers.getSigners();
	const [deployer, psOwner, creator, dA, dB, dC, dD, dE, dF, dG, dH, bundleBot, t1, t2, t3, t4, t5] = signers;

	// -----------------------------------------------------------------
	// STEP 1: Platform Safe (real Gnosis Safe via SafeProxyFactory)
	// -----------------------------------------------------------------
	banner(1, "Spin up real Platform Safe");
	let platformSafeAddress;
	try {
		const safeProxyFactory = new ethers.Contract(
			BSC.SAFE_PROXY_FACTORY,
			[
				"function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address)",
				"event ProxyCreation(address indexed proxy, address singleton)",
			],
			psOwner,
		);
		const safeIface = new ethers.Interface([
			"function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
		]);
		const setupData = safeIface.encodeFunctionData("setup", [
			[psOwner.address],
			1,
			ethers.ZeroAddress,
			"0x",
			ethers.ZeroAddress,
			ethers.ZeroAddress,
			0,
			ethers.ZeroAddress,
		]);
		const receipt = await (
			await safeProxyFactory.createProxyWithNonce(BSC.SAFE_SINGLETON, setupData, Date.now())
		).wait();
		platformSafeAddress = safeProxyFactory.interface.parseLog(
			receipt.logs.find((l) => {
				try {
					return safeProxyFactory.interface.parseLog(l)?.name === "ProxyCreation";
				} catch {
					return false;
				}
			}),
		).args.proxy;
		kv("Platform Safe", platformSafeAddress);
		const code = await ethers.provider.getCode(platformSafeAddress);
		if (code === "0x") throw new Error("Safe proxy has no code");
		kv("Safe proxy code length", `${(code.length - 2) / 2} bytes`);
		realNumbers.platformSafeAddress = platformSafeAddress;
		endBanner();
		pass(1, `Platform Safe deployed at ${platformSafeAddress}`);
	} catch (e) {
		endBanner();
		fail(1, `Platform Safe deploy failed: ${e.shortMessage || e.message}`);
		throw e;
	}

	// -----------------------------------------------------------------
	// STEP 2: Factory + helper deploy (replays deploy-wave-n.js)
	// -----------------------------------------------------------------
	banner(2, "Deploy factory + helpers (Wave O.1 LP5 path)");
	let factoryAddress;
	let factory;
	try {
		const codeHashCheck = initCodeHash(BSC.TOKEN_IMPL_TAXED_V3);
		kv("Flap init code hash", codeHashCheck);
		// Wave O.1: TreasuryLP5 dropped Chainlink BNB/USD entirely. No mock
		// feed needed.
		const Router = await ethers.getContractFactory("RouterDeployer", deployer);
		const routerDeployer = await Router.deploy();
		await routerDeployer.waitForDeployment();
		kv("RouterDeployer", await routerDeployer.getAddress());
		const AgentSafeDep = await ethers.getContractFactory("AgentSafeDeployer", deployer);
		const agentSafeDeployer = await AgentSafeDep.deploy(BSC.SAFE_SINGLETON, BSC.SAFE_PROXY_FACTORY);
		await agentSafeDeployer.waitForDeployment();
		kv("AgentSafeDeployer", await agentSafeDeployer.getAddress());
		const TLP5Dep = await ethers.getContractFactory("TreasuryLP5Deployer", deployer);
		const treasuryLp5Deployer = await TLP5Dep.deploy();
		await treasuryLp5Deployer.waitForDeployment();
		kv("TreasuryLP5Deployer", await treasuryLp5Deployer.getAddress());
		const LF = await ethers.getContractFactory("LaunchFactory", deployer);
		factory = await LF.deploy(
			BSC.WBNB,
			BSC.PCS_FACTORY,
			BSC.PCS_ROUTER,
			codeHashCheck,
			BSC.FLAP_PORTAL,
			BSC.TOKEN_IMPL_TAXED_V3,
			BSC.TIP_RECEIVER,
			platformSafeAddress,
			await routerDeployer.getAddress(),
			await agentSafeDeployer.getAddress(),
			await treasuryLp5Deployer.getAddress(),
			BSC.PCS_V3_NPM,
			BSC.PCS_V3_FACTORY,
		);
		await factory.waitForDeployment();
		factoryAddress = await factory.getAddress();
		kv("LaunchFactory", factoryAddress);
		realNumbers.factoryAddress = factoryAddress;

		// Verify immutables, bytecode-check against the real on-chain refs.
		const checks = [
			["WBNB", await factory.WBNB(), BSC.WBNB],
			["PCS_FACTORY", await factory.PCS_FACTORY(), BSC.PCS_FACTORY],
			["PCS_ROUTER", await factory.PCS_ROUTER(), BSC.PCS_ROUTER],
			["FLAP_PORTAL", await factory.FLAP_PORTAL(), BSC.FLAP_PORTAL],
			["TOKEN_IMPL_TAXED_V3", await factory.TOKEN_IMPL_TAXED_V3(), BSC.TOKEN_IMPL_TAXED_V3],
			["TIP_RECEIVER", await factory.TIP_RECEIVER(), BSC.TIP_RECEIVER],
			["PCS_V3_NPM", await factory.PCS_V3_NPM(), BSC.PCS_V3_NPM],
			["PCS_V3_FACTORY", await factory.PCS_V3_FACTORY(), BSC.PCS_V3_FACTORY],
		];
		let allOk = true;
		for (const [name, actual, expected] of checks) {
			const match = String(actual).toLowerCase() === String(expected).toLowerCase();
			kv(name, `${actual} ${match ? "ok" : "MISMATCH"}`);
			if (!match) allOk = false;
		}
		// Bytecode sanity on key real-world contract addresses.
		for (const addr of [
			BSC.PCS_FACTORY,
			BSC.PCS_ROUTER,
			BSC.PCS_V3_FACTORY,
			BSC.PCS_V3_NPM,
			BSC.WBNB,
			BSC.FLAP_PORTAL,
			BSC.SAFE_SINGLETON,
			BSC.SAFE_PROXY_FACTORY,
		]) {
			const c = await ethers.provider.getCode(addr);
			if (c === "0x") {
				allOk = false;
				kv(`bytecode at ${addr}`, "MISSING");
			}
		}
		endBanner();
		if (!allOk) {
			fail(2, "factory immutables or upstream contract bytecode failed verification");
			throw new Error("factory verification failed");
		}
		pass(2, `factory deployed at ${factoryAddress}, all immutables verified, upstream bytecode present`);
	} catch (e) {
		endBanner();
		fail(2, `factory deploy failed: ${e.shortMessage || e.message}`);
		throw e;
	}

	// -----------------------------------------------------------------
	// STEP 3: Budget readback for TIER_95 at 3% buy tax
	// -----------------------------------------------------------------
	banner(3, "Read TIER_95 budget at 3% buy tax");
	let presaleCap;
	let quoteAmt;
	let v2BuyBnb;
	try {
		const [pCap, qAmt, v2Buy, vesting] = await factory.tierBudget(WAIFU.tier, WAIFU.buyTaxBps);
		presaleCap = pCap;
		quoteAmt = qAmt;
		v2BuyBnb = v2Buy;
		kv("presaleCap (BNB)", bnb(presaleCap));
		kv("quoteAmt to FLAP curve (BNB)", bnb(quoteAmt));
		kv("v2BuyBnb post-grad V2 seed buy", bnb(v2BuyBnb));
		kv("Sum matches presaleCap", quoteAmt + v2BuyBnb === presaleCap ? "ok" : "MISMATCH");
		kv("vesting enabled", vesting.toString());
		realNumbers.presaleCapBnb = ethers.formatEther(presaleCap);
		realNumbers.quoteAmtBnb = ethers.formatEther(quoteAmt);
		realNumbers.v2BuyBnb = ethers.formatEther(v2BuyBnb);
		// Sanity: TIER_95 spec calls for 64 BNB cap (range tolerated 60-68
		// depending on tax routing; allow soft check).
		if (presaleCap < ethers.parseEther("60") || presaleCap > ethers.parseEther("68")) {
			endBanner();
			investigate(3, `presale cap ${bnb(presaleCap)} outside expected 60-68 BNB band for TIER_95`);
		} else {
			endBanner();
			pass(3, `TIER_95 budget reads cleanly: ${bnb(presaleCap)} cap = ${bnb(quoteAmt)} + ${bnb(v2BuyBnb)}`);
		}
	} catch (e) {
		endBanner();
		fail(3, `tierBudget read failed: ${e.shortMessage || e.message}`);
		throw e;
	}

	// -----------------------------------------------------------------
	// STEP 4: Mine vanity salt with ...7777 suffix
	// -----------------------------------------------------------------
	banner(4, "Mine vanity salt for WAIFU (suffix 7777, token0 < WBNB)");
	let mined;
	try {
		const codeHash = initCodeHash(BSC.TOKEN_IMPL_TAXED_V3);
		const t0 = Date.now();
		mined = mineVanity(BSC.FLAP_PORTAL, codeHash, creator.address, "suki-launch-day-2026-05-19");
		const elapsedMs = Date.now() - t0;
		kv("Predicted WAIFU token", mined.predicted);
		kv("Iterations", mined.iterations.toString());
		kv("Elapsed ms", elapsedMs.toString());
		realNumbers.sukiPredictedTokenAddress = mined.predicted;
		realNumbers.vanityMineIterations = mined.iterations;
		realNumbers.vanityMineMs = elapsedMs;
		endBanner();
		pass(4, `vanity mined ${mined.predicted} in ${mined.iterations} iters`);
	} catch (e) {
		endBanner();
		fail(4, `vanity mine failed: ${e.shortMessage || e.message}`);
		throw e;
	}

	// -----------------------------------------------------------------
	// STEP 5: createLaunch with the exact WAIFU production config
	// -----------------------------------------------------------------
	banner(5, "createLaunch WAIFU on TIER_95");
	let launches;
	try {
		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const config = {
			name: WAIFU.name,
			symbol: WAIFU.symbol,
			metaCid: WAIFU.metaCid,
			creator: creator.address,
			bundleBot: bundleBot.address,
			tier: WAIFU.tier,
			buyTaxBps: WAIFU.buyTaxBps,
			sellTaxBps: WAIFU.sellTaxBps,
			taxDuration: WAIFU.taxDuration,
			antiFarmerDuration: WAIFU.antiFarmerDuration,
			closeTimestamp,
			vanitySalt: mined.rawSalt,
			predictedTokenAddress: mined.predicted,
			noBurn: WAIFU.noBurn,
			platformReceiver: platformSafeAddress,
			patron: creator.address,
			agentSafeOwners: [creator.address],
			agentSafeThreshold: 1,
			platformBps: WAIFU.platformBps,
			patronBps: WAIFU.patronBps,
			treasuryTickLowers: WAIFU_TREASURY_TICK_LOWERS,
			treasuryTickUppers: WAIFU_TREASURY_TICK_UPPERS,
		};
		const tx = await factory.connect(creator).createLaunch(config);
		const receipt = await tx.wait();
		kv("createLaunch gas", receipt.gasUsed.toString());
		launches = await factory.launches(mined.predicted);
		kv("Vault", launches.vault);
		kv("BundleRouter", launches.router);
		kv("TaxSplitter", launches.taxSplitter);
		kv("AgentSafe", launches.agentSafe);
		kv("TreasuryLP5 (placeholder pre-finalize)", launches.treasuryLp);
		realNumbers.vaultAddress = launches.vault;
		realNumbers.routerAddress = launches.router;
		realNumbers.taxSplitterAddress = launches.taxSplitter;
		realNumbers.agentSafeAddress = launches.agentSafe;
		realNumbers.closeTimestamp = closeTimestamp;

		// Bytecode check: vault, router, taxSplitter, agentSafe all have code.
		for (const [name, addr] of [
			["vault", launches.vault],
			["router", launches.router],
			["taxSplitter", launches.taxSplitter],
			["agentSafe", launches.agentSafe],
		]) {
			const code = await ethers.provider.getCode(addr);
			if (code === "0x") throw new Error(`${name} ${addr} has no bytecode`);
			kv(`${name} bytecode length`, `${(code.length - 2) / 2} bytes`);
		}
		endBanner();
		pass(5, `createLaunch ok, gas ${receipt.gasUsed}, vault ${launches.vault}`);
	} catch (e) {
		endBanner();
		fail(5, `createLaunch failed: ${e.shortMessage || e.message}`);
		throw e;
	}

	// -----------------------------------------------------------------
	// STEP 6: Multiple depositors fill the vault to the exact cap
	// -----------------------------------------------------------------
	banner(6, "Fill vault with multiple depositors (MAX_WALLET_DEPOSIT_BPS=6000)");
	const vault = new ethers.Contract(
		launches.vault,
		[
			"function deposit() payable",
			"function close()",
			"function totalDeposited() view returns (uint256)",
			"function deposits(address) view returns (uint256)",
		],
		ethers.provider,
	);
	let totalDeposited = 0n;
	try {
		// MAX_WALLET_DEPOSIT_BPS=6000 of presaleCap is the per-wallet ceiling.
		// At 64 BNB cap that is 38.4 BNB. We use 8 depositors to stay well under.
		const target = presaleCap;
		const planned = [
			[dA, ethers.parseEther("20.0")],
			[dB, ethers.parseEther("12.0")],
			[dC, ethers.parseEther("8.5")],
			[dD, ethers.parseEther("7.5")],
			[dE, ethers.parseEther("6.0")],
			[dF, ethers.parseEther("4.5")],
			[dG, ethers.parseEther("3.5")],
			[dH, ethers.parseEther("2.0")],
		];
		const sumPlanned = planned.reduce((s, [, v]) => s + v, 0n);
		if (sumPlanned !== target) {
			// Adjust last deposit so we hit the cap exactly.
			const diff = target - (sumPlanned - planned[planned.length - 1][1]);
			planned[planned.length - 1][1] = diff;
		}
		for (const [who, amt] of planned) {
			const tx = await vault.connect(who).deposit({ value: amt });
			await tx.wait();
			totalDeposited += amt;
			kv(`deposit ${who.address.slice(0, 10)}...`, bnb(amt));
		}
		const onchain = await vault.totalDeposited();
		kv("on-chain totalDeposited", bnb(onchain));
		kv("expected cap", bnb(presaleCap));
		kv("match", onchain === presaleCap ? "ok" : "MISMATCH");
		realNumbers.totalBnbCollected = ethers.formatEther(onchain);
		if (onchain !== presaleCap) throw new Error("vault did not reach exact cap");
		endBanner();
		pass(6, `vault filled to exact cap ${bnb(onchain)} across ${planned.length} wallets`);
	} catch (e) {
		endBanner();
		fail(6, `deposit flow failed: ${e.shortMessage || e.message}`);
		throw e;
	}

	// -----------------------------------------------------------------
	// STEP 7: Close vault + executeBundle from bundle bot
	// -----------------------------------------------------------------
	banner(7, "Bundle bot closes vault and runs executeBundle");
	const closeTimestampActual = (await ethers.provider.getBlock("latest")).timestamp;
	try {
		// Vault enforces a min-window before close (~900s in production).
		// Advance 901s to be safe.
		await increase(901);
		await (await vault.connect(bundleBot).close()).wait();
		const router = new ethers.Contract(
			launches.router,
			[
				"function executeBundle((bytes32,string,string,string,uint16,uint16,uint64,uint64,address,uint256,uint256)) returns (address)",
			],
			ethers.provider,
		);
		const closeTs = (await ethers.provider.getBlock("latest")).timestamp;
		const tx = await router
			.connect(bundleBot)
			.executeBundle([
				mined.rawSalt,
				WAIFU.name,
				WAIFU.symbol,
				WAIFU.metaCid,
				WAIFU.buyTaxBps,
				WAIFU.sellTaxBps,
				WAIFU.taxDuration,
				WAIFU.antiFarmerDuration,
				launches.taxSplitter,
				0n,
				closeTs + 3600,
			]);
		const receipt = await tx.wait();
		kv("executeBundle gas", receipt.gasUsed.toString());
		realNumbers.executeBundleGas = receipt.gasUsed.toString();
		// Token should now have bytecode at the predicted address.
		const code = await ethers.provider.getCode(mined.predicted);
		if (code === "0x") throw new Error(`token ${mined.predicted} not deployed after executeBundle`);
		kv("WAIFU token bytecode length", `${(code.length - 2) / 2} bytes`);
		endBanner();
		pass(7, `executeBundle ok, WAIFU token live at ${mined.predicted}`);
	} catch (e) {
		endBanner();
		fail(7, `executeBundle failed: ${e.shortMessage || e.message}`);
		throw e;
	}

	// -----------------------------------------------------------------
	// STEP 8: Post-bundle snapshot + finalizeLaunch
	// -----------------------------------------------------------------
	banner(8, "Snapshot post-bundle + finalizeLaunch -> TreasuryLP5");
	const token = new ethers.Contract(
		mined.predicted,
		[
			"function totalSupply() view returns (uint256)",
			"function balanceOf(address) view returns (uint256)",
			"function taxProcessor() view returns (address)",
			"function approve(address,uint256) returns (bool)",
			"function transfer(address,uint256) returns (bool)",
		],
		ethers.provider,
	);
	const wbnb = new ethers.Contract(
		BSC.WBNB,
		[
			"function balanceOf(address) view returns (uint256)",
			"function deposit() payable",
			"function approve(address,uint256) returns (bool)",
		],
		ethers.provider,
	);
	const pcsFactory = new ethers.Contract(
		BSC.PCS_FACTORY,
		["function getPair(address,address) view returns (address)"],
		ethers.provider,
	);
	let pair;
	let taxProcAddress;
	let finalLaunches;
	let treasury;
	try {
		const totalSupply = await token.totalSupply();
		kv("Total supply", tok(totalSupply));
		realNumbers.totalSupply = ethers.formatUnits(totalSupply, 18);
		pair = await pcsFactory.getPair(mined.predicted, BSC.WBNB);
		kv("V2 pair", pair);
		realNumbers.v2PairAddress = pair;
		const snap = await pairSnapshotMc(pair, token, wbnb);
		kv("V2 pair WBNB", bnb(snap.pairWbnb));
		kv("V2 pair WAIFU", tok(snap.pairTokens));
		kv("V2 pair MC USD", `$${snap.mcUsd.toFixed(0)}`);
		realNumbers.v2InitialMcUsd = `$${snap.mcUsd.toFixed(0)}`;
		realNumbers.v2InitialWbnb = ethers.formatEther(snap.pairWbnb);
		realNumbers.v2InitialTokens = ethers.formatUnits(snap.pairTokens, 18);

		taxProcAddress = await token.taxProcessor();
		const taxProc = new ethers.Contract(
			taxProcAddress,
			[
				"function commissionReceiver() view returns (address)",
				"function marketAddress() view returns (address)",
				"function feeReceiver() view returns (address)",
				"function dispatch()",
			],
			ethers.provider,
		);
		kv("FLAP TaxProcessor", taxProcAddress);
		const marketAddr = await taxProc.marketAddress();
		kv("TaxProcessor.marketAddress", marketAddr);
		kv(
			"marketAddress == TaxSplitter?",
			marketAddr.toLowerCase() === launches.taxSplitter.toLowerCase() ? "ok" : "MISMATCH",
		);
		realNumbers.flapTaxProcessor = taxProcAddress;

		// finalizeLaunch deploys TreasuryLP4 and creates the V3 pool.
		await (await factory.finalizeLaunch(mined.predicted)).wait();
		finalLaunches = await factory.launches(mined.predicted);
		kv("TreasuryLP5 (post-finalize)", finalLaunches.treasuryLp);
		realNumbers.treasuryLp5Address = finalLaunches.treasuryLp;
		if (finalLaunches.treasuryLp === ethers.ZeroAddress) throw new Error("TreasuryLP5 not deployed");

		treasury = new ethers.Contract(
			finalLaunches.treasuryLp,
			[
				// LP5 surface (no checkAndAdvance / currentMcUSD / setEpochLength /
				// nextTierIndex; tiers struct trimmed; launchTick is settable-once).
				"function claim()",
				"function tiers(uint256) view returns (uint256 tokenAmount,int24 tickLower,int24 tickUpper,bool deployed,bool paused,uint256 positionId)",
				"function tokenIsToken0() view returns (bool)",
				"function v3Pool() view returns (address)",
				"function launchTick() view returns (int24)",
				"function initialized() view returns (bool)",
				"function buybackBps() view returns (uint16)",
				"function claimable() view returns (uint256 totalBnb,uint256[4] perTierBnb)",
			],
			deployer,
		);
		const tokenIsToken0 = await treasury.tokenIsToken0();
		kv("tokenIsToken0", tokenIsToken0.toString());
		if (!tokenIsToken0) {
			throw new Error("CRITICAL: token must be token0 (vanity mine should have ensured this)");
		}
		// LP5: at finalizeLaunch, setFlapV2Pair runs and ALL 4 tiers mint single-
		// sided token0 positions atomically. So we expect the treasury's token
		// balance to drop near-zero after finalize (tokens flow into V3 positions).
		const treasuryTokenBalance = await token.balanceOf(finalLaunches.treasuryLp);
		kv("TreasuryLP5 token balance (post-mint, expected ~0)", tok(treasuryTokenBalance));
		realNumbers.treasuryLp5TokenBalanceAtFinalize = ethers.formatUnits(treasuryTokenBalance, 18);

		// Presalers must call vault.claim() to receive their vested share.
		// TIER_95 has vestingEnabled=true with 25% TGE then linear; at t=now
		// (right after distribute) they get the TGE chunk only.
		const vaultClaimable = new ethers.Contract(
			launches.vault,
			[
				"function claim()",
				"function claimableOf(address) view returns (uint256)",
				"function allocationOf(address) view returns (uint256)",
			],
			ethers.provider,
		);
		const depositors = [dA, dB, dC, dD, dE, dF, dG, dH];
		let claimedAny = 0n;
		for (const w of depositors) {
			const alloc = await vaultClaimable.allocationOf(w.address);
			const claimable = await vaultClaimable.claimableOf(w.address);
			if (claimable > 0n) {
				await (await vaultClaimable.connect(w).claim()).wait();
				claimedAny += claimable;
			}
			kv(`presaler ${w.address.slice(0, 8)} alloc/claim`, `${tok(alloc)} alloc -> ${tok(claimable)} claimable`);
		}
		const depBalances = await Promise.all(depositors.map((w) => token.balanceOf(w.address)));
		const totalPresaler = depBalances.reduce((s, v) => s + v, 0n);
		kv("Total tokens distributed to presalers (after claim)", tok(totalPresaler));
		realNumbers.totalPresalerTokens = ethers.formatUnits(totalPresaler, 18);
		realNumbers.presalerClaimedThisStep = ethers.formatUnits(claimedAny, 18);

		endBanner();
		const verdictBits = [
			`pair ${pair} live with ${bnb(snap.pairWbnb)} + ${tok(snap.pairTokens)}`,
			`TreasuryLP5 ${finalLaunches.treasuryLp} holds ${tok(treasuryTokenBalance)} (post-mint)`,
			`${tok(totalPresaler)} delivered to 8 presalers`,
		];
		pass(8, verdictBits.join("; "));
	} catch (e) {
		endBanner();
		fail(8, `finalize / post-bundle snapshot failed: ${e.shortMessage || e.message}`);
		throw e;
	}

	// -----------------------------------------------------------------
	// STEP 9 (LP5): Verify TreasuryLP5 minted all 4 tier positions atomically
	// at finalizeLaunch. Wave O.1 dropped epoch/MC advance — all tiers go
	// live in a single setFlapV2Pair tx. The legacy V2-pump + checkAndAdvance
	// dance is no longer needed. (Previous Wave N steps 9 + 10 retired.)
	// -----------------------------------------------------------------
	banner(9, "LP5 post-finalize: verify all 4 tier positions are live");
	const npm = new ethers.Contract(
		BSC.PCS_V3_NPM,
		[
			"function positions(uint256) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
		],
		ethers.provider,
	);
	let tier0PositionId;
	try {
		const launchTick = await treasury.launchTick();
		const v3Pool = await treasury.v3Pool();
		const initialized = await treasury.initialized();
		kv("launchTick (V2-derived)", launchTick.toString());
		kv("v3Pool", v3Pool);
		kv("initialized", initialized.toString());
		realNumbers.launchTick = launchTick.toString();
		realNumbers.v3PoolAddress = v3Pool;
		if (!initialized) throw new Error("TreasuryLP5 not initialized after finalize");

		const tierStatuses = [];
		for (let i = 0; i < 4; i += 1) {
			const t = await treasury.tiers(i);
			const row = {
				tokenAmount: t.tokenAmount,
				tickLower: Number(t.tickLower),
				tickUpper: Number(t.tickUpper),
				deployed: t.deployed,
				paused: t.paused,
				positionId: t.positionId,
			};
			tierStatuses.push(row);
			kv(
				`tier ${i}`,
				`ticks [${row.tickLower}, ${row.tickUpper}] tokens ${tok(row.tokenAmount)} deployed=${row.deployed} positionId=${row.positionId}`,
			);
			if (!row.paused && !row.deployed) throw new Error(`tier ${i} not deployed after finalize`);
			if (!row.paused && row.positionId === 0n) throw new Error(`tier ${i} positionId == 0`);
		}
		tier0PositionId = tierStatuses[0].positionId;
		realNumbers.tier0PositionId = tier0PositionId.toString();
		realNumbers.tier0Ticks = `[${tierStatuses[0].tickLower}, ${tierStatuses[0].tickUpper}]`;

		// Cross-check positionId on real PCS V3 NPM.
		const pos0 = await npm.positions(tier0PositionId);
		kv("tier 0 NPM tickLower/Upper", `[${pos0.tickLower}, ${pos0.tickUpper}]`);
		kv("tier 0 NPM liquidity", pos0.liquidity.toString());
		if (pos0.liquidity === 0n) throw new Error("tier 0 NPM position has zero liquidity");

		endBanner();
		pass(
			9,
			`launchTick=${launchTick}, v3Pool=${v3Pool}, all 4 tiers minted (tier0 positionId=${tier0PositionId})`,
		);
	} catch (e) {
		endBanner();
		fail(9, `LP5 post-finalize verification failed: ${e.shortMessage || e.message}`);
		throw e;
	}

	// -----------------------------------------------------------------
	// STEP 11: PCS V3 swap drives fees, treasury.claim() distributes
	// -----------------------------------------------------------------
	banner(11, "V3 swap drives fees, treasury.claim() splits to platform/patron/agent + buyback burn");
	try {
		const v3Router = new ethers.Contract(
			BSC.PCS_V3_SWAP_ROUTER,
			[
				"function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
			],
			ethers.provider,
		);
		// Trader t1 wraps + approves + buys WAIFU through V3 (1% fee tier).
		await (await wbnb.connect(t1).deposit({ value: ethers.parseEther("60") })).wait();
		await (await wbnb.connect(t1).approve(BSC.PCS_V3_SWAP_ROUTER, ethers.MaxUint256)).wait();
		await (
			await v3Router
				.connect(t1)
				.exactInputSingle([
					BSC.WBNB,
					mined.predicted,
					10000,
					t1.address,
					await latestDeadline(),
					ethers.parseEther("35"),
					0,
					0,
				])
		).wait();
		// And a smaller follow-up to make sure fees accumulate.
		await (
			await v3Router
				.connect(t1)
				.exactInputSingle([
					BSC.WBNB,
					mined.predicted,
					10000,
					t1.address,
					await latestDeadline(),
					ethers.parseEther("10"),
					0,
					0,
				])
		).wait();

		const [claimablePre] = await treasury.claimable();
		kv("claimable BNB before claim", bnb(claimablePre));

		// Pre balances. Agent is impersonated EOA; we top it up to a known
		// reference value, then measure delta after claim (delta should equal
		// inflow_from_claim - gasCost).
		const deadAddr = "0x000000000000000000000000000000000000dEaD";
		const platformBefore = await ethers.provider.getBalance(platformSafeAddress);
		const patronBefore = await ethers.provider.getBalance(creator.address);
		const deadTokenBefore = await token.balanceOf(deadAddr);

		// Impersonate AgentSafe to call claim. Set to a known 100 BNB so the
		// post-claim delta math is unambiguous: agentGot = (post - 100) + gasCost.
		const REF_BAL_HEX = "0x56BC75E2D63100000"; // 100 BNB
		const REF_BAL_WEI = ethers.parseEther("100");
		await network.provider.request({ method: "hardhat_impersonateAccount", params: [launches.agentSafe] });
		await network.provider.send("hardhat_setBalance", [launches.agentSafe, REF_BAL_HEX]);
		const safeSigner = await ethers.getSigner(launches.agentSafe);
		const claimReceipt = await (await treasury.connect(safeSigner).claim()).wait();
		await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [launches.agentSafe] });
		kv("claim gas", claimReceipt.gasUsed.toString());

		// Post balances and deltas.
		const platformGot = (await ethers.provider.getBalance(platformSafeAddress)) - platformBefore;
		const patronGot = (await ethers.provider.getBalance(creator.address)) - patronBefore;
		const gasCost = claimReceipt.gasUsed * (claimReceipt.gasPrice ?? 0n);
		const agentNow = await ethers.provider.getBalance(launches.agentSafe);
		const agentGot = agentNow - REF_BAL_WEI + gasCost;
		const deadTokenAfter = await token.balanceOf(deadAddr);
		const burnedTokens = deadTokenAfter - deadTokenBefore;

		const distributedBnb = platformGot + patronGot + (agentGot > 0n ? agentGot : 0n);
		kv("platform got BNB", bnb(platformGot));
		kv("patron got BNB", bnb(patronGot));
		kv("agent (net of gas top-up) BNB", bnb(agentGot));
		kv("tokens burned to dEaD", tok(burnedTokens));
		realNumbers.claimPlatformBnb = ethers.formatEther(platformGot);
		realNumbers.claimPatronBnb = ethers.formatEther(patronGot);
		realNumbers.claimAgentBnb = ethers.formatEther(agentGot);
		realNumbers.claimBurnedTokens = ethers.formatUnits(burnedTokens, 18);

		// Expected BNB-only ratios when buyback (10%) is paid in tokens:
		//   platform 5/90 = 5.56%
		//   patron  20/90 = 22.22%
		//   agent   65/90 = 72.22%
		if (distributedBnb > 0n) {
			const pP = pct(platformGot, distributedBnb);
			const pA = pct(patronGot, distributedBnb);
			const pG = pct(agentGot > 0n ? agentGot : 0n, distributedBnb);
			kv("split percentages (P/A/G)", `${pP}% / ${pA}% / ${pG}%`);
			realNumbers.claimSplitPercentages = `platform ${pP}%, patron ${pA}%, agent ${pG}%`;
			endBanner();
			const platformInRange = Math.abs(Number(pP) - 5.56) < 1.5;
			const patronInRange = Math.abs(Number(pA) - 22.22) < 2.5;
			const agentInRange = Math.abs(Number(pG) - 72.22) < 2.5;
			if (platformInRange && patronInRange && agentInRange && burnedTokens > 0n) {
				pass(11, `claim split P:${pP}% / Patron:${pA}% / Agent:${pG}% with ${tok(burnedTokens)} burned`);
			} else {
				investigate(
					11,
					`split ratios drift from 5.56/22.22/72.22 spec: got P:${pP}% Patron:${pA}% Agent:${pG}% burned:${tok(burnedTokens)}`,
				);
			}
		} else {
			endBanner();
			investigate(11, "no BNB distributed; V3 fees may not have accrued yet");
		}
	} catch (e) {
		endBanner();
		fail(11, `treasury claim failed: ${e.shortMessage || e.message}`);
	}

	// -----------------------------------------------------------------
	// STEP 12: Real V2 sell -> tax routes through TaxSplitter to 3-way
	// -----------------------------------------------------------------
	banner(12, "Real V2 sell triggers TaxSplitter route, verify 3-way distribution");
	try {
		const taxProc = new ethers.Contract(
			taxProcAddress,
			[
				"function dispatch()",
				"function marketAddress() view returns (address)",
				"function feeReceiver() view returns (address)",
			],
			ethers.provider,
		);
		const splitter = new ethers.Contract(
			launches.taxSplitter,
			[
				"function platform() view returns (address)",
				"function patron() view returns (address)",
				"function agent() view returns (address)",
				"function split()",
			],
			ethers.provider,
		);
		// Pick a trader who holds tokens.
		const seller = t1;
		const sellerBalance = await token.balanceOf(seller.address);
		if (sellerBalance === 0n) throw new Error("seller has no WAIFU tokens");
		const sellAmt = sellerBalance / 2n;
		await (await token.connect(seller).approve(BSC.PCS_ROUTER, sellAmt)).wait();
		const sellerBnbBefore = await ethers.provider.getBalance(seller.address);
		const sellReceipt = await (
			await pcsRouter
				.connect(seller)
				.swapExactTokensForETHSupportingFeeOnTransferTokens(
					sellAmt,
					0,
					[mined.predicted, BSC.WBNB],
					seller.address,
					await latestDeadline(),
				)
		).wait();
		const sellerBnbAfter = await ethers.provider.getBalance(seller.address);
		const sellGasCost = sellReceipt.gasUsed * (sellReceipt.gasPrice ?? 1n);
		const bnbOut = sellerBnbAfter - sellerBnbBefore + sellGasCost;
		kv("seller sold", tok(sellAmt));
		kv("seller received BNB", bnb(bnbOut));
		realNumbers.realSellAmountTokens = ethers.formatUnits(sellAmt, 18);
		realNumbers.realSellReceivedBnb = ethers.formatEther(bnbOut);

		// Pre-dispatch sinks.
		const taxProcWbnbPre = await wbnb.balanceOf(taxProcAddress);
		const tokenSelfBefore = await token.balanceOf(mined.predicted);
		const splitterBnbPre = await ethers.provider.getBalance(launches.taxSplitter);
		const routerBnbPre = await ethers.provider.getBalance(launches.router);
		kv("TaxProc WBNB pre-dispatch", bnb(taxProcWbnbPre));
		kv("Token self-balance (pending tax)", tok(tokenSelfBefore));
		kv("Splitter BNB pre-dispatch", bnb(splitterBnbPre));

		// Dispatch: anyone can call.
		await (await taxProc.connect(deployer).dispatch()).wait();
		const splitterBnbPost = await ethers.provider.getBalance(launches.taxSplitter);
		const routerBnbPost = await ethers.provider.getBalance(launches.router);
		const splitterGot = splitterBnbPost - splitterBnbPre;
		const routerGot = routerBnbPost - routerBnbPre;
		kv("Splitter received BNB", bnb(splitterGot));
		kv("Router received BNB (should be 0)", bnb(routerGot));
		realNumbers.taxRouteSplitterBnb = ethers.formatEther(splitterGot);
		realNumbers.taxRouteRouterStrandedBnb = ethers.formatEther(routerGot);

		const platformAddr = await splitter.platform();
		const patronAddr = await splitter.patron();
		const agentAddr = await splitter.agent();
		kv("Splitter.platform", platformAddr);
		kv("Splitter.patron", patronAddr);
		kv("Splitter.agent", agentAddr);
		const pPre = await ethers.provider.getBalance(platformAddr);
		const paPre = await ethers.provider.getBalance(patronAddr);
		const aPre = await ethers.provider.getBalance(agentAddr);

		if (splitterGot > 0n) {
			await (await splitter.connect(deployer).split()).wait();
		}
		const pGot = (await ethers.provider.getBalance(platformAddr)) - pPre;
		const paGot = (await ethers.provider.getBalance(patronAddr)) - paPre;
		const aGot = (await ethers.provider.getBalance(agentAddr)) - aPre;
		const total = pGot + paGot + aGot;
		kv("platform received", bnb(pGot));
		kv("patron received", bnb(paGot));
		kv("agent received", bnb(aGot));
		realNumbers.taxRoutePlatformBnb = ethers.formatEther(pGot);
		realNumbers.taxRoutePatronBnb = ethers.formatEther(paGot);
		realNumbers.taxRouteAgentBnb = ethers.formatEther(aGot);

		endBanner();
		if (total === 0n) {
			investigate(12, "TaxSplitter.split() produced 0 BNB to any sink; check whether dispatch already routed");
		} else if (routerGot > 0n) {
			fail(12, `BundleRouter received ${bnb(routerGot)} (tax route leak)`);
		} else {
			const pP = pct(pGot, total);
			const pA = pct(paGot, total);
			const pG = pct(aGot, total);
			// Spec: 10% platform, 25% patron, 65% agent.
			const inSpec = Math.abs(Number(pP) - 10) < 2 && Math.abs(Number(pA) - 25) < 3 && Math.abs(Number(pG) - 65) < 3;
			if (inSpec) {
				pass(12, `tax split clean: ${pP}% platform / ${pA}% patron / ${pG}% agent (10/25/65 spec)`);
			} else {
				investigate(12, `tax split off spec: ${pP}% / ${pA}% / ${pG}%`);
			}
		}
	} catch (e) {
		endBanner();
		fail(12, `tax split route failed: ${e.shortMessage || e.message}`);
	}

	// -----------------------------------------------------------------
	// STEP 13: Stranded BNB leak check
	// -----------------------------------------------------------------
	banner(13, "Stranded BNB leak check on every protocol sink");
	try {
		const sinks = {
			vault: await ethers.provider.getBalance(launches.vault),
			router: await ethers.provider.getBalance(launches.router),
			splitter: await ethers.provider.getBalance(launches.taxSplitter),
			treasury: await ethers.provider.getBalance(finalLaunches.treasuryLp),
			factory: await ethers.provider.getBalance(factoryAddress),
			tokenSelfWbnb: await wbnb.balanceOf(mined.predicted),
			taxProcWbnb: await wbnb.balanceOf(taxProcAddress),
		};
		for (const [k, v] of Object.entries(sinks)) kv(k, bnb(v));
		const totalStranded = Object.values(sinks).reduce((s, v) => s + v, 0n);
		kv("total stranded", bnb(totalStranded));
		realNumbers.totalStrandedBnbAtEnd = ethers.formatEther(totalStranded);
		endBanner();
		// Threshold: under 0.05 BNB stranded means rounding only, no leak.
		if (totalStranded < ethers.parseEther("0.05")) {
			pass(13, `total stranded ${bnb(totalStranded)} below 0.05 BNB noise floor`);
		} else {
			investigate(13, `total stranded ${bnb(totalStranded)} above noise floor; inspect splitter/treasury`);
		}
	} catch (e) {
		endBanner();
		fail(13, `stranded check failed: ${e.shortMessage || e.message}`);
	}

	flushReport();
}

main().catch((e) => {
	console.error(e);
	log("");
	log("## FATAL ERROR");
	log(e.stack || e.message);
	flushReport(`> FATAL: ${e.message}`);
	process.exit(1);
});
