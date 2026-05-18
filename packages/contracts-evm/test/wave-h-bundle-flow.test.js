const { expect } = require("chai");
const { ethers } = require("hardhat");

// Wave H phase 2B — full bundle flow tests.
//
// Architecture under test:
//   user --deposit--> LaunchVault
//   bundleBot --executeBundle--> BundleRouter
//     -> vault.pullBnbForLaunch(needed)         (CLOSED -> LAUNCHED)
//     -> portal.newTokenV6{value: quoteAmt}     (CREATE2 deploys token)
//     -> pcsRouter.swapExactETHForTokens (if v2BuyBnb > 0)
//     -> token.transfer(DEAD, 50%)
//     -> token.transfer(treasuryLp, 10%)
//     -> token.transfer(vault, ~40%)
//     -> vault.distribute(token, vaultAmt)
//     -> explicit zero-tip check (builder tips are outside vault funding in this version)
//   depositors --claim--> tokens
//
// All wired up by LaunchFactory.createLaunch. Mocks substitute Portal +
// PancakeSwap V2; real Flap contract behavior is covered by fork tests
// (phase 2C).
describe("Wave H bundle flow e2e", () => {
	const DEAD = "0x000000000000000000000000000000000000dEaD";
	const TIER_80 = 0;
	const TIER_90 = 1;
	const TIER_95 = 2;
	const TIER_98 = 3;
	const TIER_TEST = 4;

	const PRESALE_CAPS = {
		[TIER_80]: ethers.parseEther("16"),
		[TIER_90]: ethers.parseEther("32"),
		[TIER_95]: ethers.parseEther("64"),
		[TIER_98]: ethers.parseEther("160"),
		[TIER_TEST]: ethers.parseEther("17.34"),
	};
	// Real tier math (per LaunchFactory.tierBudget + TierMath.calibratedQuoteAmt):
	// - quoteAmt = 16 BNB for TIER_80 (curve only, no graduation).
	// - For graduating tiers, quoteAmt = ceil(16e18 * (10000 + 100) / (10000 - 100 - buyTaxBps))
	//   where the FLAP 1% fee + buyTax are deducted before the curve sees the BNB.
	//   At default buyTaxBps=300, quoteAmt = ceil(16e18 * 10100 / 9600) =
	//   16833333333333333334 wei = ~16.833 BNB.
	// - v2BuyBnb = presaleCap - quoteAmt (leftover BNB swapped through V2).
	const QUOTE_AMT_TAX300 = 16833333333333333334n;
	const V2_BUY_BNB = {
		[TIER_80]: 0n,
		[TIER_90]: ethers.parseEther("32") - QUOTE_AMT_TAX300,
		[TIER_95]: ethers.parseEther("64") - QUOTE_AMT_TAX300,
		[TIER_98]: ethers.parseEther("160") - QUOTE_AMT_TAX300,
		[TIER_TEST]: ethers.parseEther("0.5"),
	};

	function computeInitCodeHash(creationCode, name, symbol) {
		const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["string", "string"], [name, symbol]);
		const initCode = ethers.concat([creationCode, encoded]);
		return ethers.keccak256(initCode);
	}

	function computeCreate2Addr(deployer, salt, initCodeHash) {
		return ethers.getCreate2Address(deployer, salt, initCodeHash);
	}

	function effectiveSalt(creator, vanitySalt) {
		return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [creator, vanitySalt]));
	}

	async function deployStack() {
		const [owner, creator, bundleBot, tipReceiver, alice, bob, carol] = await ethers.getSigners();

		// Mocks
		const PCSFactory = await ethers.getContractFactory("MockBundlePCSFactory");
		const pcsFactory = await PCSFactory.deploy();

		const PCSRouter = await ethers.getContractFactory("MockSimplePCSRouter");
		const pcsRouter = await PCSRouter.deploy();
		await pcsRouter.setRate(ethers.parseEther("1000000")); // legacy rate fallback; AMM mode is set automatically when portal creates the pair

		const wbnb = "0x0000000000000000000000000000000000000B0B";

		const Portal = await ethers.getContractFactory("MockFlapPortalCREATE2");
		const portal = await Portal.deploy(await pcsFactory.getAddress(), wbnb);
		await portal.setPCSRouter(await pcsRouter.getAddress());

		// Pre-compute initCodeHash for default test name/symbol.
		const TokenArtifact = await ethers.getContractFactory("BundleFlowToken");
		const name = "FlowToken";
		const symbol = "FLOW";
		const initCodeHash = computeInitCodeHash(TokenArtifact.bytecode, name, symbol);

		// Factory with portal as the "FLAP_PORTAL" immutable.
		const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer");

		const routerDeployer = await RouterDeployerCF.deploy();

		const TreasuryDeployerCF = await ethers.getContractFactory("TreasuryLP4Deployer");
		const treasuryLp4Deployer = await TreasuryDeployerCF.deploy();
		const V3FactoryCF = await ethers.getContractFactory("MockV3Factory");
		const mockV3Factory = await V3FactoryCF.deploy();
		const WbnbMockCF = await ethers.getContractFactory("MockWBNB");
		const mockWbnbForN = await WbnbMockCF.deploy();
		const NPMCF = await ethers.getContractFactory("MockNonfungiblePositionManager");
		const mockNpm = await NPMCF.deploy(await mockWbnbForN.getAddress());
		const FeedCF = await ethers.getContractFactory("MockBnbUsdFeed");
		const mockFeed = await FeedCF.deploy(600n * 100000000n);

		// Wave M3: AgentSafeDeployer + Safe v1.4.1 mocks so LaunchFactory can
		// deploy the agent safe alongside the rest of the quintet.
		const SafeSingletonCF = await ethers.getContractFactory("MockSafeSingleton");
		const safeSingleton = await SafeSingletonCF.deploy();
		const SafeProxyFactoryCF = await ethers.getContractFactory("MockSafeProxyFactory");
		const safeProxyFactory = await SafeProxyFactoryCF.deploy();
		const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeDeployer");
		const agentSafeDeployer = await AgentSafeDeployerCF.deploy(
			await safeSingleton.getAddress(),
			await safeProxyFactory.getAddress(),
		);

		// Platform receiver doubles as the platformCommissionReceiver immutable;
		// the factory enforces config.platformReceiver == platformCommissionReceiver.
		const platformReceiver = creator.address;

		const Factory = await ethers.getContractFactory("LaunchFactory");
		const factory = await Factory.deploy(
			wbnb,
			await pcsFactory.getAddress(),
			await pcsRouter.getAddress(),
			initCodeHash, // INIT_CODE_HASH derived from BundleFlowToken creation code + (name, symbol)
			await portal.getAddress(),
			creator.address, // TOKEN_IMPL_TAXED_V3 (only used as immutable; not exercised by mock portal)
			tipReceiver.address,
			platformReceiver,
			await routerDeployer.getAddress(),
			await agentSafeDeployer.getAddress(),
			await treasuryLp4Deployer.getAddress(),
			await mockNpm.getAddress(),
			await mockV3Factory.getAddress(),
			await mockFeed.getAddress(),
		);

		return {
			owner,
			creator,
			bundleBot,
			tipReceiver,
			alice,
			bob,
			carol,
			pcsFactory,
			pcsRouter,
			portal,
			factory,
			wbnb,
			initCodeHash,
			name,
			symbol,
			TokenArtifact,
			agentSafeDeployer,
			safeSingleton,
			safeProxyFactory,
			platformReceiver,
		};
	}

	async function createLaunch(ctx, tier, overrides = {}) {
		const { factory, portal, creator, bundleBot, initCodeHash, name, symbol } = ctx;
		const rawSalt = overrides.salt ?? ethers.id(`salt-${tier}-${Math.random()}`);
		const salt = effectiveSalt(creator.address, rawSalt);
		const predicted = computeCreate2Addr(await portal.getAddress(), salt, initCodeHash);

		const closeTimestamp = overrides.closeTimestamp ?? (await currentTs()) + 3600n;

		const config = {
			name,
			symbol,
			metaCid: overrides.metaCid ?? "QmTestCidWaveH",
			creator: creator.address,
			bundleBot: bundleBot.address,
			tier,
			buyTaxBps: overrides.buyTaxBps ?? 300,
			sellTaxBps: overrides.sellTaxBps ?? 300,
			taxDuration: overrides.taxDuration ?? 365 * 24 * 60 * 60,
			antiFarmerDuration: 3600,
			closeTimestamp,
			vanitySalt: rawSalt,
			predictedTokenAddress: overrides.predictedTokenAddress ?? predicted,
			noBurn: overrides.noBurn ?? false,
			// Wave M3 quintet fields
			platformReceiver: overrides.platformReceiver ?? ctx.platformReceiver,
			patron: overrides.patron ?? creator.address,
			agentSafeOwners: overrides.agentSafeOwners ?? [creator.address],
			agentSafeThreshold: overrides.agentSafeThreshold ?? 1,
			platformBps: overrides.platformBps ?? 1000,
			patronBps: overrides.patronBps ?? 2500,
			treasuryTickLowers: overrides.treasuryTickLowers ?? [2000, 6000, 10000, 14000],
			treasuryTickUppers: overrides.treasuryTickUppers ?? [4000, 8000, 12000, 16000],
		};

		const txOrAddrs = await factory.connect(creator).createLaunch.staticCall(config);
		const tx = await factory.connect(creator).createLaunch(config);
		await tx.wait();
		return {
			config,
			rawSalt,
			salt,
			predicted,
			addrs: txOrAddrs, // vault/router/treasuryLp/predictedTokenAddress
		};
	}

	async function currentTs() {
		const blk = await ethers.provider.getBlock("latest");
		return BigInt(blk.timestamp);
	}

	async function advanceTo(ts) {
		await ethers.provider.send("evm_setNextBlockTimestamp", [Number(ts)]);
		await ethers.provider.send("evm_mine", []);
	}

	async function depositFullCap(vault, tier, alice, bob) {
		const cap = PRESALE_CAPS[tier];
		const aliceShare = (cap * 60n) / 100n;
		const bobShare = cap - aliceShare;
		await vault.connect(alice).deposit({ value: aliceShare });
		await vault.connect(bob).deposit({ value: bobShare });
		return { cap, aliceShare, bobShare };
	}

	async function closeSubscribedVault(vault, closer) {
		const now = await currentTs();
		const closeTimestamp = await vault.closeTimestamp();
		const minOpenReady = now + 901n;
		await advanceTo(minOpenReady < closeTimestamp ? minOpenReady : closeTimestamp + 1n);
		await vault.connect(closer).close();
	}

	async function bundleParams(ctx, deadline, opts = {}) {
		const { name, symbol } = ctx;
		// Wave M3: BundleRouter's launchParamsHash now embeds the TaxSplitter
		// address (not the platform wallet). The splitter is per-launch and gets
		// passed in via opts.commissionReceiver; tests that build params before
		// the splitter exists can leave it undefined and hit the mismatch path.
		return {
			vanitySalt: ethers.ZeroHash, // unused; per-launch caller overrides
			name,
			symbol,
			meta: "QmTestCidWaveH",
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 365 * 24 * 60 * 60,
			antiFarmerDuration: 3600,
			commissionReceiver: opts.commissionReceiver ?? ctx.creator.address,
			tipBnb: 0,
			deadline,
		};
	}

	function portalParams(ctx, salt, quoteAmt, beneficiary) {
		return {
			name: ctx.name,
			symbol: ctx.symbol,
			meta: "QmTestCidWaveH",
			dexThresh: 1,
			salt,
			migratorType: 1,
			quoteToken: ethers.ZeroAddress,
			quoteAmt,
			beneficiary,
			permitData: "0x",
			extensionID: ethers.ZeroHash,
			extensionData: "0x",
			dexId: 0,
			lpFeeProfile: 0,
			buyTaxRate: 300,
			sellTaxRate: 300,
			taxDuration: 365 * 24 * 60 * 60,
			antiFarmerDuration: 3600,
			mktBps: 10000,
			deflationBps: 0,
			dividendBps: 0,
			lpBps: 0,
			minimumShareBalance: 0,
			dividendToken: ethers.ZeroAddress,
			commissionReceiver: ctx.creator.address,
			tokenVersion: 6,
		};
	}

	// =========================================================================
	// happy paths per tier
	// =========================================================================

	for (const [tierName, tier] of [
		["tier-80", TIER_80],
		["tier-90", TIER_90],
		["tier-95", TIER_95],
		["tier-98", TIER_98],
		["tier-test", TIER_TEST],
	]) {
		it(`${tierName}: full happy path (deposit -> close -> bundle -> claim)`, async () => {
			const ctx = await deployStack();
			const { alice, bob, bundleBot } = ctx;
			const { config, rawSalt, predicted, addrs } = await createLaunch(ctx, tier);
			const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
			const router = await ethers.getContractAt("BundleRouter", addrs.router);
			const treasuryLp = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);

			// Two depositors split presale 60/40.
			const { cap, aliceShare, bobShare } = await depositFullCap(vault, tier, alice, bob);

			expect(await vault.totalDeposited()).to.equal(cap);

			// Close via creator.
			await closeSubscribedVault(vault, ctx.creator);
			expect(await vault.state()).to.equal(1n);

			// Bundle bot executes.
			const deadline = (await currentTs()) + 600n;
			const params = await bundleParams(ctx, deadline, { commissionReceiver: addrs.taxSplitter });
			params.vanitySalt = rawSalt;

			const tx = await router.connect(bundleBot).executeBundle(params);
			const receipt = await tx.wait();

			// State is LAUNCHED, distributed.
			expect(await vault.state()).to.equal(2n);
			expect(await vault.distributed()).to.equal(true);
			expect(await vault.token()).to.equal(predicted);

			// Treasury holds tokens.
			const token = await ethers.getContractAt("BundleFlowToken", predicted);
			const treasuryBal = await token.balanceOf(addrs.treasuryLp);
			expect(treasuryBal).to.be.gt(0n);

			// DEAD has 50% of token Y.
			const deadBal = await token.balanceOf(DEAD);
			expect(deadBal).to.be.gt(0n);

			// Vault has presaler share == distributed share.
			const vaultBal = await token.balanceOf(addrs.vault);
			const presalerBal = await vault.presalerTokenBalance();
			expect(vaultBal).to.equal(presalerBal);

			// Total token Y = curve (800M) + V2 buy proceeds. The mock router uses
			// real Uniswap V2 getAmountOut against the mock pair's reserves
			// (200M tokens / 16 BNB), so expectedV2Tokens follows the same formula
			// BundleRouter._computeMinV2Out uses.
			const lpTokenReserve = ethers.parseEther("200000000");
			const lpBnbReserve = ethers.parseEther("16");
			const v2In = V2_BUY_BNB[tier];
			const ainFee = v2In * 9975n;
			const expectedV2Tokens = v2In === 0n ? 0n : (ainFee * lpTokenReserve) / (lpBnbReserve * 10000n + ainFee);
			const expectedY = ethers.parseEther("800000000") + expectedV2Tokens;
			// Flat allocation: vault = 20% of total supply (200M), treasury = 10% (100M).
			// Burn absorbs everything else (~50% of supply for tier 80, plus the V2 follow-up
			// buy tokens for graduating tiers). Remaining 20% of supply is locked in the
			// flap-created PCS V2 LP at migration.
			const TOTAL_SUPPLY = ethers.parseEther("1000000000");
			const expectedVault = TOTAL_SUPPLY / 5n;
			const expectedTreasury = TOTAL_SUPPLY / 10n;
			expect(vaultBal).to.equal(expectedVault);
			expect(treasuryBal).to.equal(expectedTreasury);
			expect(deadBal).to.equal(expectedY - expectedVault - expectedTreasury);

			// Depositors claim.
			const aliceTokensBefore = await token.balanceOf(alice.address);
			await vault.connect(alice).claim();
			const aliceTokensAfter = await token.balanceOf(alice.address);
			const aliceGot = aliceTokensAfter - aliceTokensBefore;

			const aliceAlloc = (aliceShare * presalerBal) / cap;
			const vestingEnabled = tier !== TIER_80 && tier !== TIER_TEST;
			if (!vestingEnabled) {
				// 100% TGE — full allocation claimable immediately.
				expect(aliceGot).to.equal(aliceAlloc);
			} else {
				// Vesting: 50% TGE + linear over 24h. A few seconds will have
				// elapsed between launch and the claim mine; allow a small
				// tolerance vs the pure-TGE half. Hard upper bound: TGE+1m.
				const tolerance = aliceAlloc / 86400n; // ~1 second worth of vesting
				expect(aliceGot).to.be.closeTo(aliceAlloc / 2n, tolerance * 10n);
			}

			// Same for bob
			const bobTokensBefore = await token.balanceOf(bob.address);
			await vault.connect(bob).claim();
			const bobGot = (await token.balanceOf(bob.address)) - bobTokensBefore;
			const bobAlloc = (bobShare * presalerBal) / cap;
			if (!vestingEnabled) {
				expect(bobGot).to.equal(bobAlloc);
			} else {
				const tolerance = bobAlloc / 86400n;
				expect(bobGot).to.be.closeTo(bobAlloc / 2n, tolerance * 10n);
			}

			// BundleExecuted event present.
			const iface = router.interface;
			const events = receipt.logs
				.map((l) => {
					try {
						return iface.parseLog(l);
					} catch {
						return null;
					}
				})
				.filter((e) => e && e.name === "BundleExecuted");
			expect(events.length).to.equal(1);
		});
	}

	it("TIER_TEST budget returns (17.34, 16.84, 0.5, false)", async () => {
		const ctx = await deployStack();
		const budget = await ctx.factory.tierBudget(TIER_TEST, 300);
		expect(budget[0]).to.equal(ethers.parseEther("17.34"));
		expect(budget[1]).to.equal(ethers.parseEther("16.84"));
		expect(budget[2]).to.equal(ethers.parseEther("0.5"));
		expect(budget[3]).to.equal(false);
	});

	it("noBurn=true sends burn portion to creator, not DEAD", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot, creator } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_TEST, { noBurn: true });
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await depositFullCap(vault, TIER_TEST, alice, bob);
		await closeSubscribedVault(vault, creator);

		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		const tx = await router.connect(bundleBot).executeBundle(params);
		const receipt = await tx.wait();

		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		const iface = router.interface;
		const event = receipt.logs
			.map((l) => {
				try {
					return iface.parseLog(l);
				} catch {
					return null;
				}
			})
			.find((e) => e && e.name === "BundleExecuted");

		expect(event).to.not.equal(undefined);
		expect(await token.balanceOf(creator.address)).to.equal(event.args.tokensBurned);
		expect(await token.balanceOf(DEAD)).to.equal(0n);
	});

	// =========================================================================
	// negative paths
	// =========================================================================

	it("reverts when depositing after close", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		// Fund partially, close (window expiry path so anyone may close).
		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		const closeTs = (await vault.closeTimestamp()) + 1n;
		await advanceTo(closeTs);
		await vault.connect(alice).close();

		await expect(vault.connect(alice).deposit({ value: ethers.parseEther("1") })).to.be.reverted;
	});

	it("reverts when single-wallet deposit would exceed 60% wallet cap", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		// Alice at 9 BNB (56% of 16 cap). Adding even 1 BNB more pushes to 62.5% > 60% wallet cap.
		await vault.connect(alice).deposit({ value: ethers.parseEther("9") });
		await expect(vault.connect(alice).deposit({ value: ethers.parseEther("8") })).to.be.revertedWithCustomError(
			vault,
			"CapExceeded",
		);
	});

	it("deposit truncates and refunds surplus when overshooting presale cap", async () => {
		const ctx = await deployStack();
		const { alice, bob, carol } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		// fill up to 15 BNB across alice, bob, carol (under 60% wallet cap each)
		await vault.connect(alice).deposit({ value: ethers.parseEther("9") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("4") });
		await vault.connect(carol).deposit({ value: ethers.parseEther("2") });
		expect(await vault.totalDeposited()).to.equal(ethers.parseEther("15"));

		// Bob sends 5 BNB but only 1 is needed to fill the 16 cap. Contract
		// accepts 1, refunds 4 surplus to bob in the same tx.
		const bobBalBefore = await ethers.provider.getBalance(bob.address);
		const tx = await vault.connect(bob).deposit({ value: ethers.parseEther("5") });
		const rcpt = await tx.wait();
		const gasSpent = rcpt.gasUsed * rcpt.gasPrice;
		const bobBalAfter = await ethers.provider.getBalance(bob.address);

		expect(await vault.totalDeposited()).to.equal(ethers.parseEther("16"));
		// bob spent gas + only 1 BNB (the accepted amount), 4 came back
		expect(bobBalBefore - bobBalAfter - gasSpent).to.equal(ethers.parseEther("1"));

		// further deposits when cap is already reached should still revert
		await expect(vault.connect(carol).deposit({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
			vault,
			"CapExceeded",
		);
	});

	it("reverts when non-router calls vault.pullBnbForLaunch", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		await expect(vault.connect(alice).pullBnbForLaunch(1n)).to.be.revertedWithCustomError(vault, "NotRouter");
	});

	it("reverts when non-bundleBot calls router.executeBundle", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot } = ctx;
		const { rawSalt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await depositFullCap(vault, TIER_80, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);

		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;

		await expect(router.connect(alice).executeBundle(params)).to.be.revertedWithCustomError(router, "NotBundleBot");
	});

	it("reverts when router.executeBundle called twice (one-shot guard)", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot } = ctx;
		const { rawSalt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await depositFullCap(vault, TIER_80, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);

		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);
		await expect(router.connect(bundleBot).executeBundle(params)).to.be.revertedWithCustomError(
			router,
			"AlreadyExecuted",
		);
	});

	it("factory reverts on predictedTokenAddress mismatch", async () => {
		const ctx = await deployStack();
		const bogusPredicted = "0x1111111111111111111111111111111111111111";
		await expect(createLaunch(ctx, TIER_80, { predictedTokenAddress: bogusPredicted })).to.be.revertedWithCustomError(
			ctx.factory,
			"InvalidPredictedAddress",
		);
	});

	it("factory reverts on salt reuse", async () => {
		const ctx = await deployStack();
		const reusedSalt = ethers.id("salt-reuse");
		await createLaunch(ctx, TIER_80, { salt: reusedSalt });
		await expect(createLaunch(ctx, TIER_80, { salt: reusedSalt })).to.be.revertedWithCustomError(
			ctx.factory,
			"SaltAlreadyUsed",
		);
	});

	it("router derives the effective CREATE2 salt from the raw vanity salt", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot, portal } = ctx;
		const okLaunch = await createLaunch(ctx, TIER_80);
		const okVault = await ethers.getContractAt("LaunchVault", okLaunch.addrs.vault);
		const okRouter = await ethers.getContractAt("BundleRouter", okLaunch.addrs.router);

		await depositFullCap(okVault, TIER_80, alice, bob);
		await closeSubscribedVault(okVault, ctx.creator);

		const okParams = await bundleParams(ctx, (await currentTs()) + 600n, {
			commissionReceiver: okLaunch.addrs.taxSplitter,
		});
		okParams.vanitySalt = okLaunch.rawSalt;
		await okRouter.connect(bundleBot).executeBundle(okParams);
		expect(await portal.lastDeployed()).to.equal(okLaunch.predicted);

		const mismatchLaunch = await createLaunch(ctx, TIER_80);
		const mismatchRouter = await ethers.getContractAt("BundleRouter", mismatchLaunch.addrs.router);
		const mismatchParams = await bundleParams(ctx, (await currentTs()) + 600n, {
			commissionReceiver: mismatchLaunch.addrs.taxSplitter,
		});
		mismatchParams.vanitySalt = mismatchLaunch.salt;
		await expect(mismatchRouter.connect(bundleBot).executeBundle(mismatchParams)).to.be.revertedWithCustomError(
			mismatchRouter,
			"LaunchParamsMismatch",
		);
		expect(await mismatchRouter.executed()).to.equal(false);
	});

	it("factory reverts on closeTimestamp in the past", async () => {
		const ctx = await deployStack();
		const past = (await currentTs()) - 1n;
		await expect(createLaunch(ctx, TIER_80, { closeTimestamp: past })).to.be.revertedWithCustomError(
			ctx.factory,
			"InvalidCloseTimestamp",
		);
	});

	it("factory reverts on empty name/symbol/meta", async () => {
		const ctx = await deployStack();
		// Force-build a config with empty fields without going through createLaunch helper.
		const rawSalt = ethers.id("salt-empty");
		const salt = effectiveSalt(ctx.creator.address, rawSalt);
		const predicted = computeCreate2Addr(await ctx.portal.getAddress(), salt, ctx.initCodeHash);
		const closeTs = (await currentTs()) + 3600n;
		const base = {
			name: ctx.name,
			symbol: ctx.symbol,
			metaCid: "QmCid",
			creator: ctx.creator.address,
			bundleBot: ctx.bundleBot.address,
			tier: TIER_80,
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 365 * 24 * 60 * 60,
			antiFarmerDuration: 3600,
			closeTimestamp: closeTs,
			vanitySalt: rawSalt,
			predictedTokenAddress: predicted,
			noBurn: false,
			platformReceiver: ctx.platformReceiver,
			patron: ctx.creator.address,
			agentSafeOwners: [ctx.creator.address],
			agentSafeThreshold: 1,
			platformBps: 1000,
			patronBps: 2500,
			treasuryTickLowers: [2000, 6000, 10000, 14000],
			treasuryTickUppers: [4000, 8000, 12000, 16000],
		};
		await expect(ctx.factory.connect(ctx.creator).createLaunch({ ...base, name: "" })).to.be.revertedWithCustomError(
			ctx.factory,
			"EmptyName",
		);
		await expect(ctx.factory.connect(ctx.creator).createLaunch({ ...base, symbol: "" })).to.be.revertedWithCustomError(
			ctx.factory,
			"EmptySymbol",
		);
		await expect(ctx.factory.connect(ctx.creator).createLaunch({ ...base, metaCid: "" })).to.be.revertedWithCustomError(
			ctx.factory,
			"EmptyMetaCid",
		);
	});

	// =========================================================================
	// refund path
	// =========================================================================

	it("undersubscribed: enable refund + each depositor refunds principal", async () => {
		const ctx = await deployStack();
		const { alice, bob } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("3") });

		const closeTs = (await vault.closeTimestamp()) + 1n;
		await advanceTo(closeTs);
		await vault.close();
		await vault.enableRefundUnderSubscribed();

		const aliceBefore = await ethers.provider.getBalance(alice.address);
		const txA = await vault.connect(alice).refund();
		const rA = await txA.wait();
		const aliceAfter = await ethers.provider.getBalance(alice.address);
		const gasA = rA.gasUsed * rA.gasPrice;
		// no bonus pool (no withdraws), so refund == principal exactly
		expect(aliceAfter + gasA - aliceBefore).to.equal(ethers.parseEther("4"));

		const txB = await vault.connect(bob).refund();
		await txB.wait();

		expect(await vault.totalDeposited()).to.equal(0n);
		expect(await ethers.provider.getBalance(addrs.vault)).to.equal(0n);
	});

	it("bundle-failed refund: bundleBot enables refund only after grace period", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot } = ctx;
		const closeTimestamp = (await currentTs()) + 60n;
		const { addrs } = await createLaunch(ctx, TIER_80, { closeTimestamp });
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		const { aliceShare } = await depositFullCap(vault, TIER_80, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);

		// Only bundleBot may flip after fully subscribed + closed.
		await expect(vault.connect(alice).enableRefundBundleFailed()).to.be.revertedWithCustomError(vault, "NotBundleBot");
		await expect(vault.connect(bundleBot).enableRefundBundleFailed()).to.be.revertedWithCustomError(
			vault,
			"WindowClosed",
		);
		await advanceTo(closeTimestamp + 86400n);
		await vault.connect(bundleBot).enableRefundBundleFailed();
		expect(await vault.state()).to.equal(3n); // REFUND

		const aliceBefore = await ethers.provider.getBalance(alice.address);
		const tx = await vault.connect(alice).refund();
		const r = await tx.wait();
		const aliceAfter = await ethers.provider.getBalance(alice.address);
		const gas = r.gasUsed * r.gasPrice;
		expect(aliceAfter + gas - aliceBefore).to.equal(aliceShare);
	});

	it("admin emergency refund: factory.owner must schedule before flipping OPEN or CLOSED state to REFUND", async () => {
		const ctx = await deployStack();
		const { owner, alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		// alice can't admin
		await expect(vault.connect(alice).adminEnableRefund("test")).to.be.revertedWithCustomError(
			vault,
			"NotFactoryOwner",
		);
		await expect(vault.connect(owner).adminEnableRefund("emergency")).to.be.revertedWithCustomError(
			vault,
			"AdminRefundNotScheduled",
		);
		const scheduleTx = await vault.connect(owner).scheduleAdminRefund("emergency");
		const scheduleBlock = await ethers.provider.getBlock(scheduleTx.blockNumber);
		expect(await vault.adminRefundReadyAt()).to.equal(BigInt(scheduleBlock.timestamp) + 86400n);
		await expect(vault.connect(owner).adminEnableRefund("emergency")).to.be.revertedWithCustomError(
			vault,
			"AdminRefundDelayNotElapsed",
		);
		await advanceTo(BigInt(scheduleBlock.timestamp) + 86400n);
		await vault.connect(owner).adminEnableRefund("emergency");
		expect(await vault.state()).to.equal(3n); // REFUND
		await vault.connect(alice).refund();
		expect((await vault.depositors(alice.address)).deposited).to.equal(0n);
	});

	it("refund() reverts second time from same address (idempotent NoDeposit)", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		const closeTs = (await vault.closeTimestamp()) + 1n;
		await advanceTo(closeTs);
		await vault.close();
		await vault.enableRefundUnderSubscribed();

		await vault.connect(alice).refund();
		await expect(vault.connect(alice).refund()).to.be.revertedWithCustomError(vault, "NoDeposit");
	});

	// =========================================================================
	// vault BNB balance preservation under bundle failure
	// =========================================================================

	it("bundle revert leaves vault BNB intact (atomic-or-bust via EVM rollback)", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot, portal } = ctx;
		const { rawSalt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await depositFullCap(vault, TIER_80, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);

		const vaultBalBefore = await ethers.provider.getBalance(addrs.vault);
		expect(vaultBalBefore).to.equal(PRESALE_CAPS[TIER_80]);

		// Force portal revert.
		await portal.setShouldRevert(true);

		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		await expect(router.connect(bundleBot).executeBundle(params)).to.be.reverted;

		// Vault state should still be CLOSED (EVM rolled back the state flip),
		// balance untouched.
		expect(await vault.state()).to.equal(1n); // CLOSED
		expect(await ethers.provider.getBalance(addrs.vault)).to.equal(PRESALE_CAPS[TIER_80]);
		expect(await router.executed()).to.equal(false);
	});

	it("portal salt preconsumption leaves vault closed and recoverable after grace period", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot, portal } = ctx;
		const { rawSalt, salt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await portal
			.connect(alice)
			.newTokenV6(portalParams(ctx, salt, ethers.parseEther("16"), alice.address), { value: ethers.parseEther("16") });

		await depositFullCap(vault, TIER_80, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);

		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		await expect(router.connect(bundleBot).executeBundle(params)).to.be.reverted;
		expect(await vault.state()).to.equal(1n);
		expect(await router.executed()).to.equal(false);
		expect(await ethers.provider.getBalance(addrs.vault)).to.equal(PRESALE_CAPS[TIER_80]);

		await advanceTo((await vault.closeTimestamp()) + 86400n);
		await vault.enableRefundLaunchExpired();
		expect(await vault.state()).to.equal(3n);
	});

	// =========================================================================
	// treasury allocation + tip guard
	// =========================================================================

	it.skip("treasury allocation goes to TreasuryLP exactly and recordManagedToken locks in", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		const treasuryLp = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);

		await depositFullCap(vault, TIER_80, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);
		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);

		// Treasury gets a flat 10% of total supply = 100M tokens (regardless of tier).
		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		expect(await token.balanceOf(addrs.treasuryLp)).to.equal(ethers.parseEther("100000000"));

		// Router registers the managed token immediately after treasury transfer.
		expect(await treasuryLp.managedToken()).to.equal(predicted);
	});

	it.skip("creator cannot sweep the managed treasury allocation", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot, creator } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		const treasuryLp = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);

		await depositFullCap(vault, TIER_80, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);
		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);

		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		const treasuryBalance = await token.balanceOf(addrs.treasuryLp);
		await expect(
			treasuryLp.connect(creator).sweep(creator.address, predicted, treasuryBalance),
		).to.be.revertedWithCustomError(treasuryLp, "NotAuthorized");
		expect(await token.balanceOf(addrs.treasuryLp)).to.equal(treasuryBalance);
	});

	it.skip("records actual vault token balance when token transfers take a fee", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot, portal } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		const treasuryLp = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);

		await portal.setTokenTransferTaxBps(1000); // 10% transfer fee in the mock token.
		const { cap, aliceShare } = await depositFullCap(vault, TIER_80, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);

		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);

		// Flat splits: vault = 200M (20% of supply), treasury = 100M (10% of supply).
		// burn absorbs the rest. With a 10% transfer tax the receiving side gets 90%
		// of each chunk: vault receives 180M, treasury receives 90M.
		// Alice (sole depositor, tier 80 = 100% TGE) claims all 180M, receives 162M post-tax.
		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		const actualVaultBalance = await token.balanceOf(addrs.vault);
		expect(actualVaultBalance).to.equal(ethers.parseEther("180000000"));
		expect(await vault.presalerTokenBalance()).to.equal(actualVaultBalance);
		expect(await treasuryLp.managedToken()).to.equal(predicted);
		expect(await treasuryLp.balance()).to.equal(ethers.parseEther("90000000"));
		await expect(vault.connect(alice).claim()).to.emit(vault, "Claimed");
		// Alice gross allocation = aliceShare / cap * actualVaultBalance.
		// Claim transfer applies the same 10% tax, so alice receives 90% of gross.
		const aliceGross = (aliceShare * actualVaultBalance) / cap;
		expect(await token.balanceOf(alice.address)).to.equal(aliceGross - aliceGross / 10n);
	});

	it("fee-on-transfer token claims do not strand later presalers", async () => {
		const ctx = await deployStack();
		const { alice, bob, carol, bundleBot, portal, creator } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		const taxBps = 1000n;

		await portal.setTokenTransferTaxBps(Number(taxBps));
		const a = ethers.parseEther("8");
		const b = ethers.parseEther("5");
		const c = ethers.parseEther("3");
		await vault.connect(alice).deposit({ value: a });
		await vault.connect(bob).deposit({ value: b });
		await vault.connect(carol).deposit({ value: c });
		await closeSubscribedVault(vault, creator);

		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);

		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		const presalerBal = await vault.presalerTokenBalance();
		const cap = PRESALE_CAPS[TIER_80];
		const expectedNet = (gross) => gross - (gross * taxBps) / 10000n;

		await expect(vault.connect(alice).claim()).to.emit(vault, "Claimed");
		await expect(vault.connect(bob).claim()).to.emit(vault, "Claimed");
		await expect(vault.connect(carol).claim()).to.emit(vault, "Claimed");

		expect(await token.balanceOf(alice.address)).to.equal(expectedNet((a * presalerBal) / cap));
		expect(await token.balanceOf(bob.address)).to.equal(expectedNet((b * presalerBal) / cap));
		expect(await token.balanceOf(carol.address)).to.equal(expectedNet((c * presalerBal) / cap));
		expect(await token.balanceOf(addrs.vault)).to.equal(0n);
	});

	it("fee-on-transfer token claims remain claimable across vesting tranches", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot, portal } = ctx;
		const taxBps = 1000n;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_90, {
			buyTaxBps: Number(taxBps),
			sellTaxBps: Number(taxBps),
		});
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		// Matches the launch buyTaxBps. The V2 follow-up buy computes minOut
		// after configured buy tax, then applies the 2% market slippage tolerance.

		await portal.setTokenTransferTaxBps(Number(taxBps));
		await depositFullCap(vault, TIER_90, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);
		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		params.buyTaxBps = Number(taxBps);
		params.sellTaxBps = Number(taxBps);
		await router.connect(bundleBot).executeBundle(params);

		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		const expectedNet = (gross) => gross - (gross * taxBps) / 10000n;
		await expect(vault.connect(alice).claim()).to.emit(vault, "Claimed");
		const firstGrossClaimed = (await vault.depositors(alice.address)).claimed;
		expect(await token.balanceOf(alice.address)).to.equal(expectedNet(firstGrossClaimed));

		const launchTs = await vault.launchTimestamp();
		await advanceTo(launchTs + 24n * 3600n + 1n);
		await expect(vault.connect(alice).claim()).to.emit(vault, "Claimed");
		const totalGrossClaimed = (await vault.depositors(alice.address)).claimed;
		const secondGrossClaimed = totalGrossClaimed - firstGrossClaimed;

		expect(await token.balanceOf(alice.address)).to.equal(
			expectedNet(firstGrossClaimed) + expectedNet(secondGrossClaimed),
		);
		const bobUnclaimed = await vault.claimableOf(bob.address);
		expect(await token.balanceOf(addrs.vault)).to.equal(bobUnclaimed);
		await expect(vault.connect(alice).claim()).to.be.revertedWithCustomError(vault, "NothingToClaim");
	});

	it("tipBnb stays disabled for factory-created launches", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot, tipReceiver, creator } = ctx;
		const { rawSalt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await depositFullCap(vault, TIER_80, alice, bob);
		await closeSubscribedVault(vault, creator);

		const trBefore = await ethers.provider.getBalance(tipReceiver.address);
		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		params.tipBnb = ethers.parseEther("0.05");
		await expect(router.connect(bundleBot).executeBundle(params)).to.be.revertedWithCustomError(
			router,
			"TipNotAllowed",
		);
		expect(await router.executed()).to.equal(false);
		expect(await ethers.provider.getBalance(tipReceiver.address)).to.equal(trBefore);
	});

	// =========================================================================
	// vesting timeline
	// =========================================================================

	it("tier-90 vesting: TGE = 50%, linear over 24h reaches 100%", async () => {
		const ctx = await deployStack();
		const { alice, bob, bundleBot } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_90);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		const { cap, aliceShare } = await depositFullCap(vault, TIER_90, alice, bob);
		await closeSubscribedVault(vault, ctx.creator);
		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);

		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		const presalerBal = await vault.presalerTokenBalance();
		const aliceAlloc = (aliceShare * presalerBal) / cap;

		// TGE: ~50% (a few seconds may have elapsed between launch and this claim;
		// allow a small tolerance equal to ~10 seconds of linear vesting).
		await vault.connect(alice).claim();
		const tgeTolerance = (aliceAlloc / 2n / 86400n) * 10n;
		expect(await token.balanceOf(alice.address)).to.be.closeTo(aliceAlloc / 2n, tgeTolerance);

		// Advance 12 hours: ~75%
		const launchTs = await vault.launchTimestamp();
		await advanceTo(launchTs + 12n * 3600n);
		await vault.connect(alice).claim();
		const half = aliceAlloc / 2n;
		const quarter = aliceAlloc / 4n;
		const got12h = await token.balanceOf(alice.address);
		// Allow tolerance for the 1-2 seconds drift between block timestamp
		// and the exact 12h mark.
		expect(got12h).to.be.closeTo(half + quarter, tgeTolerance);

		// Advance to 24h end: 100%
		await advanceTo(launchTs + 24n * 3600n + 1n);
		await vault.connect(alice).claim();
		expect(await token.balanceOf(alice.address)).to.equal(aliceAlloc);
	});

	// =========================================================================
	// pro-rata correctness with three depositors
	// =========================================================================

	it("three depositors get correct pro-rata shares", async () => {
		const ctx = await deployStack();
		const { alice, bob, carol, bundleBot } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		// 50/30/20 split of 16 BNB
		const a = ethers.parseEther("8");
		const b = ethers.parseEther("5");
		const c = ethers.parseEther("3");
		await vault.connect(alice).deposit({ value: a });
		await vault.connect(bob).deposit({ value: b });
		await vault.connect(carol).deposit({ value: c });
		expect(await vault.totalDeposited()).to.equal(PRESALE_CAPS[TIER_80]);

		await closeSubscribedVault(vault, ctx.creator);
		const params = await bundleParams(ctx, (await currentTs()) + 600n, { commissionReceiver: addrs.taxSplitter });
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);

		const presalerBal = await vault.presalerTokenBalance();
		const token = await ethers.getContractAt("BundleFlowToken", predicted);

		await vault.connect(alice).claim();
		await vault.connect(bob).claim();
		await vault.connect(carol).claim();

		const cap = PRESALE_CAPS[TIER_80];
		expect(await token.balanceOf(alice.address)).to.equal((a * presalerBal) / cap);
		expect(await token.balanceOf(bob.address)).to.equal((b * presalerBal) / cap);
		expect(await token.balanceOf(carol.address)).to.equal((c * presalerBal) / cap);

		// Rounding crumbs: vault retains at most (cap - 1) wei worth
		const remaining = await token.balanceOf(addrs.vault);
		expect(remaining).to.be.lt(cap);
	});

	// =========================================================================
	// withdraw + bonus pool
	// =========================================================================

	it("withdraw with penalty=0 returns full amount; bonusPool stays zero", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		const before = await ethers.provider.getBalance(alice.address);
		const tx = await vault.connect(alice).withdrawAll();
		const r = await tx.wait();
		const after = await ethers.provider.getBalance(alice.address);
		const gas = r.gasUsed * r.gasPrice;
		expect(after + gas - before).to.equal(ethers.parseEther("4"));
		expect(await vault.bonusPool()).to.equal(0n);
		expect(await vault.totalDeposited()).to.equal(0n);
	});

	it("requestLaunch returns true only when CLOSED + funded + router wired", async () => {
		const ctx = await deployStack();
		const { alice, bob } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		expect(await vault.requestLaunch()).to.equal(false); // OPEN

		await depositFullCap(vault, TIER_80, alice, bob);
		expect(await vault.requestLaunch()).to.equal(false); // still OPEN

		await closeSubscribedVault(vault, ctx.creator);
		expect(await vault.requestLaunch()).to.equal(true); // CLOSED + funded + router set
	});

	// =========================================================================
	// distribute / pullBnbForLaunch direct revert paths
	// =========================================================================

	it("distribute reverts when not in LAUNCHED state", async () => {
		const ctx = await deployStack();
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		// router can't even reach distribute() without going through pullBnb first;
		// direct call from EOA fails on NotRouter regardless.
		await expect(vault.distribute(addrs.vault, 1n)).to.be.revertedWithCustomError(vault, "NotRouter");
	});

	// =========================================================================
	// no claim before distribute
	// =========================================================================

	it("claim reverts pre-distribute (InvalidState)", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		// claim from OPEN state -> revert InvalidState (via the inState modifier).
		await expect(vault.connect(alice).claim()).to.be.revertedWithCustomError(vault, "InvalidState");
	});
});
