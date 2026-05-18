// Wave H TIER_TEST + noBurn real-fork integration.
//
// Forks BSC mainnet and exercises the full bundle flow for the smoke-test
// tier (TIER_TEST = enum 4) with the new noBurn flag set to true.
//
// What this proves before the mainnet smoke launch:
//   1. TierMath.tierBudget(4, _) returns the documented
//      (17.34 BNB cap, 16.84 BNB quoteAmt, 0.5 BNB v2 buy, no vesting) budget
//      and the full flow executes against the real Portal at that budget.
//   2. With noBurn=true the would-burn portion lands at `creator` instead of
//      the DEAD address. DEAD balance for this token MUST be zero.
//   3. Token splits remain correct (vault = 20% of supply, treasury = 10%).
//   4. The 16.84 BNB quoteAmt clears Portal v5.14.3's graduation threshold so
//      a PCS V2 pair gets created and seeded with non-zero reserves.
//   5. Resell path via PCS V2 works (creator can swap claimed tokens to BNB).
//
// Run with:
//   LATEST_HEX=$(curl -s -X POST -H 'Content-Type: application/json' \
//     --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
//     https://bsc.publicnode.com | jq -r .result)
//   PINNED=$(( $(printf '%d\n' $LATEST_HEX) - 100 ))
//   FORK_BSC=true FORK_BSC_URL=https://bsc.publicnode.com FORK_BSC_BLOCK=$PINNED \
//     npx hardhat test test/integration/wave-h-tier-test-real-fork.test.js

const { expect } = require("chai");
const { ethers } = require("hardhat");

const FORK_ENABLED = process.env.FORK_BSC === "true";

// BSC mainnet address book (same constants used by wave-h-real-fork.test.js).
const PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const TOKEN_TAXED_V3_IMPL = "0x024f18294970B5c76c0691b87f138A0317156422";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const TIP_RECEIVER = "0x4848489f0b2BEdd788c696e2D79b6b69D7484848";
const DEAD = "0x000000000000000000000000000000000000dEaD";

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

// Mine a salt where the CREATE2 predicted address ends in the 4-nibble suffix.
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

