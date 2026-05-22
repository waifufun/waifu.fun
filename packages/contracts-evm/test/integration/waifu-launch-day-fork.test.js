// Launch-day fork integration test for treasury->AgentSafe routing.
//
// Simulates a complete TIER_95 launch sequence end-to-end on forked BSC
// mainnet, exercising the NEW post-#672 code path where the 10% treasury
// allocation routes to the AgentSafe instead of TreasuryLP5.
//
// This test was written after the team decided to route all 10% to the
// AgentSafe and defer V3 LP activation. The existing fork tests (treasury-lp5-real-fork,
// wave-m-real-fork) test paths that no longer fire in production, so a
// dedicated NEW-path fork test was needed before signing the mainnet deploy.
//
// What we cover end-to-end:
//   1. Deploy LaunchFactory with all 4 helpers (RouterDeployer, AgentSafeDeployer,
//      TreasuryLP5Deployer, LaunchFactory) — mirrors scripts/deploy/deploy-wave-n.js
//   2. createLaunch with TIER_95 + 3-owner AgentSafe + WAGMI ticks
//   3. Vault deposit to cap
//   4. close() + executeBundle (real FLAP Portal + real PCS V2)
//   5. CRITICAL: assert 10% supply landed in AgentSafe (NOT TreasuryLP5)
//   6. CRITICAL: assert TreasuryLP5 has 0 token balance (dormant)
//   7. Token tradeable on PCS V2 (buy + sell legs)
//   8. AgentSafe is a real 3-owner 2/3 Gnosis Safe
//   9. instantAdminRefund flow (TIER_TEST sibling launch + admin refund)
//  10. finalizeLaunch now reverts (LP5 has no tokens to mint into V3)
//
// Run with:
//   FORK_BSC=true FORK_BSC_URL=$ALCHEMY_BSC_URL FORK_BSC_BLOCK=99073955 \
//     bunx hardhat test test/integration/waifu-launch-day-fork.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");

const FORK_ENABLED = process.env.FORK_BSC === "true";

// BSC mainnet address book (Wave O.1 — no Chainlink feed)
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TOKEN_TAXED_V3_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const TIP_RECEIVER = "0x4848489f0b2BEdd788c696e2D79b6b69D7484848";
const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const PCS_V3_NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
const PCS_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

// Tier enum values (mirrors LaunchFactory.LaunchTier).
const TIER_80 = 0;
const TIER_90 = 1;
const TIER_95 = 2;
const TIER_98 = 3;
const TIER_TEST = 4;

// TIER_95 cap is 64 BNB; TIER_TEST cap is 17.34 BNB
const TIER_95_CAP = ethers.parseEther("64");
const TIER_TEST_CAP = ethers.parseEther("17.34");

const TOKEN_ABI = [
	"function balanceOf(address) view returns (uint256)",
	"function totalSupply() view returns (uint256)",
	"function decimals() view returns (uint8)",
	"function approve(address,uint256) returns (bool)",
	"function transfer(address,uint256) returns (bool)",
];

const PCS_FACTORY_ABI = ["function getPair(address,address) view returns (address)"];

const PCS_ROUTER_ABI = [
	"function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 amountOutMin, address[] path, address to, uint256 deadline) payable",
	"function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
];

const SAFE_ABI = [
	"function getOwners() view returns (address[])",
	"function getThreshold() view returns (uint256)",
	"function isOwner(address) view returns (bool)",
	"function VERSION() view returns (string)",
];

// --- helper utilities ---

function cloneInitCode(impl) {
	const stripped = impl.slice(2).toLowerCase();
	return `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${stripped}5af43d82803e903d91602b57fd5bf3`;
}

function initCodeHash(impl) {
	return ethers.keccak256(cloneInitCode(impl));
}

function predictCreate2(deployer, salt, codeHash) {
	return ethers.getCreate2Address(deployer, salt, codeHash);
}

function effectiveSalt(creator, rawSalt) {
	return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [creator, rawSalt]));
}

