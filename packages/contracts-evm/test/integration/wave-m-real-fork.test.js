// Wave M5 :: full quintet end-to-end on a real BSC fork.
//
// Forks BSC mainnet, deploys the M3 LaunchFactory wired to:
//   - real PancakeSwap V2 (factory + router)
//   - real FLAP portal (TOKEN_TAXED_V3 impl)
//   - real Gnosis Safe v1.4.1 (singleton + ProxyFactory)
//
// Each scenario exercises:
//   createLaunch -> 5 contracts (vault, router, treasuryLp, taxSplitter, agentSafe)
//   vault deposits, vault.close, BundleRouter.executeBundle
//   simulate post-graduation buy/sell traffic on the new V2 pair
//   call TaxSplitter.split() + splitToken() and check the recipient cut math
//   Safe.getOwners()/getThreshold() match the configured agentSafe layout
//
// Tax-flow rootcause (resolved in feat/wave-m3-factory-integration @ 01375c62):
//   The earlier M5 run thought FLAP ignored our `commissionReceiver` field.
//   That was a misread. Actual rootcause was that BundleRouter passed
//   `beneficiary = address(this)` (the BundleRouter itself) instead of
//   `beneficiary = p.commissionReceiver` (the TaxSplitter). FLAP's
//   TaxProcessor.marketAddress maps from `beneficiary` and receives the
//   ~88% marketing slice, so on the buggy path the marketing tax sat stuck
//   in BundleRouter while TaxSplitter only got the 2% commission slice.
//
//   One-line fix in BundleRouter._callPortal flips `beneficiary` to the
//   TaxSplitter. Now ~90% of every tax BNB (88% market + 2% commission)
//   flows through TaxSplitter into the 10/25/65 platform/patron/agent
//   split. Scenario 6 verifies this end-to-end against the live FLAP
//   TaxProcessor on a BSC fork.
//
//   See ~/.moltbot/projects/waifu/wave-m/TAX_FLOW_ROOTCAUSE.md for the
//   full on-chain analysis and probe results.
//
//   Scenarios 1-5 still seed the splitter directly with native BNB / ERC20
//   to prove the split math in isolation (deterministic, no PCS slippage
//   noise). Scenario 6 proves the wiring works end-to-end.
//
// Run with:
//   LATEST_HEX=$(curl -s -X POST -H 'Content-Type: application/json' \
//     --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
//     https://bsc-mainnet.public.blastapi.io | jq -r .result)
//   PINNED=$(( $(printf '%d\n' $LATEST_HEX) - 100 ))
//   FORK_BSC=true FORK_BSC_URL=https://bsc-mainnet.public.blastapi.io FORK_BSC_BLOCK=$PINNED \
//     bun hardhat test test/integration/wave-m-real-fork.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");

const FORK_ENABLED = process.env.FORK_BSC === "true";

// BSC mainnet address book.
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TOKEN_TAXED_V3_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const TIP_RECEIVER = "0x4848489f0b2BEdd788c696e2D79b6b69D7484848";
const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";

// Tier enum values (mirrors LaunchFactory.LaunchTier).
const TIER_90 = 1;

// EIP-1167 minimal proxy init code template (Portal clones TOKEN_TAXED_V3 here).
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

// LaunchFactory itself just checks CREATE2 reconciliation, but FLAP Portal
// enforces a vanity 0x...7777 suffix on the predicted token address when
// newTokenV6 actually fires. So any scenario that runs executeBundle must
// mine the salt; the validation/Safe-only scenarios can use a constant salt.
function quickSalt(deployer, codeHash, creator, label) {
	const rawSalt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string", "address"], [label, creator]));
	const salt = effectiveSalt(creator, rawSalt);
	const predicted = predictCreate2(deployer, salt, codeHash);
	return { rawSalt, salt, predicted };
}

