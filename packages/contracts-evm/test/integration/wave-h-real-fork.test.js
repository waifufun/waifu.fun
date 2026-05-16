// Wave H real-fork integration tests.
//
// Forks BSC mainnet at block 97368808 (validated fork pin from probe
// rounds — see ~/.moltbot/projects/waifu/specs/FLAP_BUNDLE_PROBE_FINDINGS.md).
// Spawns a real LaunchFactory pointing at the real Portal v5.14.1 and PCS V2
// addresses, then exercises the full bundle flow:
//   - createLaunch -> vault + router + treasuryLp deployed
//   - depositors fund vault
//   - close -> bundle bot triggers executeBundle
//   - Portal.newTokenV6 fires, V2 pair created, vault holds tokens
//   - depositors claim
//
// Only runs when FORK_BSC=true. Otherwise the suite is skipped so unit-test
// CI stays fast and self-contained.

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const FORK_ENABLED = process.env.FORK_BSC === "true";

// BSC mainnet address book (verified empirically — see WAVE_H_INTERFACES.md)
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
// CORRECTION 2026-05-13: newTokenV6 clones from 0x024f...6422 (TOKEN_TAXED_V3),
// NOT 0x29e6...332aA8 (which is TOKEN_TAXED V1, used by newTokenV2).
// V6/V7 probe got this right; the on-chain bytecode 'verification' on Wave H
// merge night was reading V2-launched tokens. See:
// ~/.moltbot/projects/waifu/specs/FLAP_BUNDLE_PROBE_FINDINGS.md (V6/V7 section).
const TOKEN_TAXED_V3_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const TIP_RECEIVER = "0x4848489f0b2BEdd788c696e2D79b6b69D7484848";

// EIP-1167 minimal proxy init code template:
// 0x3d602d80600a3d3981f3363d3d373d3d3d363d73<impl 20b>5af43d82803e903d91602b57fd5bf3
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

function mineVanitySalt(deployer, codeHash, creator, label) {
	// Mine a salt where predicted addr ends in 7777
	let rawSalt = ethers.keccak256(ethers.toUtf8Bytes(`wave-h-fork ${label} ${Date.now()} ${Math.random()}`));
	let salt = effectiveSalt(creator, rawSalt);
	let i = 0;
	while (!predictCreate2(deployer, salt, codeHash).toLowerCase().endsWith("7777")) {
		rawSalt = ethers.keccak256(rawSalt);
		salt = effectiveSalt(creator, rawSalt);
		i += 1;
		if (i > 500_000) {
			throw new Error("salt mining exceeded 500k iterations");
		}
	}
	return { rawSalt, salt, predicted: predictCreate2(deployer, salt, codeHash), iterations: i };
}