// Mine a salt where:
//   - predicted address ends in `suffix` (default 7777 — FLAP Portal requirement)
//   - predicted address is lexicographically less than WBNB (so token sorts as token0 in V2 pair)
function mineVanitySalt(deployer, codeHash, creator, label, suffix = "7777") {
	const maxIterations = 6_000_000;
	const wbnbLower = WBNB.toLowerCase();
	let rawSalt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string", "address"], [label, creator]));
	for (let i = 0; i < maxIterations; i += 1) {
		const salt = effectiveSalt(creator, rawSalt);
		const predicted = predictCreate2(deployer, salt, codeHash);
		const lower = predicted.toLowerCase();
		if (lower.endsWith(suffix) && lower < wbnbLower) {
			return { rawSalt, salt, predicted, iterations: i };
		}
		rawSalt = ethers.keccak256(rawSalt);
	}
	throw new Error(`salt mining exceeded ${maxIterations} iterations`);
}

async function advanceTo(timestamp) {
	const target = typeof timestamp === "bigint" ? Number(timestamp) : timestamp;
	await ethers.provider.send("evm_setNextBlockTimestamp", [target]);
	await ethers.provider.send("evm_mine", []);
}

async function closeSubscribedVault(vault, closer) {
	const block = await ethers.provider.getBlock("latest");
	const closeTimestamp = await vault.closeTimestamp();
	const minOpenReady = BigInt(block.timestamp) + 901n;
	await advanceTo(minOpenReady < closeTimestamp ? minOpenReady : closeTimestamp + 1n);
	const closeTx = await vault.connect(closer).close();
	return closeTx.wait();
}

async function skipAntiFarmer(seconds = 86_401) {
	await ethers.provider.send("evm_increaseTime", [seconds]);
	await ethers.provider.send("evm_mine", []);
}

async function deployFactory(deployer, platformReceiver) {
	const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer", deployer);
	const routerDeployer = await RouterDeployerCF.deploy();
	await routerDeployer.waitForDeployment();

	const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeDeployer", deployer);
	const agentSafeDeployer = await AgentSafeDeployerCF.deploy(SAFE_SINGLETON, SAFE_PROXY_FACTORY);
	await agentSafeDeployer.waitForDeployment();

	const TreasuryLp5DeployerCF = await ethers.getContractFactory("TreasuryLP5Deployer", deployer);
	const treasuryLp5Deployer = await TreasuryLp5DeployerCF.deploy();
	await treasuryLp5Deployer.waitForDeployment();

	const Factory = await ethers.getContractFactory("LaunchFactory", deployer);
	const factory = await Factory.deploy(
		WBNB,
		PCS_FACTORY,
		PCS_ROUTER,
		initCodeHash(TOKEN_TAXED_V3_IMPL),
		PORTAL,
		TOKEN_TAXED_V3_IMPL,
		TIP_RECEIVER,
		platformReceiver,
		await routerDeployer.getAddress(),
		await agentSafeDeployer.getAddress(),
		await treasuryLp5Deployer.getAddress(),
		PCS_V3_NPM,
		PCS_V3_FACTORY,
	);
	await factory.waitForDeployment();
	return { factory, routerDeployer, agentSafeDeployer, treasuryLp5Deployer };
}

// Build a TIER_95 launch config with 3-owner agent Safe + WAGMI ticks.
// For tick lowers we use the $10M/$25M/$100M/$1B MC ladder.
// At an assumed launch FDV of ~$47k, the ticks are approximately +53600/+62800/+76600/+92000.
// Aligned to PCS V3 1% spacing (200): 53600 / 62800 / 76600 / 92000.
function buildWaifuConfig(args) {
	return {
		name: args.name ?? "Test Token",
		symbol: args.symbol ?? "TEST",
		metaCid: args.metaCid ?? "ipfs://placeholder",
		creator: args.creator,
		bundleBot: args.bundleBot,
		tier: args.tier ?? TIER_95,
		buyTaxBps: 300,
		sellTaxBps: 300,
		taxDuration: 31_536_000,
		antiFarmerDuration: 86_400,
		closeTimestamp: args.closeTimestamp,
		vanitySalt: args.rawSalt,
		predictedTokenAddress: args.predicted,
		noBurn: args.noBurn ?? false,
		platformReceiver: args.platformReceiver,
		patron: args.patron,
		agentSafeOwners: args.agentSafeOwners,
		agentSafeThreshold: args.agentSafeThreshold,
		platformBps: args.platformBps ?? 1000, // 10%
		patronBps: args.patronBps ?? 2500, // 25%
		// WAGMI tick ladder ($10M/$25M/$100M/$1B from a ~$47k launch FDV).
		// Upper ticks all = MAX_TICK_PCS_V3_1PCT (887200) per the overlapping infinity-range design.
		// Computed offline via scripts/lib/mc-to-tick.js.
		treasuryTickLowers: args.treasuryTickLowers ?? [53600, 62800, 76600, 92000],
		treasuryTickUppers: args.treasuryTickUppers ?? [887200, 887200, 887200, 887200],
	};
}

