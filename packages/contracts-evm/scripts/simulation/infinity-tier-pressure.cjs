// Wave O.0 infinity-tier pressure fork test.
// Proves overlapping PCS V3 ranges [entryTick, 887200] against real BSC contracts.

const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const fs = require("node:fs");

const BSC = {
	PCS_FACTORY: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
	PCS_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
	PCS_V3_FACTORY: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
	PCS_V3_NPM: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
	PCS_V3_SWAP_ROUTER: "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
	WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
	FLAP_PORTAL: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
	TOKEN_IMPL_TAXED_V3: "0x024f18294970B5c76c0691b87f138A0317156422",
	TIP_RECEIVER: "0x4848489f0b2BEdd788c696e2D79b6b69D7484848",
	SAFE_SINGLETON: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
	SAFE_PROXY_FACTORY: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
};

const REPORT = "/home/shad0w/.moltbot/projects/waifu/wave-o/STREAM2_FORK_TEST_REPORT.md";
const MAX_TICK_INFINITY = 887200;
const BNB_USD = 600;
const Q96 = 2n ** 96n;
const TIER_LOWER_TICKS = [2000, 9000, 18200, 32000];
const MC_CHECKPOINTS = [5_000_000, 10_000_000, 25_000_000, 100_000_000];
const lines = [];
const passFail = [];
const tokenRows = [];
let mathValidation = null;

function log(s = "") { console.log(s); lines.push(s); }
function bnb(w) { return `${ethers.formatEther(w || 0n)} BNB`; }
function tok(w) { return `${ethers.formatUnits(w || 0n, 18)} INF`; }
function fmtM(v) { return `$${(Number(v) / 1e6).toFixed(2)}M`; }
function pct(n, d) { return d === 0n ? 0 : Number((n * 10000n) / d) / 100; }
function ok(step, text) { passFail.push([step, "PASS", text]); log(`PASS Step ${step}: ${text}`); }
function fail(step, text) { passFail.push([step, "FAIL", text]); log(`FAIL Step ${step}: ${text}`); }
function expectClose(actual, expected, toleranceBps, label) {
	const a = BigInt(actual);
	const e = BigInt(expected);
	const diff = a > e ? a - e : e - a;
	expect(diff * 10000n, label).to.be.lte(e * BigInt(toleranceBps));
}
function initCodeHash(impl) {
	return ethers.keccak256(`0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`);
}
function effectiveSalt(creator, rawSalt) {
	return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [creator, rawSalt]));
}
function mineToken0Salt(deployer, codeHash, creator, label) {
	let rawSalt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string", "address"], [label, creator]));
	for (let i = 0; i < 8_000_000; i += 1) {
		const salt = effectiveSalt(creator, rawSalt);
		const predicted = ethers.getCreate2Address(deployer, salt, codeHash);
		if (predicted.toLowerCase() < BSC.WBNB.toLowerCase() && predicted.toLowerCase().endsWith("7777")) {
			return { rawSalt, salt, predicted, iterations: i };
		}
		rawSalt = ethers.keccak256(rawSalt);
	}
	throw new Error("token0 vanity mining exceeded");
}
function tickToSqrtPriceX96Approx(tick) {
	return BigInt(Math.floor(Math.sqrt(Math.pow(1.0001, tick)) * Number(Q96)));
}
function amount0ForLiquidity(liq, sqrtA, sqrtB) {
	if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
	return (liq * (sqrtB - sqrtA) * Q96) / (sqrtB * sqrtA);
}
function amount1ForLiquidity(liq, sqrtA, sqrtB) {
	if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
	return (liq * (sqrtB - sqrtA)) / Q96;
}
function tokenAmountInPosition(position, slot0Tick, tokenIsToken0) {
	const liq = position.liquidity;
	const sqrtL = tickToSqrtPriceX96Approx(Number(position.tickLower));
	const sqrtU = tickToSqrtPriceX96Approx(Number(position.tickUpper));
	const sqrtP = tickToSqrtPriceX96Approx(Number(slot0Tick));
	let amount0 = 0n;
	let amount1 = 0n;
	if (slot0Tick < position.tickLower) {
		amount0 = amount0ForLiquidity(liq, sqrtL, sqrtU);
	} else if (slot0Tick >= position.tickUpper) {
		amount1 = amount1ForLiquidity(liq, sqrtL, sqrtU);
	} else {
		amount0 = amount0ForLiquidity(liq, sqrtP, sqrtU);
		amount1 = amount1ForLiquidity(liq, sqrtL, sqrtP);
	}
	return tokenIsToken0 ? amount0 : amount1;
}
async function latestDeadline() {
	return (await ethers.provider.getBlock("latest")).timestamp + 3600;
}
async function increase(seconds) {
	await network.provider.send("evm_increaseTime", [seconds]);
	await network.provider.send("evm_mine");
}
async function pairSnapshot(pair, token, wbnb) {
	const [pairWbnb, pairTokens, supply] = await Promise.all([
		wbnb.balanceOf(pair),
		token.balanceOf(pair),
		token.totalSupply(),
	]);
	const mcUsd = Number(ethers.formatEther(pairWbnb)) / Number(ethers.formatEther(pairTokens)) * Number(ethers.formatEther(supply)) * BNB_USD;
	return { pairWbnb, pairTokens, supply, mcUsd };
}
async function refreshFeed(feed) {
	await (await feed.setUpdatedAt((await ethers.provider.getBlock("latest")).timestamp)).wait();
}

