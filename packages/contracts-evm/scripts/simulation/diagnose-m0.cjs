// Wave O.0.2 — Diagnose M0
//
// Re-creates the infinity-tier-pressure launch flow up to the moment tier 0
// would be deployed, then queries the FLAP TaxedTokenV3 for tax state and
// performs a controlled transfer probe from TreasuryLP4 to the V3 pool.

const { ethers, network } = require("hardhat");
const { expect } = require("chai");

const BSC = {
	PCS_FACTORY: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
	PCS_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
	PCS_V3_FACTORY: "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865",
	PCS_V3_NPM: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
	WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
	FLAP_PORTAL: "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0",
	TOKEN_IMPL_TAXED_V3: "0x024f18294970B5c76c0691b87f138A0317156422",
	TIP_RECEIVER: "0x4848489f0b2BEdd788c696e2D79b6b69D7484848",
	SAFE_SINGLETON: "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762",
	SAFE_PROXY_FACTORY: "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67",
};

const MAX_TICK_INFINITY = 887200;
const TIER_LOWER_TICKS = [2000, 9000, 18200, 32000];

function log(s = "") {
	console.log(s);
}
function initCodeHash(impl) {
	return ethers.keccak256(
		`0x3d602d80600a3d3981f3363d3d373d3d3d363d73${impl.slice(2).toLowerCase()}5af43d82803e903d91602b57fd5bf3`,
	);
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
async function latestDeadline() {
	return (await ethers.provider.getBlock("latest")).timestamp + 3600;
}
async function increase(seconds) {
	await network.provider.send("evm_increaseTime", [seconds]);
	await network.provider.send("evm_mine");
}
async function refreshFeed(feed) {
	await (await feed.setUpdatedAt((await ethers.provider.getBlock("latest")).timestamp)).wait();
}

async function main() {
	const signers = await ethers.getSigners();
	const [deployer, psOwner, creator, dA, dB, dC, dD, dE, dF, dG, dH, bundleBot, t1, t2, t3, t4, t5] = signers;

	log("=== Diagnose M0 ===");
	log(`Fork block: ${await ethers.provider.getBlockNumber()}`);

	// ---- Setup (mirrors infinity-tier-pressure.cjs) ----
	const MockFeed = await ethers.getContractFactory("MockBnbUsdFeed", deployer);
	const feed = await MockFeed.deploy(600n * 100000000n);
	await feed.waitForDeployment();
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
	const safeReceipt = await (
		await safeProxyFactory.createProxyWithNonce(BSC.SAFE_SINGLETON, setupData, Date.now())
	).wait();
	const platformSafeAddress = safeProxyFactory.interface.parseLog(
		safeReceipt.logs.find((l) => {
			try {
				return safeProxyFactory.interface.parseLog(l)?.name === "ProxyCreation";
			} catch {
				return false;
			}
		}),
	).args.proxy;

	const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer", deployer);
	const routerDeployer = await RouterDeployerCF.deploy();
	await routerDeployer.waitForDeployment();
	const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeDeployer", deployer);
	const agentSafeDeployer = await AgentSafeDeployerCF.deploy(BSC.SAFE_SINGLETON, BSC.SAFE_PROXY_FACTORY);
	await agentSafeDeployer.waitForDeployment();
	const TreasuryLP4DeployerCF = await ethers.getContractFactory("TreasuryLP4Deployer", deployer);
	const treasuryLp4Deployer = await TreasuryLP4DeployerCF.deploy();
	await treasuryLp4Deployer.waitForDeployment();
	const LaunchFactoryCF = await ethers.getContractFactory("LaunchFactory", deployer);
	const factory = await LaunchFactoryCF.deploy(
		BSC.WBNB,
		BSC.PCS_FACTORY,
		BSC.PCS_ROUTER,
		initCodeHash(BSC.TOKEN_IMPL_TAXED_V3),
		BSC.FLAP_PORTAL,
		BSC.TOKEN_IMPL_TAXED_V3,
		BSC.TIP_RECEIVER,
		platformSafeAddress,
		await routerDeployer.getAddress(),
		await agentSafeDeployer.getAddress(),
		await treasuryLp4Deployer.getAddress(),
		BSC.PCS_V3_NPM,
		BSC.PCS_V3_FACTORY,
		await feed.getAddress(),
	);
	await factory.waitForDeployment();

	const buyTaxBps = 300;
	const sellTaxBps = 300;
	const [presaleCap] = await factory.tierBudget(2, buyTaxBps);
	const mined = mineToken0Salt(
		BSC.FLAP_PORTAL,
		initCodeHash(BSC.TOKEN_IMPL_TAXED_V3),
		creator.address,
		"infinity-tier-pressure",
	);
	const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
	const config = {
		name: "Infinity Pressure",
		symbol: "INF",
		metaCid: "QmInfinityPressure",
		creator: creator.address,
		bundleBot: bundleBot.address,
		tier: 2,
		buyTaxBps,
		sellTaxBps,
		taxDuration: 31_536_000,
		antiFarmerDuration: 3600,
		closeTimestamp,
		vanitySalt: mined.rawSalt,
		predictedTokenAddress: mined.predicted,
		noBurn: false,
		platformReceiver: platformSafeAddress,
		patron: creator.address,
		agentSafeOwners: [creator.address],
		agentSafeThreshold: 1,
		agentEoa: ethers.ZeroAddress,
		roleConfigCalls: [],
		platformBps: 1000,
		patronBps: 2500,
		treasuryTickLowers: TIER_LOWER_TICKS,
		treasuryTickUppers: [MAX_TICK_INFINITY, MAX_TICK_INFINITY, MAX_TICK_INFINITY, MAX_TICK_INFINITY],
	};
	await (await factory.connect(creator).createLaunch(config)).wait();
	const launches = await factory.launches(mined.predicted);

	const vault = new ethers.Contract(
		launches.vault,
		["function deposit() payable", "function close()", "function totalDeposited() view returns (uint256)"],
		ethers.provider,
	);
	const deposits = [
		[dA, "20"],
		[dB, "12"],
		[dC, "8.5"],
		[dD, "7.5"],
		[dE, "6"],
		[dF, "4.5"],
		[dG, "3.5"],
		[dH, "2"],
	];
	for (const [who, amt] of deposits) await (await vault.connect(who).deposit({ value: ethers.parseEther(amt) })).wait();
	await increase(901);
	await (await vault.connect(bundleBot).close()).wait();
	const router = new ethers.Contract(
		launches.router,
		[
			"function executeBundle((bytes32,string,string,string,uint16,uint16,uint64,uint64,address,uint256,uint256)) returns (address)",
		],
		ethers.provider,
	);
	await (
		await router
			.connect(bundleBot)
			.executeBundle([
				mined.rawSalt,
				config.name,
				config.symbol,
				config.metaCid,
				buyTaxBps,
				sellTaxBps,
				config.taxDuration,
				config.antiFarmerDuration,
				launches.taxSplitter,
				0n,
				closeTimestamp + 3600,
			])
	).wait();
	await refreshFeed(feed);
	await (await factory.finalizeLaunch(mined.predicted)).wait();
	const finalLaunches = await factory.launches(mined.predicted);

	const token = new ethers.Contract(
		mined.predicted,
		[
			"function totalSupply() view returns (uint256)",
			"function balanceOf(address) view returns (uint256)",
			"function approve(address,uint256) returns (bool)",
			"function transfer(address,uint256) returns (bool)",
			"function state() view returns (uint8)",
			"function mainPool() view returns (address)",
			"function pools(address) view returns (bool)",
			"function buyTaxRate() view returns (uint16)",
			"function sellTaxRate() view returns (uint16)",
			"function taxExpirationTime() view returns (uint256)",
			"function antiFarmerExpirationTime() view returns (uint256)",
		],
		deployer,
	);

	const wbnb = new ethers.Contract(
		BSC.WBNB,
		["function balanceOf(address) view returns (uint256)", "function deposit() payable"],
		ethers.provider,
	);
	const pcsFactory = new ethers.Contract(
		BSC.PCS_FACTORY,
		["function getPair(address,address) view returns (address)"],
		ethers.provider,
	);
	const pair = await pcsFactory.getPair(mined.predicted, BSC.WBNB);

	log("");
	log("=== Step A: pump V2 price (same as fork test step 4) ===");
	await increase(config.antiFarmerDuration + 60);
	const pcsRouter = new ethers.Contract(
		BSC.PCS_ROUTER,
		["function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable"],
		ethers.provider,
	);
	for (const [trader, amt] of [
		[t1, 5],
		[t2, 10],
		[t3, 20],
		[t4, 40],
		[t5, 100],
	]) {
		await (
			await pcsRouter
				.connect(trader)
				.swapExactETHForTokensSupportingFeeOnTransferTokens(
					0,
					[BSC.WBNB, mined.predicted],
					trader.address,
					await latestDeadline(),
					{ value: ethers.parseEther(String(amt)) },
				)
		).wait();
	}

	const treasury = new ethers.Contract(
		finalLaunches.treasuryLp,
		[
			"function checkAndAdvance()",
			"function nextTierIndex() view returns (uint8)",
			"function tiers(uint256) view returns (uint256 targetMcUSD,uint256 tokenAmount,int24 tickLower,int24 tickUpper,uint8 minEpochs,uint8 epochsAbove,uint32 lastEpochTimestamp,bool deployed,bool paused,uint256 positionId)",
			"function tokenIsToken0() view returns (bool)",
			"function v3Pool() view returns (address)",
		],
		deployer,
	);

	// Advance epochs until tier 0 is "ready" (epochsAbove >= minEpochs).
	log("");
	log("=== Step B: advance epochs to make tier 0 deployable ===");
	await network.provider.request({ method: "hardhat_impersonateAccount", params: [launches.agentSafe] });
	await network.provider.send("hardhat_setBalance", [launches.agentSafe, "0x56BC75E2D63100000"]);
	const treasuryAsAgent = new ethers.Contract(
		finalLaunches.treasuryLp,
		["function setEpochLength(uint256)"],
		await ethers.getSigner(launches.agentSafe),
	);
	await (await treasuryAsAgent.setEpochLength(3600)).wait();
	await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [launches.agentSafe] });

	const tier0Before = await treasury.tiers(0);
	log(`tier0.minEpochs=${tier0Before.minEpochs} epochsAbove=${tier0Before.epochsAbove}`);

	// Advance epochs one at a time. Each checkAndAdvance() increments epochsAbove
	// when MC is above target. Once it reaches minEpochs, the NEXT call would
	// auto-fire deployTier(0) and revert with M0. We stop one short and query
	// state at the brink, then trigger the deploy manually via staticCall to
	// see the actual error without losing diagnostic context.
	let attempts = 0;
	while (attempts < 20) {
		const t = await treasury.tiers(0);
		if (t.deployed) break;
		if (t.epochsAbove >= t.minEpochs) {
			log(`epochsAbove=${t.epochsAbove} >= minEpochs=${t.minEpochs}; STOPPING before deploy.`);
			break;
		}
		await increase(3600);
		await refreshFeed(feed);
		try {
			await (await treasury.checkAndAdvance()).wait();
		} catch (e) {
			log(`checkAndAdvance reverted at attempt ${attempts}: ${e.message?.slice(0, 200)}`);
			break;
		}
		attempts += 1;
	}
	const tier0After = await treasury.tiers(0);
	log(
		`after ${attempts} attempts: epochsAbove=${tier0After.epochsAbove}/${tier0After.minEpochs}, deployed=${tier0After.deployed}`,
	);
	if (tier0After.deployed) {
		log("tier0 already deployed; probe pointless.");
		return;
	}

	// ---- Now: probe the FLAP token state BEFORE the deploy ----
	log("");
	log("=== Step C: query FLAP token state ===");
	const now = (await ethers.provider.getBlock("latest")).timestamp;
	const stateNum = await token.state();
	const mainPool = await token.mainPool();
	const taxExp = await token.taxExpirationTime();
	const afExp = await token.antiFarmerExpirationTime();
	const buyTax = await token.buyTaxRate();
	const sellTax = await token.sellTaxRate();

	const stateNames = ["BondingCurve", "Migrating", "TaxEnforcedAntiFarmer", "TaxEnforced", "TaxFree"];
	log(`block.timestamp        = ${now}`);
	log(`poolState.state        = ${stateNum} (${stateNames[Number(stateNum)] ?? "UNKNOWN"})`);
	log(`mainPool               = ${mainPool}`);
	log(`taxExpirationTime      = ${taxExp}  (${taxExp - BigInt(now)} sec remaining)`);
	log(
		`antiFarmerExpirationT  = ${afExp}  (${afExp - BigInt(now)} sec remaining, ${afExp > BigInt(now) ? "ACTIVE" : "EXPIRED"})`,
	);
	log(`buyTaxRate             = ${buyTax} bps`);
	log(`sellTaxRate            = ${sellTax} bps`);

	// pools mapping check
	log("");
	log("=== Step D: pools(addr) mapping membership ===");
	const v2PairInPools = await token.pools(pair);
	log(`pools[v2_pair=${pair}] = ${v2PairInPools}`);

	// V3 pool may not exist yet (deployTier(0) creates it). Predict address.
	// PCS V3 init code hash for 1% fee pool — but here we can also create it now.
	// Just call createAndInitializePoolIfNecessary directly to find out, but
	// only if it would not interfere with the tier deploy. Instead, predict
	// using getPool view on the V3 factory.
	const v3FactoryC = new ethers.Contract(
		BSC.PCS_V3_FACTORY,
		["function getPool(address,address,uint24) view returns (address)"],
		ethers.provider,
	);
	const v3PoolPre = await v3FactoryC.getPool(mined.predicted, BSC.WBNB, 10000);
	log(`V3 factory.getPool(token, WBNB, 10000) BEFORE deploy = ${v3PoolPre}`);

	// PCS V3 init code hash: pre-compute deterministic V3 pool address.
	const POOL_INIT_CODE_HASH = "0x6ce8eb472fa82df5469c6ab6d485f17c3ad13c907cb7b6e96a8616f3e5c2c5b1";
	function predictV3Pool(token0, token1, fee) {
		// biome-ignore lint/style/noParameterAssign: deliberate canonical sort swap
		if (BigInt(token0) > BigInt(token1)) [token0, token1] = [token1, token0];
		const hashedSalt = ethers.keccak256(
			ethers.AbiCoder.defaultAbiCoder().encode(["address", "address", "uint24"], [token0, token1, fee]),
		);
		const encoded = ethers.solidityPacked(
			["bytes1", "address", "bytes32", "bytes32"],
			["0xff", BSC.PCS_V3_FACTORY, hashedSalt, POOL_INIT_CODE_HASH],
		);
		return ethers.getAddress(`0x${ethers.keccak256(encoded).slice(-40)}`);
	}
	const v3Predicted = predictV3Pool(mined.predicted, BSC.WBNB, 10000);
	log(`predicted V3 pool address (1% fee, CREATE2)   = ${v3Predicted}`);
	const v3PredictedInPools = await token.pools(v3Predicted);
	log(`pools[predicted_v3_pool] BEFORE any V3 call   = ${v3PredictedInPools}`);
	if (v3PoolPre !== ethers.ZeroAddress) {
		const v3InPools = await token.pools(v3PoolPre);
		log(`pools[v3_pool=${v3PoolPre}] = ${v3InPools}`);
	}

	// Try every PCS V3 fee tier for the (token, WBNB) pair
	for (const fee of [100, 500, 2500, 10000]) {
		const predicted = predictV3Pool(mined.predicted, BSC.WBNB, fee);
		const inPools = await token.pools(predicted);
		const onChain = await v3FactoryC.getPool(mined.predicted, BSC.WBNB, fee);
		log(`fee=${fee} predicted=${predicted} pools[]=${inPools} onChain=${onChain}`);
	}

	// Direct probe: check pools[0x0B6371Af2081374c277b1d64022E7dc306560bE1] which was the actually
	// created pool last run. If it's true HERE (before any V3 create), it means the launcher pre-registered it.
	const KNOWN_CREATED_V3 = "0x0B6371Af2081374c277b1d64022E7dc306560bE1";
	try {
		const probeKnown = await token.pools(KNOWN_CREATED_V3);
		log(`pools[${KNOWN_CREATED_V3}] BEFORE V3 create  = ${probeKnown}`);
	} catch (e) {
		log(`probe error: ${e.message}`);
	}

	// Other addresses for context
	const npmInPools = await token.pools(BSC.PCS_V3_NPM);
	const portalInPools = await token.pools(BSC.FLAP_PORTAL);
	const treasuryInPools = await token.pools(finalLaunches.treasuryLp);
	log(`pools[NPM]             = ${npmInPools}`);
	log(`pools[FLAP_PORTAL]     = ${portalInPools}`);
	log(`pools[TreasuryLP4]     = ${treasuryInPools}`);

	// ---- Controlled transfer probes ----
	log("");
	log("=== Step E: controlled transfer probes ===");

	const treasurySigner = await (async () => {
		await network.provider.request({ method: "hardhat_impersonateAccount", params: [finalLaunches.treasuryLp] });
		await network.provider.send("hardhat_setBalance", [finalLaunches.treasuryLp, "0x56BC75E2D63100000"]);
		return ethers.getSigner(finalLaunches.treasuryLp);
	})();
	const tokenAsTreasury = token.connect(treasurySigner);

	// Probe 1: transfer to V2 pair (we expect this to be taxed in TaxEnforced state).
	const before1 = await token.balanceOf(pair);
	await (await tokenAsTreasury.transfer(pair, ethers.parseUnits("1000", 18))).wait();
	const after1 = await token.balanceOf(pair);
	const received1 = after1 - before1;
	log(
		`Treasury -> V2 pair: sent 1000, received ${ethers.formatUnits(received1, 18)} (taxed=${received1 < ethers.parseUnits("1000", 18)})`,
	);

	// Probe 2: V3 pool. Create if needed.
	let v3PoolAddr = v3PoolPre;
	if (v3PoolAddr === ethers.ZeroAddress) {
		log("Creating V3 pool via NPM.createAndInitializePoolIfNecessary for probe");
		const npmIface = new ethers.Contract(
			BSC.PCS_V3_NPM,
			[
				"function createAndInitializePoolIfNecessary(address token0,address token1,uint24 fee,uint160 sqrtPriceX96) payable returns (address)",
			],
			deployer,
		);
		// Use a reasonable sqrtPrice
		const sqrtP = "79228162514264337593543950336"; // 1.0 in Q96
		await (await npmIface.createAndInitializePoolIfNecessary(mined.predicted, BSC.WBNB, 10000, sqrtP)).wait();
		v3PoolAddr = await v3FactoryC.getPool(mined.predicted, BSC.WBNB, 10000);
		log(`Created V3 pool at ${v3PoolAddr}`);
	}
	const v3InPoolsNow = await token.pools(v3PoolAddr);
	log(`pools[v3_pool=${v3PoolAddr}] AFTER create = ${v3InPoolsNow}`);

	const before2 = await token.balanceOf(v3PoolAddr);
	await (await tokenAsTreasury.transfer(v3PoolAddr, ethers.parseUnits("1000", 18))).wait();
	const after2 = await token.balanceOf(v3PoolAddr);
	const received2 = after2 - before2;
	log(
		`Treasury -> V3 pool: sent 1000, received ${ethers.formatUnits(received2, 18)} (taxed=${received2 < ethers.parseUnits("1000", 18)})`,
	);

	// Probe 3: transfer to NPM
	const before3 = await token.balanceOf(BSC.PCS_V3_NPM);
	await (await tokenAsTreasury.transfer(BSC.PCS_V3_NPM, ethers.parseUnits("1000", 18))).wait();
	const after3 = await token.balanceOf(BSC.PCS_V3_NPM);
	const received3 = after3 - before3;
	log(
		`Treasury -> NPM:      sent 1000, received ${ethers.formatUnits(received3, 18)} (taxed=${received3 < ethers.parseUnits("1000", 18)})`,
	);

	// Probe 4: transfer to a random EOA
	const before4 = await token.balanceOf(t1.address);
	await (await tokenAsTreasury.transfer(t1.address, ethers.parseUnits("1000", 18))).wait();
	const after4 = await token.balanceOf(t1.address);
	const received4 = after4 - before4;
	log(
		`Treasury -> EOA:      sent 1000, received ${ethers.formatUnits(received4, 18)} (taxed=${received4 < ethers.parseUnits("1000", 18)})`,
	);

	log("");
	log("=== Step F: state interpretation ===");
	const expectedTaxed = received2 < ethers.parseUnits("1000", 18);
	if (expectedTaxed) {
		if (Number(stateNum) === 2) {
			log("DIAGNOSIS: state = TaxEnforcedAntiFarmer. ALL pools (including V3) are taxed.");
			log("FIX: wait until block.timestamp > antiFarmerExpirationTime BEFORE deploying tier 0.");
		} else if (Number(stateNum) === 3) {
			log("DIAGNOSIS: state = TaxEnforced (post anti-farmer), but V3 pool is in pools[] mapping permanently.");
			log("FIX: prevent V3 pool from being added to pools[] OR find a way to exempt treasury.");
		} else {
			log(`DIAGNOSIS: state = ${stateNames[Number(stateNum)]}, unexpected taxed transfer.`);
		}
	} else {
		log("DIAGNOSIS: V3 pool transfer was NOT taxed. M0 must have a different root cause.");
	}

	await network.provider.request({ method: "hardhat_stopImpersonatingAccount", params: [finalLaunches.treasuryLp] });
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