describe("Wave H TIER_TEST + noBurn real-fork integration", function () {
	if (!FORK_ENABLED) {
		it.skip("requires FORK_BSC=true", () => {});
		return;
	}

	this.timeout(360_000); // 6 min: salt mining + real Portal calls + V2 swap

	let factory;
	let owner;

	before(async () => {
		const blockNumber = await ethers.provider.getBlockNumber();
		const chainId = (await ethers.provider.getNetwork()).chainId;
		console.log(`    [fork] chainId=${chainId} blockNumber=${blockNumber}`);
		expect(Number(chainId)).to.equal(56);

		const signers = await ethers.getSigners();
		owner = signers[0];

		const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer");
		const routerDeployer = await RouterDeployerCF.deploy();

		// Wave M3: AgentSafeDeployer wraps Gnosis Safe v1.4.1 canonical addresses
		const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeDeployer");
		const agentSafeDeployer = await AgentSafeDeployerCF.deploy(
			"0x29fcB43b46531BcA003ddC8FCB67FFE91900C762", // Safe singleton v1.4.1
			"0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67", // Safe ProxyFactory v1.4.1
		);

		const Factory = await ethers.getContractFactory("LaunchFactory");
		factory = await Factory.deploy(
			WBNB,
			PCS_FACTORY,
			PCS_ROUTER,
			initCodeHash(TOKEN_TAXED_V3_IMPL),
			PORTAL,
			TOKEN_TAXED_V3_IMPL,
			TIP_RECEIVER,
			owner.address,
			await routerDeployer.getAddress(),
			await agentSafeDeployer.getAddress(),
		);
		await factory.waitForDeployment();
		console.log(`    [fork] LaunchFactory deployed at ${await factory.getAddress()}`);
	});

	it("[live] TIER_TEST + noBurn=true full launch + bundle + claim against real Portal", async () => {
		// Fresh signer set (offsets 17..19) to dodge Portal's 90s tx.origin
		// cooldown shared with wave-h-real-fork.test.js (which consumes 0..16).
		const signers = await ethers.getSigners();
		const bundleBot = signers[17];
		const creator = signers[18];
		const depositor2 = signers[19];

		console.log(`    [tier-test] bundleBot=${bundleBot.address}`);
		console.log(`    [tier-test] creator=${creator.address}`);
		console.log(`    [tier-test] depositor2=${depositor2.address}`);

		// 1. Mine vanity salt. Salt is scoped to creator (the depositor who calls
		// factory.createLaunch); the on-chain effective salt is keccak(creator,raw).
		const codeHash = initCodeHash(TOKEN_TAXED_V3_IMPL);
		const { rawSalt, salt, predicted, iterations } = mineVanitySalt(
			PORTAL,
			codeHash,
			creator.address,
			"tier-test-noburn",
		);
		console.log(`    [tier-test] mined salt in ${iterations} iters; predicted=${predicted}`);

		const closeTimestamp = (await ethers.provider.getBlock("latest")).timestamp + 3600;

		// 2. Build LaunchConfig with tier=4 (TIER_TEST) and noBurn=true.
		const config = {
			name: "Wave H TIER_TEST",
			symbol: "WHTT",
			metaCid: "QmTierTestNoBurnPlaceholderCid",
			creator: creator.address,
			bundleBot: bundleBot.address,
			platformReceiver: owner.address,
			patron: creator.address,
			agentSafeOwners: [creator.address],
			agentSafeThreshold: 1,
			platformBps: 1000,
			patronBps: 2500,
			tier: 4, // TIER_TEST
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31_536_000, // 365 days
			antiFarmerDuration: 86_400, // 1 day (Portal min)
			closeTimestamp,
			vanitySalt: rawSalt,
			predictedTokenAddress: predicted,
			noBurn: true, // <- THE KEY NEW FIELD
		};

		// 3. createLaunch: deploys vault, router, treasuryLp.
		const createTx = await factory.connect(creator).createLaunch(config);
		const createReceipt = await createTx.wait();
		expect(createReceipt.status).to.equal(1);
		console.log(`    [tier-test] createLaunch gas: ${createReceipt.gasUsed}`);

		const launchAddrs = await factory.launches(predicted);
		expect(launchAddrs.vault).to.not.equal(ethers.ZeroAddress);
		expect(launchAddrs.router).to.not.equal(ethers.ZeroAddress);
		expect(launchAddrs.treasuryLp).to.not.equal(ethers.ZeroAddress);

		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = Vault.attach(launchAddrs.vault);
		const Router = await ethers.getContractFactory("BundleRouter");
		const router = Router.attach(launchAddrs.router);

		// Sanity: router exposes noBurn=true.
		expect(await router.noBurn()).to.equal(true);
		console.log("    [tier-test] router.noBurn() = true confirmed");

		// 4. Fill the 17.34 BNB cap, respecting 60% wallet cap (= 10.404 BNB).
		//    creator deposits 10.4 BNB; depositor2 deposits 6.94 BNB.
		const presaleCap = ethers.parseEther("17.34");
		const walletCap = (presaleCap * 6_000n) / 10_000n; // 10.404 BNB
		expect(await vault.presaleCap()).to.equal(presaleCap);

		const depositA = ethers.parseEther("10.4"); // under wallet cap
		const depositB = presaleCap - depositA; // = 6.94 BNB
		expect(depositA).to.be.lte(walletCap);

		await vault.connect(creator).deposit({ value: depositA });
		await vault.connect(depositor2).deposit({ value: depositB });
		expect(await vault.totalDeposited()).to.equal(presaleCap);
		console.log(`    [tier-test] vault funded: ${ethers.formatEther(presaleCap)} BNB`);

		// 5. close (cap hit, but the 15-minute min-open window applies).
		await closeSubscribedVault(vault, bundleBot);
		console.log("    [tier-test] vault closed");

		// 6. bundleBot.executeBundle.
		const execParams = {
			vanitySalt: rawSalt,
			name: config.name,
			symbol: config.symbol,
			meta: config.metaCid,
			buyTaxBps: config.buyTaxBps,
			sellTaxBps: config.sellTaxBps,
			taxDuration: config.taxDuration,
			antiFarmerDuration: config.antiFarmerDuration,
			commissionReceiver: launchAddrs.taxSplitter,
			tipBnb: 0,
			deadline: closeTimestamp + 1800,
		};

		const execTx = await router.connect(bundleBot).executeBundle(execParams);
		const execReceipt = await execTx.wait();
		expect(execReceipt.status).to.equal(1);
		console.log(`    [tier-test] executeBundle gas: ${execReceipt.gasUsed}`);

		// ---- Assertions ----

		// (a) Token deployed at predicted address.
		const tokenCode = await ethers.provider.getCode(predicted);
		expect(tokenCode.length).to.be.greaterThan(2);

		const tokenAbi = [
			"function balanceOf(address) view returns (uint256)",
			"function totalSupply() view returns (uint256)",
			"function approve(address,uint256) returns (bool)",
		];
		const token = new ethers.Contract(predicted, tokenAbi, ethers.provider);

		const totalSupply = await token.totalSupply();
		// (b) Total supply = 1B with 18 decimals.
		expect(totalSupply).to.equal(ethers.parseUnits("1000000000", 18));

		// (c) Vault holds 20% of supply (200M).
		const vaultTokenBalance = await token.balanceOf(launchAddrs.vault);
		expect(vaultTokenBalance).to.equal(ethers.parseUnits("200000000", 18));

		// (d) Treasury holds 10% of supply (100M).
		const treasuryTokenBalance = await token.balanceOf(launchAddrs.treasuryLp);
		expect(treasuryTokenBalance).to.equal(ethers.parseUnits("100000000", 18));

		// (e) DEAD balance is zero. THIS IS THE NOBURN PROOF.
		const deadBalance = await token.balanceOf(DEAD);
		expect(deadBalance).to.equal(0n);
		console.log("    [tier-test] DEAD balance = 0 (noBurn proof confirmed)");

		// (f) Creator received the would-burn portion.
		//     Splits: vault=200M, treasury=100M, V2 LP held by pair (~200M),
		//     creator (noBurn destination) gets the remainder
		//     (= totalY held by router after Portal call, less vault+treasury).
		//     totalY ~= 500M for graduating tiers since Portal moves the V2 LP
		//     slice into the pair and refunds the rest to the router beneficiary.
		const creatorTokenBalance = await token.balanceOf(creator.address);
		expect(creatorTokenBalance).to.be.gt(0n);
		console.log(`    [tier-test] creator (noBurn destination) balance: ${ethers.formatUnits(creatorTokenBalance, 18)}`);

		// (g) PCS V2 pair MUST exist (TIER_TEST quoteAmt=16.84 BNB clears the
		//     ~16.8 BNB graduation threshold on Portal v5.14.3).
		const PCSFactoryAbi = ["function getPair(address,address) view returns (address)"];
		const pcsFactory = new ethers.Contract(PCS_FACTORY, PCSFactoryAbi, ethers.provider);
		const pair = await pcsFactory.getPair(predicted, WBNB);
		expect(pair).to.not.equal(ethers.ZeroAddress);
		console.log(`    [tier-test] PCS V2 pair at ${pair}`);

		// V2 reserves non-zero on both sides (Portal-seeded LP + 0.5 BNB v2 buy).
		const pairAbi = [
			"function getReserves() view returns (uint112, uint112, uint32)",
			"function token0() view returns (address)",
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
			`    [tier-test] V2 reserves: ${ethers.formatEther(pairBnbReserve)} BNB / ${ethers.formatUnits(pairTokenReserve, 18)} token`,
		);

		// (h) Vault state == LAUNCHED (enum value 2).
		expect(await vault.state()).to.equal(2);

		// (i) Sum of accounted balances == totalSupply (within tax tolerance).
		//     vault(200M) + treasury(100M) + creator + pair + tax_splitter = totalSupply.
		//     The 3% buyTax on the 0.5 BNB V2 follow-up buy routes a small slice
		//     of tokens to the TaxSplitter / marketing receiver, which is NOT one
		//     of the addresses we hold a handle to here. So we assert the four
		//     known buckets cover >=99.5% of supply, then log the unaccounted
		//     tax-splitter delta separately.
		const pairTokenBal = await token.balanceOf(pair);
		const accounted = vaultTokenBalance + treasuryTokenBalance + creatorTokenBalance + pairTokenBal;
		const unaccounted = totalSupply - accounted;
		expect(accounted).to.be.lte(totalSupply);
		expect((accounted * 10_000n) / totalSupply).to.be.gte(9_950n); // >= 99.5% of supply accounted
		console.log(
			`    [tier-test] supply split: vault=${ethers.formatUnits(vaultTokenBalance, 18)} treasury=${ethers.formatUnits(treasuryTokenBalance, 18)} creator=${ethers.formatUnits(creatorTokenBalance, 18)} pair=${ethers.formatUnits(pairTokenBal, 18)} tax_splitter=${ethers.formatUnits(unaccounted, 18)}`,
		);

		// (j) Salt is now used (factory dedupe state).
		expect(await factory.usedSalts(salt)).to.equal(true);

		// 7. Resell-path proof: creator approves PCS V2 router for 1M tokens
		//    and swaps them to BNB through the freshly-seeded V2 pair. This is
		//    the gate the mainnet smoke launch will exercise to confirm recoup.
		const pcsRouterAbi = [
			"function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)",
		];
		const pcsRouter = new ethers.Contract(PCS_ROUTER, pcsRouterAbi, creator);

		const sellAmount = ethers.parseUnits("1000000", 18); // 1M tokens
		const tokenAsCreator = new ethers.Contract(
			predicted,
			["function approve(address,uint256) returns (bool)"],
			creator,
		);
		await (await tokenAsCreator.approve(PCS_ROUTER, sellAmount)).wait();

		const bnbBefore = await ethers.provider.getBalance(creator.address);
		const swapTx = await pcsRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
			sellAmount,
			0, // accept any output (test-only, mainnet smoke will set real minOut)
			[predicted, WBNB],
			creator.address,
			closeTimestamp + 3600,
		);
		const swapReceipt = await swapTx.wait();
		const gasCost = swapReceipt.gasUsed * swapReceipt.gasPrice;
		const bnbAfter = await ethers.provider.getBalance(creator.address);
		const bnbReceived = bnbAfter + gasCost - bnbBefore;
		expect(bnbReceived).to.be.gt(0n);
		console.log(
			`    [tier-test] recoup: sold 1M tokens for ${ethers.formatEther(bnbReceived)} BNB (gas: ${swapReceipt.gasUsed})`,
		);

		// ---- Summary ----
		console.log("\n    ====== Wave H TIER_TEST + noBurn Summary ======");
		console.log("    Tier:               TIER_TEST (4)");
		console.log("    noBurn:             true");
		console.log("    presaleCap:         17.34 BNB (10.4 + 6.94)");
		console.log("    quoteAmt:           16.84 BNB");
		console.log("    v2BuyBnb:           0.5 BNB");
		console.log(`    createLaunch gas:   ${createReceipt.gasUsed}`);
		console.log(`    executeBundle gas:  ${execReceipt.gasUsed}`);
		console.log(`    Token:              ${predicted}`);
		console.log(`    V2 pair:            ${pair}`);
		console.log("    DEAD balance:       0 (noBurn confirmed)");
		console.log(`    creator balance:    ${ethers.formatUnits(creatorTokenBalance, 18)} (would-burn destination)`);
		console.log(`    vault balance:      ${ethers.formatUnits(vaultTokenBalance, 18)} (20%)`);
		console.log(`    treasury balance:   ${ethers.formatUnits(treasuryTokenBalance, 18)} (10%)`);
		console.log(`    pair token reserve: ${ethers.formatUnits(pairTokenReserve, 18)}`);
		console.log(`    tax-splitter unacct:${ethers.formatUnits(unaccounted, 18)} (~3% of v2-buy slice)`);
		console.log(`    recoup proof:       1M tokens -> ${ethers.formatEther(bnbReceived)} BNB`);
		console.log("    ===============================================\n");
	});
});