describe("Wave H real-fork integration", function () {
	if (!FORK_ENABLED) {
		it.skip("requires FORK_BSC=true", () => {});
		return;
	}

	// Mining vanity addresses takes time, plus newTokenV6 calls take a few seconds on fork
	this.timeout(180_000);

	let factory;
	let owner;
	let creator;
	let bundleBot;
	let depositor1;
	let depositor2;

	before(async () => {
		// Validate we are on the BSC fork at the expected pin
		const blockNumber = await ethers.provider.getBlockNumber();
		const chainId = (await ethers.provider.getNetwork()).chainId;
		console.log(`    [fork] chainId=${chainId} blockNumber=${blockNumber}`);
		expect(Number(chainId)).to.equal(56);

		[owner, creator, bundleBot, depositor1, depositor2] = await ethers.getSigners();

		// Deploy LaunchFactory pointing at real BSC infra
		const Factory = await ethers.getContractFactory("LaunchFactory");
		factory = await Factory.deploy(
			WBNB,
			PCS_FACTORY,
			PCS_ROUTER,
			initCodeHash(TOKEN_TAXED_V3_IMPL),
			PORTAL,
			TOKEN_TAXED_V3_IMPL,
			TIP_RECEIVER,
		);
		await factory.waitForDeployment();
		console.log(`    [fork] LaunchFactory deployed at ${await factory.getAddress()}`);
	});

	it("createLaunch deploys vault + router + treasuryLp, addresses recorded", async () => {
		// Mine a vanity salt for an address ending in 7777
		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, salt, predicted } = mineVanitySalt(PORTAL, codeHash, creator.address, "tier80-A");
		console.log(`    [salt] predicted=${predicted}`);

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;

		const config = {
			name: "Wave H Fork Test",
			symbol: "WHFT",
			metaCid: "QmTestPlaceholderCidForkA",
			creator: creator.address,
			bundleBot: bundleBot.address,
			commissionReceiver: owner.address,
			tier: 0, // TIER_80
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31_536_000, // 365 days
			antiFarmerDuration: 86_400, // 1 day (Portal min)
			closeTimestamp,
			vanitySalt: rawSalt,
			predictedTokenAddress: predicted,
		};

		const tx = await factory.connect(creator).createLaunch(config);
		const receipt = await tx.wait();

		expect(receipt.status).to.equal(1);

		// Recover the launch addresses
		const launches = await factory.launches(predicted);
		expect(launches.vault).to.not.equal(ethers.ZeroAddress);
		expect(launches.router).to.not.equal(ethers.ZeroAddress);
		expect(launches.treasuryLp).to.not.equal(ethers.ZeroAddress);
		expect(launches.predictedTokenAddress).to.equal(predicted);

		console.log(`    [deployed] vault=${launches.vault}`);
		console.log(`    [deployed] router=${launches.router}`);
		console.log(`    [deployed] treasuryLp=${launches.treasuryLp}`);

		// Salt is now used
		expect(await factory.usedSalts(salt)).to.equal(true);
		expect(await factory.launchCount()).to.equal(1n);
	});

	it("createLaunch reverts on duplicate salt", async () => {
		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, predicted } = mineVanitySalt(PORTAL, codeHash, creator.address, "tier80-B");

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const config = {
			name: "Wave H Fork Test B",
			symbol: "WHFTB",
			metaCid: "QmTestPlaceholderCidForkB",
			creator: creator.address,
			bundleBot: bundleBot.address,
			commissionReceiver: owner.address,
			tier: 0,
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31_536_000,
			antiFarmerDuration: 86_400,
			closeTimestamp,
			vanitySalt: rawSalt,
			predictedTokenAddress: predicted,
		};

		// First call succeeds
		await factory.connect(creator).createLaunch(config);
		// Second call with same salt reverts SaltAlreadyUsed
		await expect(factory.connect(creator).createLaunch(config)).to.be.reverted;
	});

	it("createLaunch reverts on predictedTokenAddress mismatch", async () => {
		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt } = mineVanitySalt(PORTAL, codeHash, creator.address, "tier80-C");

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const config = {
			name: "Wave H Fork Test C",
			symbol: "WHFTC",
			metaCid: "QmTestPlaceholderCidForkC",
			creator: creator.address,
			bundleBot: bundleBot.address,
			commissionReceiver: owner.address,
			tier: 0,
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31_536_000,
			antiFarmerDuration: 86_400,
			closeTimestamp,
			vanitySalt: rawSalt,
			// WRONG addr — factory should reject
			predictedTokenAddress: "0xdead000000000000000000000000000000007777",
		};

		await expect(factory.connect(creator).createLaunch(config)).to.be.reverted;
	});

	it("vault accepts deposits up to presaleCap (tier 80 = 16 BNB)", async () => {
		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, predicted } = mineVanitySalt(PORTAL, codeHash, creator.address, "tier80-D");

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;
		const config = {
			name: "Wave H Fork Test D",
			symbol: "WHFTD",
			metaCid: "QmTestPlaceholderCidForkD",
			creator: creator.address,
			bundleBot: bundleBot.address,
			commissionReceiver: owner.address,
			tier: 0,
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31_536_000,
			antiFarmerDuration: 86_400,
			closeTimestamp,
			vanitySalt: rawSalt,
			predictedTokenAddress: predicted,
		};

		await factory.connect(creator).createLaunch(config);

		const launches = await factory.launches(predicted);
		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = Vault.attach(launches.vault);

		// Deposit half from depositor1, half from depositor2
		await vault.connect(depositor1).deposit({ value: ethers.parseEther("8") });
		await vault.connect(depositor2).deposit({ value: ethers.parseEther("8") });

		expect(await vault.totalDeposited()).to.equal(ethers.parseEther("16"));
		expect(await vault.depositorCount()).to.equal(2n);

		// Cap reached — further deposit reverts
		await expect(vault.connect(depositor1).deposit({ value: ethers.parseEther("1") })).to.be.reverted;
	});

	// Live bundle execution against real Portal v5.14.1 at fork block 97368808.
	// Use a fresh signer index per test so Portal's 90s tx.origin cooldown
	// doesn't strand subsequent runs. Single-test-per-session by design.
	it("[live] executeBundle against real Portal — tier 80 full happy path", async function () {
		this.timeout(360_000); // up to 6 min budget (salt mining + real Portal calls)

		// Use signer[5] (fresh, not used in other tests) to dodge cooldown.
		const [, , , , , freshBot, freshDepositorA, freshDepositorB] = await ethers.getSigners();
		console.log(`    [live] bundleBot=${freshBot.address}`);
		console.log(`    [live] depositorA=${freshDepositorA.address}`);

		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, salt, predicted, iterations } = mineVanitySalt(
			PORTAL,
			codeHash,
			freshDepositorA.address,
			"live-bundle",
		);
		console.log(`    [live] mined salt in ${iterations} iters; predicted=${predicted}`);

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;

		const config = {
			name: "Wave H Live Test",
			symbol: "WHLIVE",
			metaCid: "QmLiveTestPlaceholderCid",
			creator: freshDepositorA.address,
			bundleBot: freshBot.address,
			commissionReceiver: owner.address,
			tier: 0, // TIER_80
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31_536_000,
			antiFarmerDuration: 86_400,
			closeTimestamp,
			vanitySalt: rawSalt,
			predictedTokenAddress: predicted,
		};

		// Step 1: createLaunch deploys vault + router + treasuryLp
		const createTx = await factory.connect(freshDepositorA).createLaunch(config);
		const createReceipt = await createTx.wait();
		console.log(`    [live] createLaunch gas: ${createReceipt.gasUsed}`);

		const launchAddrs = await factory.launches(predicted);
		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = Vault.attach(launchAddrs.vault);
		const Router = await ethers.getContractFactory("BundleRouter");
		const router = Router.attach(launchAddrs.router);

		console.log(`    [live] vault=${launchAddrs.vault} router=${launchAddrs.router}`);

		// Step 2: depositors fund vault to fill tier-80 cap (16 BNB total)
		await vault.connect(freshDepositorA).deposit({ value: ethers.parseEther("10") });
		await vault.connect(freshDepositorB).deposit({ value: ethers.parseEther("6") });
		const totalDeposited = await vault.totalDeposited();
		expect(totalDeposited).to.equal(ethers.parseEther("16"));
		console.log(`    [live] vault funded: ${ethers.formatEther(totalDeposited)} BNB`);

		// Step 3: close the presale (cap hit, anyone can call)
		const closeTx = await vault.connect(freshBot).close();
		await closeTx.wait();
		console.log("    [live] vault closed");

		// Step 4: bundleBot triggers executeBundle. Builder tips are disabled
		// in this contract version and must be funded outside the vault flow.
		const execParams = {
			vanitySalt: salt,
			name: config.name,
			symbol: config.symbol,
			meta: config.metaCid,
			buyTaxBps: config.buyTaxBps,
			sellTaxBps: config.sellTaxBps,
			taxDuration: config.taxDuration,
			antiFarmerDuration: config.antiFarmerDuration,
			commissionReceiver: config.commissionReceiver,
			minV2TokensOut: 0,
			tipBnb: 0,
			deadline: closeTimestamp + 1800,
		};

		const beforeBalance = await ethers.provider.getBalance(launchAddrs.vault);
		console.log(`    [live] vault BNB before bundle: ${ethers.formatEther(beforeBalance)}`);

		const execTx = await router.connect(freshBot).executeBundle(execParams);
		const execReceipt = await execTx.wait();
		console.log(`    [live] executeBundle gas: ${execReceipt.gasUsed}`);
		console.log(`    [live] executeBundle status: ${execReceipt.status}`);

		expect(execReceipt.status).to.equal(1);

		// Step 5: Verify chain state
		// Token must exist at predicted address
		const tokenCode = await ethers.provider.getCode(predicted);
		expect(tokenCode.length).to.be.greaterThan(2);
		console.log(`    [live] token deployed at ${predicted}, code length: ${(tokenCode.length - 2) / 2}b`);

		// Tier 80 (16 BNB quoteAmt, no V2 buy): token stays in curve-only state,
		// no V2 pair created. Tier 90/95/98 would have the pair.
		const PCSFactoryAbi = ["function getPair(address, address) view returns (address)"];
		const pcsFactory = new ethers.Contract(PCS_FACTORY, PCSFactoryAbi, ethers.provider);
		const pair = await pcsFactory.getPair(predicted, WBNB);
		if (pair === ethers.ZeroAddress) {
			console.log("    [live] no V2 pair (tier 80 = curve-only, status=Tradable)");
		} else {
			console.log(`    [live] PCS V2 pair created at ${pair}`);
		}

		// Vault should be in LAUNCHED state and hold ~40% of total Y
		const vaultState = await vault.state();
		expect(vaultState).to.equal(2); // State.LAUNCHED

		const tokenAbi = [
			"function balanceOf(address) view returns (uint256)",
			"function totalSupply() view returns (uint256)",
		];
		const token = new ethers.Contract(predicted, tokenAbi, ethers.provider);
		const totalSupply = await token.totalSupply();
		const vaultTokenBalance = await token.balanceOf(launchAddrs.vault);
		const treasuryTokenBalance = await token.balanceOf(launchAddrs.treasuryLp);
		const deadBalance = await token.balanceOf("0x000000000000000000000000000000000000dEaD");

		console.log(`    [live] token total supply: ${ethers.formatUnits(totalSupply, 18)}`);
		console.log(
			`    [live] vault token balance: ${ethers.formatUnits(vaultTokenBalance, 18)} (~40% of router post-curve)`,
		);
		console.log(`    [live] treasury token balance: ${ethers.formatUnits(treasuryTokenBalance, 18)} (~10%)`);
		console.log(`    [live] burned: ${ethers.formatUnits(deadBalance, 18)} (~50%)`);

		// All splits non-zero
		expect(vaultTokenBalance).to.be.greaterThan(0n);
		expect(treasuryTokenBalance).to.be.greaterThan(0n);
		expect(deadBalance).to.be.greaterThan(0n);

		// Step 6: depositor claims tokens
		const depositorClaimBefore = await token.balanceOf(freshDepositorA.address);
		const claimTx = await vault.connect(freshDepositorA).claim();
		const claimReceipt = await claimTx.wait();
		const depositorClaimAfter = await token.balanceOf(freshDepositorA.address);
		const claimed = depositorClaimAfter - depositorClaimBefore;
		console.log(
			`    [live] depositorA claimed: ${ethers.formatUnits(claimed, 18)} tokens (gas: ${claimReceipt.gasUsed})`,
		);
		expect(claimed).to.be.greaterThan(0n);

		// Summary report
		console.log("\n    ====== Wave H Live Bundle Test Summary ======");
		console.log(`    createLaunch gas:   ${createReceipt.gasUsed}`);
		console.log(`    executeBundle gas:  ${execReceipt.gasUsed}`);
		console.log(`    claim gas:          ${claimReceipt.gasUsed}`);
		console.log(`    Token address:      ${predicted}`);
		console.log(`    V2 pair:            ${pair}`);
		console.log(`    Total supply:       ${ethers.formatUnits(totalSupply, 18)}`);
		console.log(`    50% burn:           ${ethers.formatUnits(deadBalance, 18)}`);
		console.log(`    10% treasury:       ${ethers.formatUnits(treasuryTokenBalance, 18)}`);
		console.log(`    40% vault:          ${ethers.formatUnits(vaultTokenBalance, 18)}`);
		console.log("    =============================================\n");
	});

	// ----------------------------------------------------------------
	// Tier 90 / 95 / 98 — graduating tiers with V2 follow-up buy
	// ----------------------------------------------------------------
	//
	// Each test mints a fresh launch with quoteAmt=20 BNB (Portal graduation
	// threshold) plus tier-specific v2BuyBnb. Signers rotated per test to dodge
	// Portal's 90s tx.origin cooldown — bundleBot is tx.origin for the
	// router -> Portal.newTokenV6 call.
	//
	// Tier 90: presaleCap=32, quoteAmt=20, v2BuyBnb=12  -> signers 8/9/10
	// Tier 95: presaleCap=64, quoteAmt=20, v2BuyBnb=44  -> signers 11/12/13
	// Tier 98: presaleCap=160, quoteAmt=20, v2BuyBnb=140 -> signers 14/15/16

	async function runGraduatingTierBundle({ tierEnum, tierLabel, presaleCapBnb, v2BuyBnb, signerOffset }) {
		const signers = await ethers.getSigners();
		const freshBot = signers[signerOffset];
		const freshDepositorA = signers[signerOffset + 1];
		const freshDepositorB = signers[signerOffset + 2];
		console.log(`    [live ${tierLabel}] bundleBot=${freshBot.address}`);
		console.log(`    [live ${tierLabel}] depositorA=${freshDepositorA.address}`);
		console.log(`    [live ${tierLabel}] depositorB=${freshDepositorB.address}`);

		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, salt, predicted, iterations } = mineVanitySalt(
			PORTAL,
			codeHash,
			freshDepositorA.address,
			`live-${tierLabel}`,
		);
		console.log(`    [live ${tierLabel}] mined salt in ${iterations} iters; predicted=${predicted}`);

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;

		const config = {
			name: `Wave H Live ${tierLabel}`,
			symbol: `WHL${tierLabel}`,
			metaCid: `QmLiveTestCid${tierLabel}`,
			creator: freshDepositorA.address,
			bundleBot: freshBot.address,
			commissionReceiver: owner.address,
			tier: tierEnum,
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31_536_000,
			antiFarmerDuration: 86_400,
			closeTimestamp,
			vanitySalt: rawSalt,
			predictedTokenAddress: predicted,
		};

		// 1. createLaunch
		const createTx = await factory.connect(freshDepositorA).createLaunch(config);
		const createReceipt = await createTx.wait();
		console.log(`    [live ${tierLabel}] createLaunch gas: ${createReceipt.gasUsed}`);

		const launchAddrs = await factory.launches(predicted);
		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = Vault.attach(launchAddrs.vault);
		const Router = await ethers.getContractFactory("BundleRouter");
		const router = Router.attach(launchAddrs.router);
		console.log(`    [live ${tierLabel}] vault=${launchAddrs.vault} router=${launchAddrs.router}`);

		// 2. fill presaleCap exactly. depositorA puts in 60%, depositorB the rest.
		const capWei = ethers.parseEther(String(presaleCapBnb));
		const depositA = (capWei * 60n) / 100n;
		const depositB = capWei - depositA;
		await vault.connect(freshDepositorA).deposit({ value: depositA });
		await vault.connect(freshDepositorB).deposit({ value: depositB });
		expect(await vault.totalDeposited()).to.equal(capWei);
		console.log(`    [live ${tierLabel}] vault funded: ${ethers.formatEther(capWei)} BNB`);

		// 3. close
		const closeTx = await vault.connect(freshBot).close();
		await closeTx.wait();
		console.log(`    [live ${tierLabel}] vault closed`);

		// 4. executeBundle
		const execParams = {
			vanitySalt: salt,
			name: config.name,
			symbol: config.symbol,
			meta: config.metaCid,
			buyTaxBps: config.buyTaxBps,
			sellTaxBps: config.sellTaxBps,
			taxDuration: config.taxDuration,
			antiFarmerDuration: config.antiFarmerDuration,
			commissionReceiver: config.commissionReceiver,
			minV2TokensOut: 0,
			tipBnb: 0,
			deadline: closeTimestamp + 1800,
		};

		const execTx = await router.connect(freshBot).executeBundle(execParams);
		const execReceipt = await execTx.wait();
		console.log(`    [live ${tierLabel}] executeBundle gas: ${execReceipt.gasUsed}`);
		expect(execReceipt.status).to.equal(1);

		// 5. token must exist at predicted address
		const tokenCode = await ethers.provider.getCode(predicted);
		expect(tokenCode.length).to.be.greaterThan(2);

		// 6. PCS V2 pair MUST exist for graduating tiers (quoteAmt=20 BNB triggers it)
		const PCSFactoryAbi = ["function getPair(address, address) view returns (address)"];
		const pcsFactory = new ethers.Contract(PCS_FACTORY, PCSFactoryAbi, ethers.provider);
		const pair = await pcsFactory.getPair(predicted, WBNB);
		expect(pair).to.not.equal(ethers.ZeroAddress);
		console.log(`    [live ${tierLabel}] PCS V2 pair created at ${pair}`);

		// V2 pair must have non-zero reserves of both sides
		const pairAbi = [
			"function getReserves() view returns (uint112, uint112, uint32)",
			"function token0() view returns (address)",
			"function token1() view returns (address)",
		];
		const pairContract = new ethers.Contract(pair, pairAbi, ethers.provider);
		const [reserve0, reserve1] = await pairContract.getReserves();
		const token0 = await pairContract.token0();
		const tokenIsToken0 = token0.toLowerCase() === predicted.toLowerCase();
		const pairBnbReserve = tokenIsToken0 ? reserve1 : reserve0;
		const pairTokenReserve = tokenIsToken0 ? reserve0 : reserve1;
		expect(pairBnbReserve).to.be.greaterThan(0n);
		expect(pairTokenReserve).to.be.greaterThan(0n);
		console.log(
			`    [live ${tierLabel}] V2 reserves: ${ethers.formatEther(pairBnbReserve)} BNB / ${ethers.formatUnits(pairTokenReserve, 18)} token`,
		);

		// 7. vault in LAUNCHED state, token splits non-zero
		expect(await vault.state()).to.equal(2);

		const tokenAbi = [
			"function balanceOf(address) view returns (uint256)",
			"function totalSupply() view returns (uint256)",
		];
		const token = new ethers.Contract(predicted, tokenAbi, ethers.provider);
		const totalSupply = await token.totalSupply();
		const vaultTokenBalance = await token.balanceOf(launchAddrs.vault);
		const treasuryTokenBalance = await token.balanceOf(launchAddrs.treasuryLp);
		const deadBalance = await token.balanceOf("0x000000000000000000000000000000000000dEaD");

		expect(vaultTokenBalance).to.be.greaterThan(0n);
		expect(treasuryTokenBalance).to.be.greaterThan(0n);
		expect(deadBalance).to.be.greaterThan(0n);

		// 8. depositorA claims
		const depositorClaimBefore = await token.balanceOf(freshDepositorA.address);
		const claimTx = await vault.connect(freshDepositorA).claim();
		const claimReceipt = await claimTx.wait();
		const depositorClaimAfter = await token.balanceOf(freshDepositorA.address);
		const claimed = depositorClaimAfter - depositorClaimBefore;
		expect(claimed).to.be.greaterThan(0n);

		console.log(`\n    ====== Wave H Live ${tierLabel} Summary ======`);
		console.log(`    presaleCap:         ${presaleCapBnb} BNB (quoteAmt=20, v2BuyBnb=${v2BuyBnb})`);
		console.log(`    createLaunch gas:   ${createReceipt.gasUsed}`);
		console.log(`    executeBundle gas:  ${execReceipt.gasUsed}`);
		console.log(`    claim gas:          ${claimReceipt.gasUsed}`);
		console.log(`    Token address:      ${predicted}`);
		console.log(`    V2 pair:            ${pair}`);
		console.log(
			`    V2 reserves:        ${ethers.formatEther(pairBnbReserve)} BNB / ${ethers.formatUnits(pairTokenReserve, 18)} token`,
		);
		console.log(`    Total supply:       ${ethers.formatUnits(totalSupply, 18)}`);
		console.log(`    50% burn:           ${ethers.formatUnits(deadBalance, 18)}`);
		console.log(`    10% treasury:       ${ethers.formatUnits(treasuryTokenBalance, 18)}`);
		console.log(`    40% vault:          ${ethers.formatUnits(vaultTokenBalance, 18)}`);
		console.log(`    depositorA claimed: ${ethers.formatUnits(claimed, 18)}`);
		console.log("    =============================================\n");
	}

	it("[live] executeBundle against real Portal — tier 90 full graduation", async function () {
		this.timeout(360_000);
		await runGraduatingTierBundle({
			tierEnum: 1, // TIER_90
			tierLabel: "T90",
			presaleCapBnb: 32,
			v2BuyBnb: 12,
			signerOffset: 8,
		});
	});

	it("[live] executeBundle against real Portal — tier 95 full graduation", async function () {
		this.timeout(360_000);
		await runGraduatingTierBundle({
			tierEnum: 2, // TIER_95
			tierLabel: "T95",
			presaleCapBnb: 64,
			v2BuyBnb: 44,
			signerOffset: 11,
		});
	});

	it("[live] executeBundle against real Portal — tier 98 full graduation", async function () {
		this.timeout(360_000);
		await runGraduatingTierBundle({
			tierEnum: 3, // TIER_98
			tierLabel: "T98",
			presaleCapBnb: 160,
			v2BuyBnb: 140,
			signerOffset: 14,
		});
	});
});
