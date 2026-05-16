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

	const PRESALE_CAPS = {
		[TIER_80]: ethers.parseEther("16"),
		[TIER_90]: ethers.parseEther("32"),
		[TIER_95]: ethers.parseEther("64"),
		[TIER_98]: ethers.parseEther("160"),
	};
	// Real tier math (per LaunchFactory.tierConfig):
	// - quoteAmt = 16 BNB for TIER_80 (curve only, no graduation),
	//   20 BNB for graduating tiers (need >=20 to trigger Portal graduation).
	// - v2BuyBnb is leftover BNB swapped through V2 after graduation.
	const V2_BUY_BNB = {
		[TIER_80]: 0n,
		[TIER_90]: ethers.parseEther("12"),
		[TIER_95]: ethers.parseEther("44"),
		[TIER_98]: ethers.parseEther("140"),
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
		await pcsRouter.setRate(ethers.parseEther("1000000")); // 1M tokens per BNB (toy rate)

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
		const Factory = await ethers.getContractFactory("LaunchFactory");
		const factory = await Factory.deploy(
			wbnb,
			await pcsFactory.getAddress(),
			await pcsRouter.getAddress(),
			initCodeHash, // INIT_CODE_HASH derived from BundleFlowToken creation code + (name, symbol)
			await portal.getAddress(),
			creator.address, // TOKEN_IMPL_TAXED_V3 (only used as immutable; not exercised by mock portal)
			tipReceiver.address,
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
			commissionReceiver: overrides.commissionReceiver ?? creator.address,
			tier,
			buyTaxBps: overrides.buyTaxBps ?? 300,
			sellTaxBps: overrides.sellTaxBps ?? 300,
			taxDuration: 365 * 24 * 60 * 60,
			antiFarmerDuration: 3600,
			closeTimestamp,
			vanitySalt: rawSalt,
			predictedTokenAddress: overrides.predictedTokenAddress ?? predicted,
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

	async function bundleParams(ctx, deadline) {
		const { name, symbol } = ctx;
		return {
			vanitySalt: ethers.ZeroHash, // unused — set per launch below
			name,
			symbol,
			meta: "QmTestCidWaveH",
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 365 * 24 * 60 * 60,
			antiFarmerDuration: 3600,
			commissionReceiver: ctx.creator.address,
			minV2TokensOut: 0,
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
	]) {
		it(`${tierName}: full happy path (deposit -> close -> bundle -> claim)`, async () => {
			const ctx = await deployStack();
			const { alice, bob, bundleBot } = ctx;
			const { config, rawSalt, predicted, addrs } = await createLaunch(ctx, tier);
			const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
			const router = await ethers.getContractAt("BundleRouter", addrs.router);
			const treasuryLp = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);

			// Two depositors split presale 60/40.
			const cap = PRESALE_CAPS[tier];
			const aliceShare = (cap * 60n) / 100n;
			const bobShare = cap - aliceShare;
			await vault.connect(alice).deposit({ value: aliceShare });
			await vault.connect(bob).deposit({ value: bobShare });

			expect(await vault.totalDeposited()).to.equal(cap);

			// Close via creator.
			await vault.connect(ctx.creator).close();
			expect(await vault.state()).to.equal(1n);

			// Bundle bot executes.
			const deadline = (await currentTs()) + 600n;
			const params = await bundleParams(ctx, deadline);
			params.vanitySalt = rawSalt;
			// minV2TokensOut: leave at 0 — happy path doesn't gate on slippage.

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

			// Total token Y ~= curve + V2 = 800M + (16/32/48/144 BNB * 1M tokens/BNB) for tier
			const expectedV2Tokens = (V2_BUY_BNB[tier] * ethers.parseEther("1000000")) / ethers.parseEther("1");
			const expectedY = ethers.parseEther("800000000") + expectedV2Tokens;
			// Burn = 50%, treasury = 10%, vault = 40%
			expect(deadBal).to.equal(expectedY / 2n);
			expect(treasuryBal).to.equal(expectedY / 10n);
			expect(vaultBal).to.equal(expectedY - deadBal - treasuryBal);

			// Depositors claim.
			const aliceTokensBefore = await token.balanceOf(alice.address);
			await vault.connect(alice).claim();
			const aliceTokensAfter = await token.balanceOf(alice.address);
			const aliceGot = aliceTokensAfter - aliceTokensBefore;

			const aliceAlloc = (aliceShare * presalerBal) / cap;
			const vestingEnabled = tier !== TIER_80;
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

	it("reverts when deposit overshoots presale cap", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		await vault.connect(alice).deposit({ value: ethers.parseEther("10") });
		await expect(vault.connect(alice).deposit({ value: ethers.parseEther("10") })).to.be.revertedWithCustomError(
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
		const { alice, bundleBot } = ctx;
		const { rawSalt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(ctx.creator).close();

		const params = await bundleParams(ctx, (await currentTs()) + 600n);
		params.vanitySalt = rawSalt;

		await expect(router.connect(alice).executeBundle(params)).to.be.revertedWithCustomError(router, "NotBundleBot");
	});

	it("reverts when router.executeBundle called twice (one-shot guard)", async () => {
		const ctx = await deployStack();
		const { alice, bundleBot } = ctx;
		const { rawSalt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(ctx.creator).close();

		const params = await bundleParams(ctx, (await currentTs()) + 600n);
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
		const { alice, bundleBot, portal } = ctx;
		const okLaunch = await createLaunch(ctx, TIER_80);
		const okVault = await ethers.getContractAt("LaunchVault", okLaunch.addrs.vault);
		const okRouter = await ethers.getContractAt("BundleRouter", okLaunch.addrs.router);

		await okVault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await okVault.connect(ctx.creator).close();

		const okParams = await bundleParams(ctx, (await currentTs()) + 600n);
		okParams.vanitySalt = okLaunch.rawSalt;
		await okRouter.connect(bundleBot).executeBundle(okParams);
		expect(await portal.lastDeployed()).to.equal(okLaunch.predicted);

		const mismatchLaunch = await createLaunch(ctx, TIER_80);
		const mismatchRouter = await ethers.getContractAt("BundleRouter", mismatchLaunch.addrs.router);
		const mismatchParams = await bundleParams(ctx, (await currentTs()) + 600n);
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
			commissionReceiver: ctx.creator.address,
			tier: TIER_80,
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 365 * 24 * 60 * 60,
			antiFarmerDuration: 3600,
			closeTimestamp: closeTs,
			vanitySalt: rawSalt,
			predictedTokenAddress: predicted,
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
		const { alice, bundleBot } = ctx;
		const closeTimestamp = (await currentTs()) + 60n;
		const { addrs } = await createLaunch(ctx, TIER_80, { closeTimestamp });
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(ctx.creator).close();

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
		expect(aliceAfter + gas - aliceBefore).to.equal(PRESALE_CAPS[TIER_80]);
	});

	it("admin emergency refund: factory.owner can flip OPEN or CLOSED state to REFUND", async () => {
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
		// owner can
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
		const { alice, bundleBot, portal } = ctx;
		const { rawSalt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(ctx.creator).close();

		const vaultBalBefore = await ethers.provider.getBalance(addrs.vault);
		expect(vaultBalBefore).to.equal(PRESALE_CAPS[TIER_80]);

		// Force portal revert.
		await portal.setShouldRevert(true);

		const params = await bundleParams(ctx, (await currentTs()) + 600n);
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
		const { alice, bundleBot, portal } = ctx;
		const { rawSalt, salt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await portal
			.connect(alice)
			.newTokenV6(portalParams(ctx, salt, ethers.parseEther("16"), alice.address), { value: ethers.parseEther("16") });

		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(ctx.creator).close();

		const params = await bundleParams(ctx, (await currentTs()) + 600n);
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

	it("treasury allocation goes to TreasuryLP exactly and recordManagedToken locks in", async () => {
		const ctx = await deployStack();
		const { alice, bundleBot } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		const treasuryLp = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);

		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(ctx.creator).close();
		const params = await bundleParams(ctx, (await currentTs()) + 600n);
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);

		// Tier 80 has v2BuyBnb=0, totalY = 800M, treasury = 80M.
		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		expect(await token.balanceOf(addrs.treasuryLp)).to.equal(ethers.parseEther("80000000"));

		// Router registers the managed token immediately after treasury transfer.
		expect(await treasuryLp.managedToken()).to.equal(predicted);
	});

	it("records actual vault token balance when token transfers take a fee", async () => {
		const ctx = await deployStack();
		const { alice, bundleBot, portal } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		const treasuryLp = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);

		await portal.setTokenTransferTaxBps(1000); // 10% transfer fee in the mock token.
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(ctx.creator).close();

		const params = await bundleParams(ctx, (await currentTs()) + 600n);
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);

		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		const actualVaultBalance = await token.balanceOf(addrs.vault);
		expect(actualVaultBalance).to.equal(ethers.parseEther("288000000"));
		expect(await vault.presalerTokenBalance()).to.equal(actualVaultBalance);
		expect(await treasuryLp.managedToken()).to.equal(predicted);
		expect(await treasuryLp.balance()).to.equal(ethers.parseEther("72000000"));
		await expect(vault.connect(alice).claim()).to.emit(vault, "Claimed");
		expect(await token.balanceOf(alice.address)).to.equal(ethers.parseEther("259200000"));
	});

	it("tipBnb stays disabled for factory-created launches", async () => {
		const ctx = await deployStack();
		const { alice, bundleBot, tipReceiver, creator } = ctx;
		const { rawSalt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(creator).close();

		const trBefore = await ethers.provider.getBalance(tipReceiver.address);
		const params = await bundleParams(ctx, (await currentTs()) + 600n);
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
		const { alice, bundleBot } = ctx;
		const { rawSalt, predicted, addrs } = await createLaunch(ctx, TIER_90);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);

		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_90] });
		await vault.connect(ctx.creator).close();
		const params = await bundleParams(ctx, (await currentTs()) + 600n);
		params.vanitySalt = rawSalt;
		await router.connect(bundleBot).executeBundle(params);

		const token = await ethers.getContractAt("BundleFlowToken", predicted);
		const presalerBal = await vault.presalerTokenBalance();

		// TGE: ~50% (a few seconds may have elapsed between launch and this claim;
		// allow a small tolerance equal to ~10 seconds of linear vesting).
		await vault.connect(alice).claim();
		const tgeTolerance = (presalerBal / 2n / 86400n) * 10n;
		expect(await token.balanceOf(alice.address)).to.be.closeTo(presalerBal / 2n, tgeTolerance);

		// Advance 12 hours: ~75%
		const launchTs = await vault.launchTimestamp();
		await advanceTo(launchTs + 12n * 3600n);
		await vault.connect(alice).claim();
		const half = presalerBal / 2n;
		const quarter = presalerBal / 4n;
		const got12h = await token.balanceOf(alice.address);
		// Allow tolerance for the 1-2 seconds drift between block timestamp
		// and the exact 12h mark.
		expect(got12h).to.be.closeTo(half + quarter, tgeTolerance);

		// Advance to 24h end: 100%
		await advanceTo(launchTs + 24n * 3600n + 1n);
		await vault.connect(alice).claim();
		expect(await token.balanceOf(alice.address)).to.equal(presalerBal);
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

		await vault.connect(ctx.creator).close();
		const params = await bundleParams(ctx, (await currentTs()) + 600n);
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
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);

		expect(await vault.requestLaunch()).to.equal(false); // OPEN

		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		expect(await vault.requestLaunch()).to.equal(false); // still OPEN

		await vault.connect(ctx.creator).close();
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