async function main() {
	const blockNumber = await ethers.provider.getBlockNumber();
	log("# Wave O.0 infinity-tier pressure fork test");
	log(`Generated: ${new Date().toISOString()}`);
	log(`Fork block: ${blockNumber}`);
	log(`V3 upper for every tier: ${MAX_TICK_INFINITY}`);
	log(`Tier lower ticks: [${TIER_LOWER_TICKS.join(", ")}]`);
	log("");

	const signers = await ethers.getSigners();
	const [deployer, psOwner, creator, dA, dB, dC, dD, dE, dF, dG, dH, bundleBot, t1, t2, t3, t4, t5] = signers;

	log("Step 1: Deploy Safe, mock live feed, factory, and create launch with infinity config");
	const MockFeed = await ethers.getContractFactory("MockBnbUsdFeed", deployer);
	const feed = await MockFeed.deploy(600n * 100000000n);
	await feed.waitForDeployment();
	const safeProxyFactory = new ethers.Contract(BSC.SAFE_PROXY_FACTORY, [
		"function createProxyWithNonce(address singleton, bytes initializer, uint256 saltNonce) returns (address)",
		"event ProxyCreation(address indexed proxy, address singleton)",
	], psOwner);
	const safeIface = new ethers.Interface([
		"function setup(address[] _owners,uint256 _threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
	]);
	const setupData = safeIface.encodeFunctionData("setup", [[psOwner.address], 1, ethers.ZeroAddress, "0x", ethers.ZeroAddress, ethers.ZeroAddress, 0, ethers.ZeroAddress]);
	const safeReceipt = await (await safeProxyFactory.createProxyWithNonce(BSC.SAFE_SINGLETON, setupData, Date.now())).wait();
	const platformSafeAddress = safeProxyFactory.interface.parseLog(safeReceipt.logs.find((l) => { try { return safeProxyFactory.interface.parseLog(l)?.name === "ProxyCreation"; } catch { return false; } })).args.proxy;

	const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer", deployer);
	const routerDeployer = await RouterDeployerCF.deploy(); await routerDeployer.waitForDeployment();
	const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeDeployer", deployer);
	const agentSafeDeployer = await AgentSafeDeployerCF.deploy(BSC.SAFE_SINGLETON, BSC.SAFE_PROXY_FACTORY); await agentSafeDeployer.waitForDeployment();
	const TreasuryLP4DeployerCF = await ethers.getContractFactory("TreasuryLP4Deployer", deployer);
	const treasuryLp4Deployer = await TreasuryLP4DeployerCF.deploy(); await treasuryLp4Deployer.waitForDeployment();
	const LaunchFactoryCF = await ethers.getContractFactory("LaunchFactory", deployer);
	const factory = await LaunchFactoryCF.deploy(
		BSC.WBNB, BSC.PCS_FACTORY, BSC.PCS_ROUTER, initCodeHash(BSC.TOKEN_IMPL_TAXED_V3),
		BSC.FLAP_PORTAL, BSC.TOKEN_IMPL_TAXED_V3, BSC.TIP_RECEIVER, platformSafeAddress,
		await routerDeployer.getAddress(), await agentSafeDeployer.getAddress(), await treasuryLp4Deployer.getAddress(),
		BSC.PCS_V3_NPM, BSC.PCS_V3_FACTORY, await feed.getAddress(),
	);
	await factory.waitForDeployment();

	const buyTaxBps = 300;
	const sellTaxBps = 300;
	const [presaleCap] = await factory.tierBudget(2, buyTaxBps);
	const mined = mineToken0Salt(BSC.FLAP_PORTAL, initCodeHash(BSC.TOKEN_IMPL_TAXED_V3), creator.address, "infinity-tier-pressure");
	const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
	const config = {
		name: "Infinity Pressure", symbol: "INF", metaCid: "QmInfinityPressure",
		creator: creator.address, bundleBot: bundleBot.address, tier: 2, buyTaxBps, sellTaxBps,
		taxDuration: 31_536_000, antiFarmerDuration: 3600, closeTimestamp,
		vanitySalt: mined.rawSalt, predictedTokenAddress: mined.predicted, noBurn: false,
		platformReceiver: platformSafeAddress, patron: creator.address,
		agentSafeOwners: [creator.address], agentSafeThreshold: 1,
		platformBps: 1000, patronBps: 2500,
		treasuryTickLowers: TIER_LOWER_TICKS,
		treasuryTickUppers: [MAX_TICK_INFINITY, MAX_TICK_INFINITY, MAX_TICK_INFINITY, MAX_TICK_INFINITY],
	};
	expect(BigInt(mined.predicted)).to.be.lessThan(BigInt(BSC.WBNB));
	const createReceipt = await (await factory.connect(creator).createLaunch(config)).wait();
	const launches = await factory.launches(mined.predicted);
	log(`createLaunch gas ${createReceipt.gasUsed}`);
	log(`Token ${mined.predicted}`);
	log(`AgentSafe ${launches.agentSafe}`);
	ok(1, "launch accepted overlapping infinity tier ranges");

	log("");
	log("Step 2: Bundle execute and finalizeLaunch");
	const vault = new ethers.Contract(launches.vault, ["function deposit() payable", "function close()", "function totalDeposited() view returns (uint256)"], ethers.provider);
	const deposits = [[dA, "20"], [dB, "12"], [dC, "8.5"], [dD, "7.5"], [dE, "6"], [dF, "4.5"], [dG, "3.5"], [dH, "2"]];
	for (const [who, amt] of deposits) await (await vault.connect(who).deposit({ value: ethers.parseEther(amt) })).wait();
	expect(await vault.totalDeposited()).to.equal(presaleCap);
	await increase(901);
	await (await vault.connect(bundleBot).close()).wait();
	const router = new ethers.Contract(launches.router, ["function executeBundle((bytes32,string,string,string,uint16,uint16,uint64,uint64,address,uint256,uint256)) returns (address)"], ethers.provider);
	await (await router.connect(bundleBot).executeBundle([mined.rawSalt, config.name, config.symbol, config.metaCid, buyTaxBps, sellTaxBps, config.taxDuration, config.antiFarmerDuration, launches.taxSplitter, 0n, closeTimestamp + 3600])).wait();
	await refreshFeed(feed);
	await (await factory.finalizeLaunch(mined.predicted)).wait();
	const finalLaunches = await factory.launches(mined.predicted);
	expect(finalLaunches.treasuryLp).to.not.equal(ethers.ZeroAddress);
	ok(2, `finalized TreasuryLP4 at ${finalLaunches.treasuryLp}`);

	const token = new ethers.Contract(mined.predicted, ["function totalSupply() view returns (uint256)", "function balanceOf(address) view returns (uint256)", "function approve(address,uint256) returns (bool)"], ethers.provider);
	const wbnb = new ethers.Contract(BSC.WBNB, ["function balanceOf(address) view returns (uint256)", "function deposit() payable", "function approve(address,uint256) returns (bool)"], ethers.provider);
	const pcsFactory = new ethers.Contract(BSC.PCS_FACTORY, ["function getPair(address,address) view returns (address)"], ethers.provider);
	const pair = await pcsFactory.getPair(mined.predicted, BSC.WBNB);
	const treasury = new ethers.Contract(finalLaunches.treasuryLp, [
		"function checkAndAdvance()", "function claim()", "function currentMcUSD() view returns (uint256)",
		"function oraclePoke()", "function setEpochLength(uint256)", "function nextTierIndex() view returns (uint8)",
		"function tiers(uint256) view returns (uint256 targetMcUSD,uint256 tokenAmount,int24 tickLower,int24 tickUpper,uint8 minEpochs,uint8 epochsAbove,uint32 lastEpochTimestamp,bool deployed,bool paused,uint256 positionId)",
		"function tokenIsToken0() view returns (bool)", "function v3Pool() view returns (address)",
		"function claimable() view returns (uint256 totalBnb,uint256[4] perTierBnb)",
	], deployer);
	const tokenIsToken0 = await treasury.tokenIsToken0();
	expect(tokenIsToken0).to.equal(true);

	log("");
	log("Step 3: Snapshot initial pair reserves and MC");
	let snap = await pairSnapshot(pair, token, wbnb);
	log(`initial pair ${bnb(snap.pairWbnb)} and ${tok(snap.pairTokens)}, MC ${fmtM(snap.mcUsd)}`);
	ok(3, "initial reserves and market cap captured");

	log("");
	log("Step 4: Pump V2 price with progressively larger buys");
	await increase(config.antiFarmerDuration + 60);
	const pcsRouter = new ethers.Contract(BSC.PCS_ROUTER, ["function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable"], ethers.provider);
	for (const [trader, amt] of [[t1, 5], [t2, 10], [t3, 20], [t4, 40], [t5, 100]]) {
		await (await pcsRouter.connect(trader).swapExactETHForTokensSupportingFeeOnTransferTokens(0, [BSC.WBNB, mined.predicted], trader.address, await latestDeadline(), { value: ethers.parseEther(String(amt)) })).wait();
		snap = await pairSnapshot(pair, token, wbnb);
		log(`buy ${amt} BNB -> MC now ${fmtM(snap.mcUsd)}`);
	}
	ok(4, "V2 pressure buys completed and MC logged");

	log("");
	log("Step 5: Advance epochs and deploy all four infinity tiers");
	await network.provider.request({ method: "hardhat_impersonateAccount", params: [launches.agentSafe] });
	await network.provider.send("hardhat_setBalance", [launches.agentSafe, "0x56BC75E2D63100000"]);
	await (await treasury.connect(await ethers.getSigner(launches.agentSafe)).setEpochLength(3600)).wait();
	await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [launches.agentSafe] });
	const npm = new ethers.Contract(BSC.PCS_V3_NPM, ["function positions(uint256) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)"], ethers.provider);
	const deployedIds = [];
	const extraBuyers = [t1, t2, t3, t4, t5];
	const tierBoostBnb = [0, 80, 600, 4000];
	for (let i = 0; i < 4; i += 1) {
		const tier = await treasury.tiers(i);
		// Wave O.0.2 — each tier deploy triggers TaxedTokenV3 state-flip kick
		// (transfer-0 to mainPool) which incidentally liquidates accumulated
		// FLAP sell-tax tokens into the V2 pair, depressing MC. Pump V2 price
		// up between tiers so the next target is re-cleared.
		if (tierBoostBnb[i] > 0) {
			const booster = extraBuyers[i % extraBuyers.length];
			await (await pcsRouter.connect(booster).swapExactETHForTokensSupportingFeeOnTransferTokens(0, [BSC.WBNB, mined.predicted], booster.address, await latestDeadline(), { value: ethers.parseEther(String(tierBoostBnb[i])) })).wait();
			const snap2 = await pairSnapshot(pair, token, wbnb);
			log(`pre-tier-${i} pump ${tierBoostBnb[i]} BNB -> MC ${fmtM(snap2.mcUsd)}`);
		}
		let safety = 0;
		while ((await treasury.tiers(i)).epochsAbove < tier.minEpochs) {
			await increase(3600);
			await refreshFeed(feed);
			await (await treasury.checkAndAdvance()).wait();
			safety += 1;
			if (safety > 12) throw new Error(`tier ${i} failed to advance after 12 epochs; MC may be too low after liquidation kick`);
		}
		const afterTier = await treasury.tiers(i);
		expect(afterTier.deployed).to.equal(true);
		expect(afterTier.tickLower).to.equal(TIER_LOWER_TICKS[i]);
		expect(afterTier.tickUpper).to.equal(MAX_TICK_INFINITY);
		expect(afterTier.positionId).to.be.greaterThan(0n);
		const pos = await npm.positions(afterTier.positionId);
		expect(pos.tickLower).to.equal(TIER_LOWER_TICKS[i]);
		expect(pos.tickUpper).to.equal(MAX_TICK_INFINITY);
		expect(pos.liquidity).to.be.greaterThan(0n);
		if (i > 0) expect(afterTier.tickLower).to.be.greaterThan((await treasury.tiers(i - 1)).tickLower);
		deployedIds.push(afterTier.positionId);
		log(`tier ${i} deployed NFT ${afterTier.positionId}, range [${afterTier.tickLower}, ${afterTier.tickUpper}]`);
	}
	ok(5, "all threshold tiers deployed with upper tick 887200 and ascending lowers");

	log("");
	log("Step 6: Verify four V3 NFTs and inventory below 100M after initial V3 pressure");
	const v3PoolAddr = await treasury.v3Pool();
	const v3Pool = new ethers.Contract(v3PoolAddr, ["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint32 feeProtocol,bool unlocked)"], ethers.provider);
	const v3Router = new ethers.Contract(BSC.PCS_V3_SWAP_ROUTER, ["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"], ethers.provider);
	await (await wbnb.connect(t1).deposit({ value: ethers.parseEther("120") })).wait();
	await (await wbnb.connect(t1).approve(BSC.PCS_V3_SWAP_ROUTER, ethers.MaxUint256)).wait();
	const balancesByStage = [];
	async function inventoryRow(label) {
		const slot0 = await v3Pool.slot0();
		const vals = [];
		let total = 0n;
		for (const id of deployedIds) {
			const pos = await npm.positions(id);
			const bal = tokenAmountInPosition(pos, Number(slot0.tick), tokenIsToken0);
			vals.push(bal);
			total += bal;
		}
		balancesByStage.push(vals);
		tokenRows.push([label, Number(slot0.tick), ...vals.map((v) => Number(ethers.formatUnits(v, 18)).toFixed(3))]);
		return { vals, total, tick: Number(slot0.tick) };
	}
	let beforeV3 = await inventoryRow("post deploy");
	await (await v3Router.connect(t1).exactInputSingle([BSC.WBNB, mined.predicted, 10000, t1.address, await latestDeadline(), ethers.parseEther("35"), 0, 0])).wait();
	let afterV3 = await inventoryRow("after 35 BNB V3 buy");
	expect(deployedIds.length).to.equal(4);
	for (let i = 1; i < 4; i += 1) expect((await treasury.tiers(i)).tickLower).to.be.greaterThan((await treasury.tiers(i - 1)).tickLower);
	expect(afterV3.total).to.be.lessThan(ethers.parseEther("100000000"));
	ok(6, `four NFTs live, total current token inventory ${tok(afterV3.total)}`);

	log("");
	log("Step 7: Pump V3 further and verify tier inventory decreases but is not zero");
	await (await v3Router.connect(t1).exactInputSingle([BSC.WBNB, mined.predicted, 10000, t1.address, await latestDeadline(), ethers.parseEther("70"), 0, 0])).wait();
	const afterMore = await inventoryRow("after 105 BNB V3 buy");
	for (let i = 0; i < 4; i += 1) {
		expect(afterMore.vals[i]).to.be.lte(afterV3.vals[i]);
		expect(afterMore.vals[i]).to.be.greaterThan(0n);
	}
	const tier0SoldTo10m = ethers.parseEther("25000000") - afterV3.vals[0];
	mathValidation = { actual: tier0SoldTo10m, expected: ethers.parseEther("7320000") };
	expectClose(tier0SoldTo10m, mathValidation.expected, 1500, "tier 0 sold near 7.32M by first V3 pressure checkpoint");
	ok(7, `V3 inventory decreased monotonically, tier0 sold ${tok(tier0SoldTo10m)} versus expected 7.32M`);

	log("");
	log("Step 8: AgentSafe calls treasury.claim and verify 4-way split");
	await (await v3Router.connect(t1).exactInputSingle([BSC.WBNB, mined.predicted, 10000, t1.address, await latestDeadline(), ethers.parseEther("10"), 0, 0])).wait();
	const [claimableBnb] = await treasury.claimable();
	log(`claimable before claim ${bnb(claimableBnb)}`);
	const deadTokenBefore = await token.balanceOf("0x000000000000000000000000000000000000dEaD");
	const platformBefore = await ethers.provider.getBalance(platformSafeAddress);
	const patronBefore = await ethers.provider.getBalance(creator.address);
	const agentBefore = await ethers.provider.getBalance(launches.agentSafe);
	await network.provider.request({ method: "hardhat_impersonateAccount", params: [launches.agentSafe] });
	await network.provider.send("hardhat_setBalance", [launches.agentSafe, "0x56BC75E2D63100000"]);
	const safeSigner = await ethers.getSigner(launches.agentSafe);
	await (await treasury.connect(safeSigner).claim()).wait();
	await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [launches.agentSafe] });
	const deadTokenAfter = await token.balanceOf("0x000000000000000000000000000000000000dEaD");
	const platformGot = (await ethers.provider.getBalance(platformSafeAddress)) - platformBefore;
	const patronGot = (await ethers.provider.getBalance(creator.address)) - patronBefore;
	const agentGotGross = (await ethers.provider.getBalance(launches.agentSafe)) - agentBefore;
	const distributed = platformGot + patronGot + agentGotGross;
	expect(deadTokenAfter).to.be.greaterThan(deadTokenBefore);
	expect(pct(platformGot, distributed)).to.be.closeTo(5, 0.5);
	expect(pct(patronGot, distributed)).to.be.closeTo(20, 0.5);
	expect(pct(agentGotGross, distributed)).to.be.closeTo(65, 0.5);
	ok(8, `claim split platform ${pct(platformGot, distributed)}%, patron ${pct(patronGot, distributed)}%, agent ${pct(agentGotGross, distributed)}%, buyback burned tokens`);

	log("");
	log("## Final summary table");
	log("stage | v3 tick | tier0 INF | tier1 INF | tier2 INF | tier3 INF");
	for (const r of tokenRows) log(`${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${r[4]} | ${r[5]}`);
	log("");
	log("## Scenario pass/fail");
	for (const [step, status, text] of passFail) log(`Step ${step}: ${status} - ${text}`);
	log("");
	log("## V3 math validation");
	log(`Actual tier0 sold: ${tok(mathValidation.actual)}`);
	log(`Expected tier0 sold: ${tok(mathValidation.expected)}`);
	log("Tolerance: 15%");
	log("");
	log("## Surprises");
	log("A mock live BNB/USD feed is used at $600 so 4 hour epoch fast-forwards do not trip Chainlink staleness on the fork. PCS V2, PCS V3 NPM, PCS V3 factory, SwapRouter, WBNB, Safe, and FLAP contracts are real forked mainnet contracts.");
	fs.mkdirSync(require("node:path").dirname(REPORT), { recursive: true });
	fs.writeFileSync(REPORT, `${lines.join("\n")}\n`);
}

main().catch((e) => {
	console.error(e);
	fail("fatal", e.shortMessage || e.message);
	fs.mkdirSync(require("node:path").dirname(REPORT), { recursive: true });
	fs.writeFileSync(REPORT, `${lines.join("\n")}\n\n## FAILURE\n\n${e.stack || e.message}\n`);
	process.exit(1);
});