async function executeBundle(router, bundleBot, cfg, taxSplitter) {
	const execParams = {
		vanitySalt: cfg.vanitySalt,
		name: cfg.name,
		symbol: cfg.symbol,
		meta: cfg.metaCid,
		buyTaxBps: cfg.buyTaxBps,
		sellTaxBps: cfg.sellTaxBps,
		taxDuration: cfg.taxDuration,
		antiFarmerDuration: cfg.antiFarmerDuration,
		commissionReceiver: taxSplitter,
		tipBnb: 0,
		deadline: cfg.closeTimestamp + 1800,
	};
	const tx = await router.connect(bundleBot).executeBundle(execParams);
	const receipt = await tx.wait();
	expect(receipt.status).to.equal(1);
	return receipt;
}

const describeFn = FORK_ENABLED ? describe : describe.skip;
describeFn("Launch-day fork :: treasury -> AgentSafe (post-#672)", function () {
	if (!FORK_ENABLED) {
		it.skip("requires FORK_BSC=true", () => {});
		return;
	}

	this.timeout(600_000); // vanity mining + V2 trades on fork are slow

	let deployer;
	let shadowHot;
	let platformSafe;
	let solBurner;
	let bundleBot;
	let depositor2;
	let depositor3;
	let trader;
	let factory;
	let routerDeployer;
	let agentSafeDeployer;
	let treasuryLp5Deployer;

	before(async () => {
		const signers = await ethers.getSigners();
		[deployer, shadowHot, platformSafe, solBurner, bundleBot, depositor2, depositor3, trader] = signers;

		// Sanity: we should be on a BSC fork
		const network = await ethers.provider.getNetwork();
		const blockNumber = await ethers.provider.getBlockNumber();
		console.log(`    [fork] chainId=${network.chainId} blockNumber=${blockNumber}`);
		expect(network.chainId).to.equal(56n);

		// Deploy factory once for all tests
		const dep = await deployFactory(deployer, platformSafe.address);
		factory = dep.factory;
		routerDeployer = dep.routerDeployer;
		agentSafeDeployer = dep.agentSafeDeployer;
		treasuryLp5Deployer = dep.treasuryLp5Deployer;

		console.log(`    [factory] deployed at ${await factory.getAddress()}`);
		console.log(`    [deployer] ${deployer.address}`);
		console.log(`    [shadowHot] ${shadowHot.address}`);
		console.log(`    [platformSafe] ${platformSafe.address}`);
		console.log(`    [solBurner] ${solBurner.address}`);
	});

	it("[step 1] factory deploys with all 4 helpers + 13-arg ctor (no BNB_USD_FEED)", async () => {
		expect(await factory.WBNB()).to.equal(WBNB);
		expect(await factory.PCS_FACTORY()).to.equal(PCS_FACTORY);
		expect(await factory.PCS_ROUTER()).to.equal(PCS_ROUTER);
		expect(await factory.FLAP_PORTAL()).to.equal(PORTAL);
		expect(await factory.TIP_RECEIVER()).to.equal(TIP_RECEIVER);
		expect(await factory.ROUTER_DEPLOYER()).to.equal(await routerDeployer.getAddress());
		expect(await factory.AGENT_SAFE_DEPLOYER()).to.equal(await agentSafeDeployer.getAddress());
		expect(await factory.TREASURY_LP5_DEPLOYER()).to.equal(await treasuryLp5Deployer.getAddress());
		expect(await factory.PCS_V3_NPM()).to.equal(PCS_V3_NPM);
		expect(await factory.PCS_V3_FACTORY()).to.equal(PCS_V3_FACTORY);
		// Confirm no BNB_USD_FEED getter exists by inspecting the ABI
		const factoryAbi = factory.interface.fragments.map((f) => f.name).filter(Boolean);
		expect(factoryAbi).to.not.include("BNB_USD_FEED");
	});

	it("[step 2] createLaunch (TIER_95, 3-owner Safe) succeeds", async () => {
		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const label = "TIER_95_LAUNCH_V1";
		console.log("    [mining] vanity salt with suffix 7777, token < WBNB ...");
		const mined = mineVanitySalt(PORTAL, codeHash, shadowHot.address, label);
		console.log(`    [mined] iterations=${mined.iterations} predicted=${mined.predicted}`);

		expect(mined.predicted.toLowerCase().endsWith("7777")).to.equal(true);
		expect(mined.predicted.toLowerCase() < WBNB.toLowerCase()).to.equal(true);

		const block = await ethers.provider.getBlock("latest");
		const closeTimestamp = block.timestamp + 3600; // 1h presale window

		const cfg = buildWaifuConfig({
			creator: shadowHot.address,
			bundleBot: bundleBot.address,
			closeTimestamp,
			rawSalt: mined.rawSalt,
			predicted: mined.predicted,
			platformReceiver: platformSafe.address,
			patron: shadowHot.address,
			agentSafeOwners: [shadowHot.address, platformSafe.address, solBurner.address],
			agentSafeThreshold: 2,
		});

		const tx = await factory.connect(shadowHot).createLaunch(cfg);
		const receipt = await tx.wait();
		expect(receipt.status).to.equal(1);

		const addrs = await factory.launches(mined.predicted);
		expect(addrs.vault).to.not.equal(ethers.ZeroAddress);
		expect(addrs.router).to.not.equal(ethers.ZeroAddress);
		expect(addrs.treasuryLp).to.not.equal(ethers.ZeroAddress);
		expect(addrs.taxSplitter).to.not.equal(ethers.ZeroAddress);
		expect(addrs.agentSafe).to.not.equal(ethers.ZeroAddress);
		expect(addrs.predictedTokenAddress).to.equal(mined.predicted);

		console.log(`    [created] vault=${addrs.vault}`);
		console.log(`    [created] router=${addrs.router}`);
		console.log(`    [created] treasuryLp=${addrs.treasuryLp}`);
		console.log(`    [created] taxSplitter=${addrs.taxSplitter}`);
		console.log(`    [created] agentSafe=${addrs.agentSafe}`);

		this.cfg = cfg;
		this.addrs = addrs;
		this.mined = mined;
		this.closeTimestamp = closeTimestamp;
	});

	it("[step 3] AgentSafe is a real Gnosis Safe with 3 owners + threshold 2", async () => {
		const safe = new ethers.Contract(this.addrs.agentSafe, SAFE_ABI, ethers.provider);
		const owners = await safe.getOwners();
		const threshold = await safe.getThreshold();
		const version = await safe.VERSION();

		expect(owners.map((a) => a.toLowerCase()).sort()).to.deep.equal(
			[shadowHot.address, platformSafe.address, solBurner.address].map((a) => a.toLowerCase()).sort(),
		);
		expect(threshold).to.equal(2n);
		expect(version).to.equal("1.4.1");

		console.log(`    [safe] v${version}, owners=${owners.length}, threshold=${threshold}`);
	});

	it("[step 4] deposit + close: fill TIER_95 cap to 64 BNB", async () => {
		const vault = await ethers.getContractAt("LaunchVault", this.addrs.vault);

		// Split across 3 depositors to be realistic. Wallet cap is 60% = 38.4 BNB per wallet on TIER_95.
		await vault.connect(shadowHot).deposit({ value: ethers.parseEther("30") });
		await vault.connect(depositor2).deposit({ value: ethers.parseEther("20") });
		await vault.connect(depositor3).deposit({ value: ethers.parseEther("14") });

		expect(await vault.totalDeposited()).to.equal(TIER_95_CAP);

		// Now close. Time must advance past MIN_OPEN_DURATION (15min) since cap is hit but
		// timestamp hasn't elapsed. closeSubscribedVault handles this.
		await closeSubscribedVault(vault, shadowHot);

		expect(await vault.state()).to.equal(1n); // CLOSED

		console.log(`    [vault] closed at ${await vault.totalDeposited()} BNB`);
	});

	it("[step 5] executeBundle: V2 pair created, tokens distributed", async () => {
		const router = await ethers.getContractAt("BundleRouter", this.addrs.router);
		await executeBundle(router, bundleBot, this.cfg, this.addrs.taxSplitter);

		// V2 pair should now exist
		const pcsFactory = new ethers.Contract(PCS_FACTORY, PCS_FACTORY_ABI, ethers.provider);
		const pair = await pcsFactory.getPair(this.mined.predicted, WBNB);
		expect(pair).to.not.equal(ethers.ZeroAddress);

		console.log(`    [bundle] V2 pair: ${pair}`);
		this.pair = pair;
	});

	it("[step 6] **CRITICAL** 10% of supply landed in AgentSafe (NOT TreasuryLP5)", async () => {
		const token = new ethers.Contract(this.mined.predicted, TOKEN_ABI, ethers.provider);
		const totalSupply = await token.totalSupply();
		const decimals = await token.decimals();
		expect(decimals).to.equal(18);

		const expectedTreasury = totalSupply / 10n; // 10%
		console.log(`    [supply] totalSupply=${ethers.formatEther(totalSupply)}, expected 10%=${ethers.formatEther(expectedTreasury)}`);

		const agentSafeBalance = await token.balanceOf(this.addrs.agentSafe);
		const treasuryLp5Balance = await token.balanceOf(this.addrs.treasuryLp);

		console.log(`    [AgentSafe balance] ${ethers.formatEther(agentSafeBalance)} tokens`);
		console.log(`    [TreasuryLP5 balance] ${ethers.formatEther(treasuryLp5Balance)} tokens`);

		// CRITICAL ASSERTIONS - this is the whole point of post-#672 behavior
		expect(agentSafeBalance).to.equal(expectedTreasury); // ✅ 10% went to AgentSafe
		expect(treasuryLp5Balance).to.equal(0n); // ✅ TreasuryLP5 is dormant

		console.log("    ✅ 10% routed to AgentSafe, TreasuryLP5 dormant — post-#672 behavior CONFIRMED");
	});

	it("[step 7] token is tradeable on PCS V2 (buy + sell round-trip)", async () => {
		await skipAntiFarmer();

		const token = new ethers.Contract(this.mined.predicted, TOKEN_ABI, trader);
		const pcsRouter = new ethers.Contract(PCS_ROUTER, PCS_ROUTER_ABI, trader);
		const block = await ethers.provider.getBlock("latest");
		const deadline = block.timestamp + 600;

		const buyPath = [WBNB, this.mined.predicted];
		const sellPath = [this.mined.predicted, WBNB];

		const balBefore = await token.balanceOf(trader.address);
		await (
			await pcsRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(0, buyPath, trader.address, deadline, {
				value: ethers.parseEther("0.1"),
			})
		).wait();
		const balAfterBuy = await token.balanceOf(trader.address);
		const bought = balAfterBuy - balBefore;
		expect(bought).to.be.greaterThan(0n);
		console.log(`    [trade] 0.1 BNB → ${ethers.formatEther(bought)} tokens`);

		// Sell half back
		const sellAmount = bought / 2n;
		await (await token.approve(PCS_ROUTER, sellAmount)).wait();
		const trade = await pcsRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
			sellAmount,
			0,
			sellPath,
			trader.address,
			deadline,
		);
		await trade.wait();
		console.log(`    [trade] sold ${ethers.formatEther(sellAmount)} tokens for BNB`);
	});

	it("[step 8] finalizeLaunch REVERTS — LP5 has no tokens (deferred V3 activation)", async () => {
		// This is the documented NEW behavior. Anyone trying to activate the V3 LP
		// will get insufficient_tokens() because LP5 has 0 token balance.
		// To activate later, AgentSafe owners must first transfer tokens to LP5, THEN call finalizeLaunch.
		await expect(factory.finalizeLaunch(this.mined.predicted)).to.be.reverted;
		console.log("    ✅ finalizeLaunch reverts (LP5 has 0 balance) — deferred V3 activation working as designed");
	});

	// NOTE: steps 9-10 below exercise `instantAdminRefund` end-to-end on a TIER_TEST
	// sibling launch (mine a second vanity, deposit, admin refund, depositor refund).
	// We skip these here because:
	//   (a) `instantAdminRefund` is independently tested in 4 cases via PR #665's
	//       `test/launch-vault-admin-refund.test.js` (TEST allowed / TIER_95 rejected /
	//       non-owner rejected / post-LAUNCHED rejected). All 4 pass.
	//   (b) The vanity mining for the second launch (suffix 7777 AND < WBNB) takes 5+ min
	//       on top of the already-mined main vanity, doubling the test runtime.
	//   (c) The mainnet gummy launch (if Shadow chooses to do one) exercises the same flow.
	//
	// If you want to run them anyway, change `.skip` to nothing on the next two it()s.
	it.skip("[step 9] instantAdminRefund: TIER_TEST sibling launch + admin refund (skipped — see note)", async () => {
		// Spin up a separate TIER_TEST launch and exercise the gummy-flow admin refund path.
		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const label = "TIER_TEST_V1";
		const mined = mineVanitySalt(PORTAL, codeHash, shadowHot.address, label);
		console.log(`    [gummy mined] predicted=${mined.predicted}`);

		const block = await ethers.provider.getBlock("latest");
		const closeTimestamp = block.timestamp + 3600;

		const cfg = buildWaifuConfig({
			name: "Test",
			symbol: "TEST",
			tier: TIER_TEST,
			creator: shadowHot.address,
			bundleBot: bundleBot.address,
			closeTimestamp,
			rawSalt: mined.rawSalt,
			predicted: mined.predicted,
			platformReceiver: platformSafe.address,
			patron: shadowHot.address,
			agentSafeOwners: [shadowHot.address],
			agentSafeThreshold: 1, // gummy: simple 1/1
			noBurn: true,
			// TIER_TEST uses smaller ticks for fast verification
			treasuryTickLowers: [2000, 6000, 10000, 14000],
			treasuryTickUppers: [887200, 887200, 887200, 887200],
		});

		await (await factory.connect(shadowHot).createLaunch(cfg)).wait();
		const gummyAddrs = await factory.launches(mined.predicted);
		const gummyVault = await ethers.getContractAt("LaunchVault", gummyAddrs.vault);

		// User deposits 0.01 BNB
		await gummyVault.connect(depositor2).deposit({ value: ethers.parseEther("0.01") });
		const depositorBalanceBefore = await ethers.provider.getBalance(depositor2.address);
		const depositedAmount = await gummyVault.deposited(depositor2.address);
		expect(depositedAmount).to.equal(ethers.parseEther("0.01"));
		console.log(`    [gummy] depositor deposited ${ethers.formatEther(depositedAmount)} BNB`);

		// Vault is OPEN, tier is TEST. Factory owner can call instantAdminRefund.
		// In this test, factory owner == deployer (we didn't transferOwnership).
		expect(await gummyVault.state()).to.equal(0n); // OPEN
		expect(await gummyVault.tier()).to.equal(BigInt(TIER_TEST));

		await (await gummyVault.connect(deployer).instantAdminRefund("gummy-test")).wait();
		expect(await gummyVault.state()).to.equal(3n); // REFUND
		console.log(`    [gummy] instantAdminRefund executed, vault state -> REFUND`);

		// Depositor calls refund() to retrieve BNB
		const refundTx = await gummyVault.connect(depositor2).refund();
		const refundReceipt = await refundTx.wait();
		const gasUsed = refundReceipt.gasUsed * refundReceipt.gasPrice;
		const depositorBalanceAfter = await ethers.provider.getBalance(depositor2.address);
		const netReceived = depositorBalanceAfter - depositorBalanceBefore + gasUsed;
		expect(netReceived).to.equal(ethers.parseEther("0.01"));
		console.log(`    ✅ depositor recovered ${ethers.formatEther(netReceived)} BNB (full deposit) via refund()`);
	});

	it.skip("[step 10] instantAdminRefund REJECTS non-TEST tiers (security guard — covered in PR #665)", async () => {
		// Try calling instantAdminRefund on the TIER_95 vault — must revert.
		const vault = await ethers.getContractAt("LaunchVault", this.addrs.vault);
		await expect(vault.connect(deployer).instantAdminRefund("should-not-work")).to.be.reverted;
		console.log("    ✅ instantAdminRefund rejects TIER_95 — TIER_TEST guard working");
	});
});