// Mine a salt where the CREATE2 predicted address ends in the required 4-nibble
// vanity suffix (default "7777", matching the FLAP Portal requirement).
function mineVanitySalt(deployer, codeHash, creator, label, suffix = "7777") {
	const maxIterations = 4_000_000;
	let rawSalt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string", "address"], [label, creator]));
	for (let i = 0; i < maxIterations; i += 1) {
		const salt = effectiveSalt(creator, rawSalt);
		const predicted = predictCreate2(deployer, salt, codeHash);
		if (predicted.toLowerCase().endsWith(suffix)) {
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

// Skip the FLAP anti-farmer window so V2 trades aren't blocked.
async function skipAntiFarmer(seconds = 86_401) {
	await ethers.provider.send("evm_increaseTime", [seconds]);
	await ethers.provider.send("evm_mine", []);
}

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

// Minimal canonical Safe v1.4.1 ABI fragments we depend on.
const SAFE_ABI = [
	"function getOwners() view returns (address[])",
	"function getThreshold() view returns (uint256)",
	"function isOwner(address) view returns (bool)",
	"function VERSION() view returns (string)",
];

// Tier 90 cap = 32 BNB. 60% wallet cap = 19.2 BNB.
const TIER_90_CAP = ethers.parseEther("32");
const TIER_90_DEPOSIT_A = ethers.parseEther("19.2"); // at wallet cap
const TIER_90_DEPOSIT_B = TIER_90_CAP - TIER_90_DEPOSIT_A; // 12.8

async function deployFactory(platformReceiver) {
	const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer");
	const routerDeployer = await RouterDeployerCF.deploy();
	await routerDeployer.waitForDeployment();

	const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeDeployer");
	const agentSafeDeployer = await AgentSafeDeployerCF.deploy(SAFE_SINGLETON, SAFE_PROXY_FACTORY);
	await agentSafeDeployer.waitForDeployment();

	// Wave O.1: TreasuryLP5Deployer + PCS V3 NPM (no Chainlink feed)
	const TreasuryLp5DeployerCF = await ethers.getContractFactory("TreasuryLP5Deployer");
	const treasuryLp5Deployer = await TreasuryLp5DeployerCF.deploy();
	await treasuryLp5Deployer.waitForDeployment();
	const PCS_V3_NPM = "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364";
	const PCS_V3_FACTORY = "0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865";

	const Factory = await ethers.getContractFactory("LaunchFactory");
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

function buildConfig(args) {
	return {
		name: args.name,
		symbol: args.symbol,
		metaCid: args.metaCid,
		creator: args.creator,
		bundleBot: args.bundleBot,
		tier: TIER_90,
		buyTaxBps: 300,
		sellTaxBps: 300,
		taxDuration: 31_536_000,
		antiFarmerDuration: 86_400,
		closeTimestamp: args.closeTimestamp,
		vanitySalt: args.rawSalt,
		predictedTokenAddress: args.predicted,
		noBurn: true, // smoke-test mode: would-burn slice lands on creator instead of DEAD
		platformReceiver: args.platformReceiver,
		patron: args.patron,
		agentSafeOwners: args.agentSafeOwners,
		agentSafeThreshold: args.agentSafeThreshold,
		platformBps: args.platformBps,
		patronBps: args.patronBps,
		// Wave N1 LP tick ladder (must be multiples of PCS V3 1% tickSpacing 200)
		treasuryTickLowers: args.treasuryTickLowers ?? [2000, 6000, 10000, 14000],
		treasuryTickUppers: args.treasuryTickUppers ?? [4000, 8000, 12000, 16000],
	};
}

async function fundVaultToCap(vault, creator, depositor2) {
	await vault.connect(creator).deposit({ value: TIER_90_DEPOSIT_A });
	await vault.connect(depositor2).deposit({ value: TIER_90_DEPOSIT_B });
	expect(await vault.totalDeposited()).to.equal(TIER_90_CAP);
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

// Simulate post-launch trading: alternating buys (ETH->token) and sells
// (token->ETH) by a random EOA. Proves the new V2 pair is live and tradable
// against real PCS reserves.
async function simulateBuySellPressure(token, predicted, trader, totalBnb, legs = 4) {
	const pcsRouter = new ethers.Contract(PCS_ROUTER, PCS_ROUTER_ABI, trader);
	const tokenAsTrader = new ethers.Contract(predicted, TOKEN_ABI, trader);
	const buyPath = [WBNB, predicted];
	const sellPath = [predicted, WBNB];
	const perLeg = totalBnb / BigInt(legs);

	let buys = 0n;
	let sells = 0n;
	for (let i = 0; i < legs; i += 1) {
		const block = await ethers.provider.getBlock("latest");
		const deadline = block.timestamp + 3600;

		const balBefore = await token.balanceOf(trader.address);
		await (
			await pcsRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(0, buyPath, trader.address, deadline, {
				value: perLeg,
			})
		).wait();
		const balAfterBuy = await token.balanceOf(trader.address);
		buys += balAfterBuy - balBefore;

		const sellAmount = (balAfterBuy - balBefore) / 2n;
		if (sellAmount === 0n) continue;
		await (await tokenAsTrader.approve(PCS_ROUTER, sellAmount)).wait();
		await (
			await pcsRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
				sellAmount,
				0,
				sellPath,
				trader.address,
				deadline,
			)
		).wait();
		sells += sellAmount;
	}
	return { buys, sells };
}

// Seed the splitter directly with native BNB so we can exercise split() math
// deterministically (see the FINDING note at the top of this file).
async function seedSplitterNative(splitterAddr, funder, amount) {
	const tx = await funder.sendTransaction({ to: splitterAddr, value: amount });
	await tx.wait();
}

// Seed the splitter with ERC20 by having the trader buy + transfer.
async function seedSplitterTokens(predicted, trader, splitterAddr, bnbIn, transferAmt) {
	const pcsRouter = new ethers.Contract(PCS_ROUTER, PCS_ROUTER_ABI, trader);
	const tokenAsTrader = new ethers.Contract(predicted, TOKEN_ABI, trader);
	const deadline = (await ethers.provider.getBlock("latest")).timestamp + 600;
	await (
		await pcsRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [WBNB, predicted], trader.address, deadline, {
			value: bnbIn,
		})
	).wait();
	const bal = await tokenAsTrader.balanceOf(trader.address);
	if (bal < transferAmt) {
		throw new Error(`trader bought ${bal} < requested ${transferAmt}`);
	}
	await (await tokenAsTrader.transfer(splitterAddr, transferAmt)).wait();
}

// Assert recipients got their BPS share. agent absorbs rounding; tolerance is
// 2 wei on platform/patron (integer-division floor) and the agent receives
// the remainder so the sum is always exact.
function expectSplitShares(totalBefore, beforeMap, afterMap, recipients) {
	let summed = 0n;
	for (const r of recipients) {
		const delta = afterMap[r.label] - beforeMap[r.label];
		if (r.label === "agent") {
			// Agent gets remainder; compute it as total - sum-of-others-expected.
			summed += delta;
			continue;
		}
		const expected = (totalBefore * BigInt(r.bps)) / 10000n;
		const tol = 2n;
		expect(delta, `${r.label} delta`).to.be.gte(expected - tol);
		expect(delta, `${r.label} delta`).to.be.lte(expected + tol);
		summed += delta;
	}
	expect(summed, "sum of deltas == total").to.equal(totalBefore);
}

describe("Wave M5 :: real-fork quintet end-to-end", function () {
	if (!FORK_ENABLED) {
		it.skip("requires FORK_BSC=true", () => {});
		return;
	}

	this.timeout(900_000); // 15 min: 5 launches against real Portal + multi-leg trading

	let owner;
	let bundleBot;
	let depositor2;
	let patron;
	let agentCoOwner;
	let trader;
	// FLAP Portal enforces a ~90s tx.origin cooldown on newTokenV6 calls. Each
	// scenario that actually executes a bundle (1 and 5) gets its own fresh
	// creator EOA so consecutive scenarios don't wait on the cooldown.
	// Scenarios 2/3/4 only deploy contracts (no Portal call) and share one.
	let creatorS1;
	let creatorS5;
	let creatorS6;
	let creatorSafeOnly;
	// Dedicated funder for seedSplitterNative -- MUST be distinct from
	// platformReceiver, patron, and agentSafe so the seeding spend doesn't
	// contaminate the delta measurements.
	let seedFunder;

	before(async () => {
		const blockNumber = await ethers.provider.getBlockNumber();
		const chainId = (await ethers.provider.getNetwork()).chainId;
		console.log(`    [fork] chainId=${chainId} blockNumber=${blockNumber}`);
		expect(Number(chainId)).to.equal(56);

		const signers = await ethers.getSigners();
		// Use a slice that doesn't collide with the other wave-h fork tests'
		// signers (0..19). Wave M5 uses 0..1 (fresh creators for bundle-running
		// scenarios) plus 18..24 (shared bot / patron / trader / safe-only).
		owner = signers[20];
		bundleBot = signers[22];
		depositor2 = signers[23];
		patron = signers[24];
		agentCoOwner = signers[19];
		trader = signers[18];

		creatorS1 = signers[0]; // bundle-running
		creatorS5 = signers[1]; // bundle-running
		creatorS6 = signers[3]; // bundle-running (scenario 6 tax-flow E2E)
		creatorSafeOnly = signers[21]; // no Portal call: scenarios 2/3/4
		seedFunder = signers[2]; // dedicated seed funder, not a recipient anywhere
	});

	// -----------------------------------------------------------------
	// Scenario 1: default split (10/25/65), 1/1 agentSafe, full flow
	// -----------------------------------------------------------------
	it("[scenario 1] TIER_90 default 10/25/65 split + 1/1 agentSafe end-to-end", async () => {
		const creator = creatorS1;
		const platformReceiver = owner.address;
		const { factory } = await deployFactory(platformReceiver);

		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, salt, predicted, iterations } = mineVanitySalt(
			PORTAL,
			codeHash,
			creator.address,
			"m5-s1-default-split",
		);
		console.log(`    [s1] mined salt in ${iterations} iters; predicted=${predicted}`);

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const cfg = buildConfig({
			name: "Wave M5 S1",
			symbol: "WM5A",
			metaCid: "QmM5Scenario1",
			creator: creator.address,
			bundleBot: bundleBot.address,
			closeTimestamp,
			rawSalt,
			predicted,
			platformReceiver,
			patron: patron.address,
			agentSafeOwners: [creator.address],
			agentSafeThreshold: 1,
			platformBps: 1000,
			patronBps: 2500,
		});

		const createTx = await factory.connect(creator).createLaunch(cfg);
		const createReceipt = await createTx.wait();
		expect(createReceipt.status).to.equal(1);
		console.log(`    [s1] createLaunch gas: ${createReceipt.gasUsed}`);

		const addrs = await factory.launches(predicted);
		expect(addrs.vault).to.not.equal(ethers.ZeroAddress);
		expect(addrs.router).to.not.equal(ethers.ZeroAddress);
		expect(addrs.treasuryLp).to.not.equal(ethers.ZeroAddress);
		expect(addrs.taxSplitter).to.not.equal(ethers.ZeroAddress);
		expect(addrs.agentSafe).to.not.equal(ethers.ZeroAddress);

		// All 5 contracts have deployed bytecode.
		for (const k of ["vault", "router", "treasuryLp", "taxSplitter", "agentSafe"]) {
			const code = await ethers.provider.getCode(addrs[k]);
			expect(code.length, `${k} has bytecode`).to.be.gt(2);
		}

		const taxSplitter = await ethers.getContractAt("TaxSplitter", addrs.taxSplitter);
		expect(await taxSplitter.platform()).to.equal(platformReceiver);
		expect(await taxSplitter.patron()).to.equal(patron.address);
		expect(await taxSplitter.agent()).to.equal(addrs.agentSafe);
		expect(await taxSplitter.platformBps()).to.equal(1000);
		expect(await taxSplitter.patronBps()).to.equal(2500);
		expect(await taxSplitter.agentBps()).to.equal(6500);

		// 1/1 agent safe sanity via real Gnosis Safe storage.
		const agentSafe = new ethers.Contract(addrs.agentSafe, SAFE_ABI, ethers.provider);
		expect(await agentSafe.getThreshold()).to.equal(1n);
		const owners = await agentSafe.getOwners();
		expect([...owners]).to.deep.equal([creator.address]);
		expect(await agentSafe.isOwner(creator.address)).to.equal(true);
		const safeVersion = await agentSafe.VERSION();
		console.log(`    [s1] real Safe v${safeVersion} 1/1 threshold confirmed`);

		// Run the bundle.
		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = Vault.attach(addrs.vault);
		const Router = await ethers.getContractFactory("BundleRouter");
		const router = Router.attach(addrs.router);

		await fundVaultToCap(vault, creator, depositor2);
		await closeSubscribedVault(vault, bundleBot);
		const execReceipt = await executeBundle(router, bundleBot, cfg, addrs.taxSplitter);
		console.log(`    [s1] executeBundle gas: ${execReceipt.gasUsed}`);

		const token = new ethers.Contract(predicted, TOKEN_ABI, ethers.provider);
		const totalSupply = await token.totalSupply();
		expect(totalSupply).to.equal(ethers.parseUnits("1000000000", 18));

		// V2 pair must exist post-bundle.
		const pcsFactory = new ethers.Contract(PCS_FACTORY, PCS_FACTORY_ABI, ethers.provider);
		const pair = await pcsFactory.getPair(predicted, WBNB);
		expect(pair).to.not.equal(ethers.ZeroAddress);
		console.log(`    [s1] V2 pair at ${pair}`);

		// Generate post-launch buy/sell pressure (proves the token trades; tax
		// is collected by FLAP's internal helper, not the TaxSplitter -- see
		// FINDING note at the top of this file).
		await skipAntiFarmer();
		const { buys, sells } = await simulateBuySellPressure(token, predicted, trader, ethers.parseEther("20"), 6);
		expect(buys).to.be.gt(0n);
		expect(sells).to.be.gt(0n);
		console.log(`    [s1] traded buys=${ethers.formatUnits(buys, 18)} sells=${ethers.formatUnits(sells, 18)}`);

		// ---- TaxSplitter math: native BNB ----
		const splitAmt = ethers.parseEther("3");
		await seedSplitterNative(addrs.taxSplitter, seedFunder, splitAmt);
		expect(await ethers.provider.getBalance(addrs.taxSplitter)).to.equal(splitAmt);

		const bnbBefore = {
			platform: await ethers.provider.getBalance(platformReceiver),
			patron: await ethers.provider.getBalance(patron.address),
			agent: await ethers.provider.getBalance(addrs.agentSafe),
		};
		// Trigger split from a 3rd party (anyone can call; idempotent).
		await (await taxSplitter.connect(bundleBot).split()).wait();
		const bnbAfter = {
			platform: await ethers.provider.getBalance(platformReceiver),
			patron: await ethers.provider.getBalance(patron.address),
			agent: await ethers.provider.getBalance(addrs.agentSafe),
		};
		expectSplitShares(splitAmt, bnbBefore, bnbAfter, [
			{ label: "platform", bps: 1000 },
			{ label: "patron", bps: 2500 },
			{ label: "agent", bps: 6500 },
		]);
		expect(await ethers.provider.getBalance(addrs.taxSplitter)).to.equal(0n);
		console.log(
			`    [s1] BNB split OK: platform+${ethers.formatEther(bnbAfter.platform - bnbBefore.platform)} patron+${ethers.formatEther(bnbAfter.patron - bnbBefore.patron)} agent+${ethers.formatEther(bnbAfter.agent - bnbBefore.agent)}`,
		);

		// Idempotency: re-splitting a zero balance is a no-op (no revert).
		await (await taxSplitter.connect(bundleBot).split()).wait();

		// ---- TaxSplitter math: ERC20 (the launched token) ----
		const seedTokens = ethers.parseUnits("250000", 18);
		await seedSplitterTokens(predicted, trader, addrs.taxSplitter, ethers.parseEther("2"), seedTokens);
		const splitterTokens = await token.balanceOf(addrs.taxSplitter);
		expect(splitterTokens).to.be.gte(seedTokens - 1n); // FoT-safe lower bound
		const tokBefore = {
			platform: await token.balanceOf(platformReceiver),
			patron: await token.balanceOf(patron.address),
			agent: await token.balanceOf(addrs.agentSafe),
		};
		await (await taxSplitter.connect(bundleBot).splitToken(predicted)).wait();
		const tokAfter = {
			platform: await token.balanceOf(platformReceiver),
			patron: await token.balanceOf(patron.address),
			agent: await token.balanceOf(addrs.agentSafe),
		};
		expectSplitShares(splitterTokens, tokBefore, tokAfter, [
			{ label: "platform", bps: 1000 },
			{ label: "patron", bps: 2500 },
			{ label: "agent", bps: 6500 },
		]);
		expect(await token.balanceOf(addrs.taxSplitter)).to.equal(0n);
		console.log(
			`    [s1] token split OK: platform+${ethers.formatUnits(tokAfter.platform - tokBefore.platform, 18)} patron+${ethers.formatUnits(tokAfter.patron - tokBefore.patron, 18)} agent+${ethers.formatUnits(tokAfter.agent - tokBefore.agent, 18)}`,
		);

		expect(await factory.usedSalts(salt)).to.equal(true);
	});

	// -----------------------------------------------------------------
	// Scenario 2: 50% platform cap (max) + reverts on 5001
	// -----------------------------------------------------------------
	it("[scenario 2] platformBps cap: 5000 succeeds, 5001 reverts", async () => {
		// Only factory validation + a Safe deploy for the 5000-cap case;
		// no Portal call so cooldown doesn't matter.
		const creator = creatorSafeOnly;
		const platformReceiver = owner.address;
		const { factory } = await deployFactory(platformReceiver);

		const codeHashA = initCodeHash(TOKEN_TAXED_V3_IMPL);

		// 2a. Over-cap: 5001 must revert at validation, no Portal call attempted.
		const mineA = quickSalt(PORTAL, codeHashA, creator.address, "m5-s2-overcap");
		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const cfgOver = buildConfig({
			name: "Wave M5 S2 OVER",
			symbol: "WM5OV",
			metaCid: "QmM5S2Over",
			creator: creator.address,
			bundleBot: bundleBot.address,
			closeTimestamp,
			rawSalt: mineA.rawSalt,
			predicted: mineA.predicted,
			platformReceiver,
			patron: patron.address,
			agentSafeOwners: [creator.address],
			agentSafeThreshold: 1,
			platformBps: 5001,
			patronBps: 2500,
		});
		await expect(factory.connect(creator).createLaunch(cfgOver)).to.be.revertedWithCustomError(
			factory,
			"InvalidPlatformBps",
		);
		console.log("    [s2] 5001 reverted InvalidPlatformBps as expected");

		// 2b. Exact-cap: 5000 succeeds and the splitter reports the right BPS.
		const mineB = quickSalt(PORTAL, codeHashA, creator.address, "m5-s2-maxcap");
		const cfgMax = buildConfig({
			name: "Wave M5 S2 MAX",
			symbol: "WM5MX",
			metaCid: "QmM5S2Max",
			creator: creator.address,
			bundleBot: bundleBot.address,
			closeTimestamp,
			rawSalt: mineB.rawSalt,
			predicted: mineB.predicted,
			platformReceiver,
			patron: patron.address,
			agentSafeOwners: [creator.address],
			agentSafeThreshold: 1,
			platformBps: 5000,
			patronBps: 2500,
		});
		const tx = await factory.connect(creator).createLaunch(cfgMax);
		const receipt = await tx.wait();
		expect(receipt.status).to.equal(1);

		const addrs = await factory.launches(mineB.predicted);
		const taxSplitter = await ethers.getContractAt("TaxSplitter", addrs.taxSplitter);
		expect(await taxSplitter.platformBps()).to.equal(5000);
		expect(await taxSplitter.patronBps()).to.equal(2500);
		expect(await taxSplitter.agentBps()).to.equal(2500);
		console.log("    [s2] 5000 cap accepted; splitter bps=5000/2500/2500");

		// Exercise split() math at the 50% cap by seeding native BNB.
		const splitAmt = ethers.parseEther("2");
		await seedSplitterNative(addrs.taxSplitter, seedFunder, splitAmt);
		const before = {
			platform: await ethers.provider.getBalance(platformReceiver),
			patron: await ethers.provider.getBalance(patron.address),
			agent: await ethers.provider.getBalance(addrs.agentSafe),
		};
		await (await taxSplitter.connect(bundleBot).split()).wait();
		const after = {
			platform: await ethers.provider.getBalance(platformReceiver),
			patron: await ethers.provider.getBalance(patron.address),
			agent: await ethers.provider.getBalance(addrs.agentSafe),
		};
		expectSplitShares(splitAmt, before, after, [
			{ label: "platform", bps: 5000 },
			{ label: "patron", bps: 2500 },
			{ label: "agent", bps: 2500 },
		]);
		console.log(
			`    [s2] 50/25/25 BNB split OK: platform+${ethers.formatEther(after.platform - before.platform)} patron+${ethers.formatEther(after.patron - before.patron)} agent+${ethers.formatEther(after.agent - before.agent)}`,
		);
	});

	// -----------------------------------------------------------------
	// Scenario 3: 2/2 multisig agentSafe
	// -----------------------------------------------------------------
	it("[scenario 3] 2/2 agentSafe deploy: real Safe storage matches config", async () => {
		// No Portal call -- createLaunch deploys the agent Safe + per-launch
		// contracts and we stop at the Safe assertion. Vault.close() never runs.
		const creator = creatorSafeOnly;
		const platformReceiver = owner.address;
		const { factory } = await deployFactory(platformReceiver);

		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, predicted } = quickSalt(PORTAL, codeHash, creator.address, "m5-s3-multisig");
		console.log(`    [s3] predicted=${predicted}`);

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const owners = [creator.address, agentCoOwner.address];
		const cfg = buildConfig({
			name: "Wave M5 S3",
			symbol: "WM5C",
			metaCid: "QmM5S3",
			creator: creator.address,
			bundleBot: bundleBot.address,
			closeTimestamp,
			rawSalt,
			predicted,
			platformReceiver,
			patron: patron.address,
			agentSafeOwners: owners,
			agentSafeThreshold: 2,
			platformBps: 1000,
			patronBps: 2500,
		});

		await (await factory.connect(creator).createLaunch(cfg)).wait();
		const addrs = await factory.launches(predicted);

		const agentSafe = new ethers.Contract(addrs.agentSafe, SAFE_ABI, ethers.provider);
		const live = await agentSafe.getOwners();
		// Safe v1.4.1 stores owners in a SENTINEL-anchored linked list. getOwners()
		// returns them in insertion order matching what we passed.
		expect([...live]).to.deep.equal(owners);
		expect(await agentSafe.getThreshold()).to.equal(2n);
		expect(await agentSafe.isOwner(creator.address)).to.equal(true);
		expect(await agentSafe.isOwner(agentCoOwner.address)).to.equal(true);
		expect(await agentSafe.isOwner(bundleBot.address)).to.equal(false);

		const version = await agentSafe.VERSION();
		console.log(`    [s3] live Safe version=${version} threshold=2 owners=2`);
	});

	// -----------------------------------------------------------------
	// Scenario 4: cumulative split() across multiple seedings
	// -----------------------------------------------------------------
	it("[scenario 4] multiple split() calls credit recipients cumulatively", async () => {
		// Splitter math only; no Portal call. createLaunch is enough to spawn
		// the splitter + agent Safe.
		const creator = creatorSafeOnly;
		const platformReceiver = owner.address;
		const { factory } = await deployFactory(platformReceiver);

		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, predicted } = quickSalt(PORTAL, codeHash, creator.address, "m5-s4-cumulative");
		console.log(`    [s4] predicted=${predicted}`);

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const cfg = buildConfig({
			name: "Wave M5 S4",
			symbol: "WM5D",
			metaCid: "QmM5S4",
			creator: creator.address,
			bundleBot: bundleBot.address,
			closeTimestamp,
			rawSalt,
			predicted,
			platformReceiver,
			patron: patron.address,
			agentSafeOwners: [creator.address],
			agentSafeThreshold: 1,
			platformBps: 1000,
			patronBps: 2500,
		});

		await (await factory.connect(creator).createLaunch(cfg)).wait();
		const addrs = await factory.launches(predicted);
		const taxSplitter = await ethers.getContractAt("TaxSplitter", addrs.taxSplitter);

		// Round 1.
		const r1 = ethers.parseEther("1.5");
		await seedSplitterNative(addrs.taxSplitter, seedFunder, r1);
		const platformPre1 = await ethers.provider.getBalance(platformReceiver);
		const patronPre1 = await ethers.provider.getBalance(patron.address);
		const agentPre1 = await ethers.provider.getBalance(addrs.agentSafe);
		await (await taxSplitter.connect(bundleBot).split()).wait();
		const platformPost1 = await ethers.provider.getBalance(platformReceiver);
		const patronPost1 = await ethers.provider.getBalance(patron.address);
		const agentPost1 = await ethers.provider.getBalance(addrs.agentSafe);
		expect(platformPost1 - platformPre1).to.equal((r1 * 1000n) / 10000n);
		expect(patronPost1 - patronPre1).to.equal((r1 * 2500n) / 10000n);
		expect(agentPost1 - agentPre1).to.equal(r1 - (r1 * 1000n) / 10000n - (r1 * 2500n) / 10000n);
		expect(await ethers.provider.getBalance(addrs.taxSplitter)).to.equal(0n);
		console.log(
			`    [s4] round 1 split: platform+${ethers.formatEther(platformPost1 - platformPre1)} patron+${ethers.formatEther(patronPost1 - patronPre1)} agent+${ethers.formatEther(agentPost1 - agentPre1)}`,
		);

		// Round 2.
		const r2 = ethers.parseEther("0.75");
		await seedSplitterNative(addrs.taxSplitter, seedFunder, r2);
		await (await taxSplitter.connect(bundleBot).split()).wait();
		const platformPost2 = await ethers.provider.getBalance(platformReceiver);
		const patronPost2 = await ethers.provider.getBalance(patron.address);
		const agentPost2 = await ethers.provider.getBalance(addrs.agentSafe);

		// Cumulative deltas vs the absolute pre-round-1 baseline.
		const expectPlat = ((r1 + r2) * 1000n) / 10000n;
		const expectPatr = ((r1 + r2) * 2500n) / 10000n;
		// Agent: total - platform - patron deltas across the two rounds (because
		// each round computes the floor independently, agent may absorb 2 wei of
		// rounding twice).
		const platformCum = platformPost2 - platformPre1;
		const patronCum = patronPost2 - patronPre1;
		const agentCum = agentPost2 - agentPre1;
		// Per-round floor matches.
		expect(platformCum).to.equal((r1 * 1000n) / 10000n + (r2 * 1000n) / 10000n);
		expect(patronCum).to.equal((r1 * 2500n) / 10000n + (r2 * 2500n) / 10000n);
		expect(agentCum).to.equal(
			r1 - (r1 * 1000n) / 10000n - (r1 * 2500n) / 10000n + (r2 - (r2 * 1000n) / 10000n - (r2 * 2500n) / 10000n),
		);
		// And the total handed out matches the seeded total exactly.
		expect(platformCum + patronCum + agentCum).to.equal(r1 + r2);
		console.log(
			`    [s4] cumulative after round 2: platform=${ethers.formatEther(platformCum)} patron=${ethers.formatEther(patronCum)} agent=${ethers.formatEther(agentCum)} (sum=${ethers.formatEther(r1 + r2)} expected=${ethers.formatEther(expectPlat + expectPatr + (r1 + r2 - expectPlat - expectPatr))})`,
		);

		// Splitter must be empty after the second call.
		expect(await ethers.provider.getBalance(addrs.taxSplitter)).to.equal(0n);

		// Round 3 with zero balance: split() is a no-op (no revert, no transfers).
		await (await taxSplitter.connect(bundleBot).split()).wait();
		const platformPost3 = await ethers.provider.getBalance(platformReceiver);
		expect(platformPost3).to.equal(platformPost2);
	});

	// -----------------------------------------------------------------
	// Scenario 5: splitToken() drains ERC20 balance per BPS
	// -----------------------------------------------------------------
	it("[scenario 5] splitToken() distributes ERC20 balance per BPS", async () => {
		// Runs the full bundle to produce a live ERC20 to feed into the
		// splitter. Fresh creator dodges the Portal cooldown from scenario 1.
		const creator = creatorS5;
		const platformReceiver = owner.address;
		const { factory } = await deployFactory(platformReceiver);

		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, predicted, iterations } = mineVanitySalt(PORTAL, codeHash, creator.address, "m5-s5-splittoken");
		console.log(`    [s5] mined salt in ${iterations} iters; predicted=${predicted}`);

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const cfg = buildConfig({
			name: "Wave M5 S5",
			symbol: "WM5E",
			metaCid: "QmM5S5",
			creator: creator.address,
			bundleBot: bundleBot.address,
			closeTimestamp,
			rawSalt,
			predicted,
			platformReceiver,
			patron: patron.address,
			agentSafeOwners: [creator.address],
			agentSafeThreshold: 1,
			platformBps: 1000,
			patronBps: 2500,
		});

		await (await factory.connect(creator).createLaunch(cfg)).wait();
		const addrs = await factory.launches(predicted);
		const taxSplitter = await ethers.getContractAt("TaxSplitter", addrs.taxSplitter);

		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = Vault.attach(addrs.vault);
		const Router = await ethers.getContractFactory("BundleRouter");
		const router = Router.attach(addrs.router);

		await fundVaultToCap(vault, creator, depositor2);
		await closeSubscribedVault(vault, bundleBot);
		await executeBundle(router, bundleBot, cfg, addrs.taxSplitter);

		const token = new ethers.Contract(predicted, TOKEN_ABI, ethers.provider);
		await skipAntiFarmer();

		// Seed the splitter with real ERC20 (the launched token, which is the
		// canonical asset the splitter is meant to handle).
		const seedAmt = ethers.parseUnits("100000", 18);
		await seedSplitterTokens(predicted, trader, addrs.taxSplitter, ethers.parseEther("2"), seedAmt);
		const splitterBal = await token.balanceOf(addrs.taxSplitter);
		expect(splitterBal).to.be.gte(seedAmt - 1n);
		console.log(`    [s5] splitter token balance: ${ethers.formatUnits(splitterBal, 18)}`);

		const before = {
			platform: await token.balanceOf(platformReceiver),
			patron: await token.balanceOf(patron.address),
			agent: await token.balanceOf(addrs.agentSafe),
		};
		await (await taxSplitter.connect(bundleBot).splitToken(predicted)).wait();
		const after = {
			platform: await token.balanceOf(platformReceiver),
			patron: await token.balanceOf(patron.address),
			agent: await token.balanceOf(addrs.agentSafe),
		};

		expectSplitShares(splitterBal, before, after, [
			{ label: "platform", bps: 1000 },
			{ label: "patron", bps: 2500 },
			{ label: "agent", bps: 6500 },
		]);

		// Splitter token balance is zero post-split.
		expect(await token.balanceOf(addrs.taxSplitter)).to.equal(0n);
		console.log(
			`    [s5] token split OK: platform+${ethers.formatUnits(after.platform - before.platform, 18)} patron+${ethers.formatUnits(after.patron - before.patron, 18)} agent+${ethers.formatUnits(after.agent - before.agent, 18)}`,
		);

		// splitMany passthrough sanity: empty array + zero-balance entry is a no-op.
		await (await taxSplitter.connect(bundleBot).splitMany([predicted])).wait();
	});

	// -----------------------------------------------------------------
	// Scenario 6: end-to-end tax flow through real FLAP TaxProcessor.
	//
	// Proves the BundleRouter `beneficiary = p.commissionReceiver` fix:
	//   1. Run the full quintet (createLaunch + bundle).
	//   2. Generate real buy/sell pressure on the live PCS V2 pair so the
	//      FLAP TaxProcessor accrues tax.
	//   3. Call TaxProcessor.dispatch() and assert:
	//        - TaxSplitter BNB > 0 (now receives BOTH the ~88% marketing
	//          slice AND the ~2% commission slice — used to only get 2%)
	//        - BundleRouter BNB == 0 (used to strand ~88% of tax here)
	//        - feeReceiver (FLAP protocol) got its 10% cut
	//   4. Call TaxSplitter.split() and verify the 10/25/65 distribution
	//      on the actual end-to-end-collected balance.
	// -----------------------------------------------------------------
	it("[scenario 6] tax-flow end-to-end: TaxSplitter accrues marketing + commission slices, split() distributes per BPS", async () => {
		const creator = creatorS6;
		const platformReceiver = owner.address;
		const { factory } = await deployFactory(platformReceiver);

		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, predicted, iterations } = mineVanitySalt(PORTAL, codeHash, creator.address, "m5-s6-taxflow-e2e");
		console.log(`    [s6] mined salt in ${iterations} iters; predicted=${predicted}`);

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const cfg = buildConfig({
			name: "Wave M5 S6",
			symbol: "WM5F",
			metaCid: "QmM5S6TaxFlow",
			creator: creator.address,
			bundleBot: bundleBot.address,
			closeTimestamp,
			rawSalt,
			predicted,
			platformReceiver,
			patron: patron.address,
			agentSafeOwners: [creator.address],
			agentSafeThreshold: 1,
			platformBps: 1000,
			patronBps: 2500,
		});

		await (await factory.connect(creator).createLaunch(cfg)).wait();
		const addrs = await factory.launches(predicted);
		const taxSplitter = await ethers.getContractAt("TaxSplitter", addrs.taxSplitter);

		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = Vault.attach(addrs.vault);
		const Router = await ethers.getContractFactory("BundleRouter");
		const router = Router.attach(addrs.router);

		await fundVaultToCap(vault, creator, depositor2);
		await closeSubscribedVault(vault, bundleBot);
		await executeBundle(router, bundleBot, cfg, addrs.taxSplitter);

		const token = new ethers.Contract(
			predicted,
			[...TOKEN_ABI, "function taxProcessor() view returns (address)"],
			ethers.provider,
		);
		const taxProcessorAddr = await token.taxProcessor();
		expect(taxProcessorAddr).to.not.equal(ethers.ZeroAddress);

		// Verify FLAP wiring matches our beneficiary-fix expectation: both
		// marketAddress and commissionReceiver point at our TaxSplitter.
		const TP_ABI = [
			"function marketAddress() view returns (address)",
			"function commissionReceiver() view returns (address)",
			"function feeReceiver() view returns (address)",
			"function dispatch()",
		];
		const taxProc = new ethers.Contract(taxProcessorAddr, TP_ABI, owner);
		const [marketAddr, commRcv, feeRcv] = await Promise.all([
			taxProc.marketAddress(),
			taxProc.commissionReceiver(),
			taxProc.feeReceiver(),
		]);
		expect(marketAddr.toLowerCase()).to.equal(
			addrs.taxSplitter.toLowerCase(),
			"FLAP marketAddress should be TaxSplitter (post-fix wiring)",
		);
		expect(commRcv.toLowerCase()).to.equal(
			addrs.taxSplitter.toLowerCase(),
			"FLAP commissionReceiver should be TaxSplitter",
		);
		console.log(`    [s6] FLAP wiring confirmed: marketAddress=commissionReceiver=TaxSplitter; feeReceiver=${feeRcv}`);

		// Skip the FLAP anti-farmer window so V2 trades aren't blocked.
		await skipAntiFarmer();

		// Pair must exist + have liquidity.
		const pcsFactory = new ethers.Contract(PCS_FACTORY, PCS_FACTORY_ABI, ethers.provider);
		const pair = await pcsFactory.getPair(predicted, WBNB);
		expect(pair).to.not.equal(ethers.ZeroAddress);

		// Generate enough buy/sell tax to be measurably above rounding/dust.
		// 1.5 BNB total across 6 legs => ~3% buy + 3% sell tax per leg, then
		// FLAP keeps 10% protocol fee, splitter receives ~88% market + 2%
		// commission slices. We expect TaxSplitter to net well over 0.01 BNB.
		const { buys, sells } = await simulateBuySellPressure(token, predicted, trader, ethers.parseEther("1.5"), 6);
		expect(buys).to.be.gt(0n);
		expect(sells).to.be.gt(0n);
		console.log(`    [s6] traded: buys=${ethers.formatUnits(buys, 18)} sells=${ethers.formatUnits(sells, 18)}`);

		// Snapshot balances BEFORE dispatch.
		const wbnb = new ethers.Contract(WBNB, ["function balanceOf(address) view returns (uint256)"], ethers.provider);
		const preDispatch = {
			router: await ethers.provider.getBalance(addrs.router),
			splitter: await ethers.provider.getBalance(addrs.taxSplitter),
			taxProc: await ethers.provider.getBalance(taxProcessorAddr),
			taxProcWbnb: await wbnb.balanceOf(taxProcessorAddr),
			feeRcvBnb: await ethers.provider.getBalance(feeRcv),
			feeRcvWbnb: await wbnb.balanceOf(feeRcv),
		};
		console.log(
			`    [s6] pre-dispatch: router=${ethers.formatEther(preDispatch.router)}BNB splitter=${ethers.formatEther(preDispatch.splitter)}BNB taxProc=${ethers.formatEther(preDispatch.taxProc)}BNB taxProc.WBNB=${ethers.formatUnits(preDispatch.taxProcWbnb, 18)}`,
		);

		// Flush accumulated tax. Dispatch is permissionless; anyone can call.
		await (await taxProc.connect(owner).dispatch()).wait();

		const postDispatch = {
			router: await ethers.provider.getBalance(addrs.router),
			splitter: await ethers.provider.getBalance(addrs.taxSplitter),
			taxProc: await ethers.provider.getBalance(taxProcessorAddr),
			taxProcWbnb: await wbnb.balanceOf(taxProcessorAddr),
			feeRcvBnb: await ethers.provider.getBalance(feeRcv),
			feeRcvWbnb: await wbnb.balanceOf(feeRcv),
		};
		// FLAP TaxProcessor pays the protocol fee in either BNB or WBNB
		// depending on the quote-token / isWeth path; sum both for accuracy.
		const feeRcvDelta =
			postDispatch.feeRcvBnb - preDispatch.feeRcvBnb + (postDispatch.feeRcvWbnb - preDispatch.feeRcvWbnb);
		console.log(
			`    [s6] post-dispatch: router=${ethers.formatEther(postDispatch.router)}BNB splitter=${ethers.formatEther(postDispatch.splitter)}BNB taxProc=${ethers.formatEther(postDispatch.taxProc)}BNB feeRcv+=${ethers.formatEther(feeRcvDelta)}`,
		);

		// === CORE ASSERTIONS ===

		// (a) BundleRouter holds NO BNB. Pre-fix, ~88% of tax stranded here.
		expect(
			postDispatch.router,
			"BundleRouter must not hold tax BNB after dispatch (was stranding ~88% pre-fix)",
		).to.equal(0n);

		// (b) TaxSplitter received BNB from dispatch. Pre-fix this was only
		//     the ~2% commission slice; post-fix it should also include the
		//     ~88% marketing slice.
		const splitterReceived = postDispatch.splitter - preDispatch.splitter;
		expect(splitterReceived, "TaxSplitter must receive BNB from FLAP dispatch").to.be.gt(0n);
		console.log(`    [s6] splitter received ${ethers.formatEther(splitterReceived)} BNB from dispatch`);

		// (c) FLAP protocol fee wallet got its cut (10% off the top, paid in
		//     either native BNB or WBNB depending on the quote-token path).
		expect(feeRcvDelta, "FLAP feeReceiver must receive its 10% protocol fee (BNB or WBNB)").to.be.gt(0n);

		// (d) Sanity-check the ratio: splitter (market + commission slices)
		//     should be roughly 9x the FLAP protocol fee (90% / 10%, modulo
		//     swap slippage on the internal tax-to-BNB swap). Tolerate 4–20x.
		const ratioScaled = (splitterReceived * 10000n) / feeRcvDelta; // bps
		expect(ratioScaled, "splitter/feeRcv ratio should be ~9x (post-fix); pre-fix was ~0.02x").to.be.gte(40000n);
		expect(ratioScaled, "splitter/feeRcv ratio sanity upper bound").to.be.lte(200000n);
		console.log(`    [s6] splitter/feeReceiver ratio = ${Number(ratioScaled) / 10000} (expect ~9; pre-fix was ~0.02)`);

		// === Now call TaxSplitter.split() on real end-to-end tax revenue. ===
		const recipientPre = {
			platform: await ethers.provider.getBalance(platformReceiver),
			patron: await ethers.provider.getBalance(patron.address),
			agent: await ethers.provider.getBalance(addrs.agentSafe),
		};
		const splitterBalBeforeSplit = await ethers.provider.getBalance(addrs.taxSplitter);
		expect(splitterBalBeforeSplit).to.equal(splitterReceived); // started empty

		await (await taxSplitter.connect(bundleBot).split()).wait();

		const recipientPost = {
			platform: await ethers.provider.getBalance(platformReceiver),
			patron: await ethers.provider.getBalance(patron.address),
			agent: await ethers.provider.getBalance(addrs.agentSafe),
		};

		expectSplitShares(splitterBalBeforeSplit, recipientPre, recipientPost, [
			{ label: "platform", bps: 1000 },
			{ label: "patron", bps: 2500 },
			{ label: "agent", bps: 6500 },
		]);
		expect(await ethers.provider.getBalance(addrs.taxSplitter)).to.equal(0n);

		console.log(
			`    [s6] E2E split OK: total=${ethers.formatEther(splitterBalBeforeSplit)}BNB -> platform+${ethers.formatEther(recipientPost.platform - recipientPre.platform)} patron+${ethers.formatEther(recipientPost.patron - recipientPre.patron)} agent+${ethers.formatEther(recipientPost.agent - recipientPre.agent)}`,
		);
	});
});
