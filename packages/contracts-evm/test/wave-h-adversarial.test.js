// Wave H adversarial / edge-case test matrix.
//
// Companion to test/wave-h-bundle-flow.test.js (happy paths) and
// test/integration/wave-h-real-fork.test.js (real-fork live).
// Covers the access-control revert paths, state-machine guard paths,
// math edge cases, and a few atomicity verifications.
//
// 30+ test cases. All should PASS — any failure means the contract
// behavior doesn't match the documented revert.

const { expect } = require("chai");
const { ethers } = require("hardhat");

// Reuse the deployStack + helpers from the bundle-flow file by inlining.
// We can't import test files cleanly, so we duplicate the helpers.

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

async function currentTs() {
	const block = await ethers.provider.getBlock("latest");
	return BigInt(block.timestamp);
}

async function advanceTo(timestamp) {
	const target = typeof timestamp === "bigint" ? Number(timestamp) : timestamp;
	await ethers.provider.send("evm_setNextBlockTimestamp", [target]);
	await ethers.provider.send("evm_mine", []);
}

function computeInitCodeHash(creationCode, name, symbol) {
	const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["string", "string"], [name, symbol]);
	return ethers.keccak256(ethers.concat([creationCode, encoded]));
}

function computeCreate2Addr(deployer, salt, initCodeHash) {
	return ethers.getCreate2Address(deployer, salt, initCodeHash);
}

async function deployStack() {
	const [owner, creator, bundleBot, tipReceiver, alice, bob, carol] = await ethers.getSigners();

	const PCSFactory = await ethers.getContractFactory("MockBundlePCSFactory");
	const pcsFactory = await PCSFactory.deploy();

	const PCSRouter = await ethers.getContractFactory("MockSimplePCSRouter");
	const pcsRouter = await PCSRouter.deploy();
	await pcsRouter.setRate(ethers.parseEther("1000000"));

	const wbnb = "0x0000000000000000000000000000000000000B0B";

	const Portal = await ethers.getContractFactory("MockFlapPortalCREATE2");
	const portal = await Portal.deploy(await pcsFactory.getAddress(), wbnb);
	await portal.setPCSRouter(await pcsRouter.getAddress());

	const TokenArtifact = await ethers.getContractFactory("BundleFlowToken");
	const name = "FlowToken";
	const symbol = "FLOW";
	const initCodeHash = computeInitCodeHash(TokenArtifact.bytecode, name, symbol);

	const Factory = await ethers.getContractFactory("LaunchFactory");
	const factory = await Factory.deploy(
		wbnb,
		await pcsFactory.getAddress(),
		await pcsRouter.getAddress(),
		initCodeHash,
		await portal.getAddress(),
		creator.address,
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
		wbnb,
		portal,
		factory,
		initCodeHash,
		name,
		symbol,
	};
}

async function createLaunch(ctx, tier, overrides = {}) {
	const { factory, portal, creator, bundleBot, initCodeHash, name, symbol } = ctx;
	const salt = overrides.salt ?? ethers.id(`salt-${tier}-${Math.random()}`);
	const predicted = computeCreate2Addr(await portal.getAddress(), salt, initCodeHash);
	const closeTimestamp = overrides.closeTimestamp ?? (await currentTs()) + 3600n;

	const config = {
		name,
		symbol,
		metaCid: overrides.metaCid ?? "QmTestCid",
		creator: creator.address,
		bundleBot: bundleBot.address,
		commissionReceiver: overrides.commissionReceiver ?? creator.address,
		tier,
		buyTaxBps: overrides.buyTaxBps ?? 300,
		sellTaxBps: overrides.sellTaxBps ?? 300,
		taxDuration: 365 * 24 * 60 * 60,
		antiFarmerDuration: 3600,
		closeTimestamp,
		vanitySalt: salt,
		predictedTokenAddress: overrides.predictedTokenAddress ?? predicted,
	};

	const addrs = await factory.createLaunch.staticCall(config);
	const tx = await factory.createLaunch(config);
	await tx.wait();
	return { config, salt, predicted, addrs };
}

describe("Wave H adversarial / edge cases", () => {
	// =========================================================================
	// vault state machine
	// =========================================================================

	it("deposit reverts in CLOSED state", async () => {
		const ctx = await deployStack();
		const { alice, creator } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(creator).close();
		await expect(vault.connect(alice).deposit({ value: 1n })).to.be.revertedWithCustomError(vault, "InvalidState");
	});

	it("withdraw reverts in CLOSED state", async () => {
		const ctx = await deployStack();
		const { alice, creator } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(creator).close();
		await expect(vault.connect(alice).withdrawAll()).to.be.revertedWithCustomError(vault, "InvalidState");
	});

	it("close reverts twice", async () => {
		const ctx = await deployStack();
		const { alice, creator } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(creator).close();
		await expect(vault.connect(creator).close()).to.be.revertedWithCustomError(vault, "InvalidState");
	});

	it("close before window + below cap reverts WindowClosed", async () => {
		const ctx = await deployStack();
		const { alice, creator } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		await expect(vault.connect(creator).close()).to.be.revertedWithCustomError(vault, "WindowClosed");
	});

	it("pullBnbForLaunch from non-router reverts NotRouter", async () => {
		const ctx = await deployStack();
		const { addrs, alice } = ctx;
		const launch = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", launch.addrs.vault);
		await expect(vault.connect(alice).pullBnbForLaunch(1n)).to.be.revertedWithCustomError(vault, "NotRouter");
	});

	it("distribute from non-router reverts NotRouter", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await expect(vault.connect(alice).distribute(alice.address, 1n)).to.be.revertedWithCustomError(vault, "NotRouter");
	});

	it("claim before distribute reverts InvalidState", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		await expect(vault.connect(alice).claim()).to.be.revertedWithCustomError(vault, "InvalidState");
	});

	it("double claim is gated by claimed-tracking and reverts NothingToClaim", async () => {
		const ctx = await deployStack();
		const { alice, bundleBot, creator } = ctx;
		const { salt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(creator).close();
		const closeTs = (await currentTs()) + 600n;
		const params = {
			vanitySalt: salt,
			name: ctx.name,
			symbol: ctx.symbol,
			meta: "QmTestCid",
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 365 * 24 * 60 * 60,
			antiFarmerDuration: 3600,
			commissionReceiver: creator.address,
			minV2TokensOut: 0,
			tipBnb: 0,
			deadline: closeTs,
		};
		await router.connect(bundleBot).executeBundle(params);
		await vault.connect(alice).claim();
		// Tier 80 has no vesting, so first claim is full allocation. Second reverts.
		await expect(vault.connect(alice).claim()).to.be.revertedWithCustomError(vault, "NothingToClaim");
	});

	// =========================================================================
	// factory adversarial inputs
	// =========================================================================

	it("createLaunch reverts with creator == address(0)", async () => {
		const ctx = await deployStack();
		const { factory, bundleBot, creator: c } = ctx;
		const salt = ethers.id("test-salt-creator-zero");
		const closeTs = (await currentTs()) + 3600n;
		const predicted = computeCreate2Addr(await ctx.portal.getAddress(), salt, ctx.initCodeHash);
		const config = {
			name: ctx.name,
			symbol: ctx.symbol,
			metaCid: "Qm",
			creator: ethers.ZeroAddress,
			bundleBot: bundleBot.address,
			commissionReceiver: c.address,
			tier: TIER_80,
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31536000,
			antiFarmerDuration: 3600,
			closeTimestamp: closeTs,
			vanitySalt: salt,
			predictedTokenAddress: predicted,
		};
		await expect(factory.createLaunch(config)).to.be.revertedWithCustomError(factory, "InvalidCreator");
	});

	it("createLaunch reverts with closeTimestamp in past", async () => {
		const ctx = await deployStack();
		await expect(
			createLaunch(ctx, TIER_80, { closeTimestamp: (await currentTs()) - 1n }),
		).to.be.revertedWithCustomError(ctx.factory, "InvalidCloseTimestamp");
	});

	it("createLaunch reverts with buyTaxBps > 10000", async () => {
		const ctx = await deployStack();
		await expect(createLaunch(ctx, TIER_80, { buyTaxBps: 10001 })).to.be.revertedWithCustomError(
			ctx.factory,
			"InvalidTaxBps",
		);
	});

	it("createLaunch reverts with empty metaCid", async () => {
		const ctx = await deployStack();
		await expect(createLaunch(ctx, TIER_80, { metaCid: "" })).to.be.revertedWithCustomError(
			ctx.factory,
			"EmptyMetaCid",
		);
	});

	it("createLaunch reverts with predictedTokenAddress != CREATE2(salt)", async () => {
		const ctx = await deployStack();
		const wrongPredicted = ethers.getAddress(`0x${"01".repeat(20)}`);
		await expect(createLaunch(ctx, TIER_80, { predictedTokenAddress: wrongPredicted })).to.be.revertedWithCustomError(
			ctx.factory,
			"InvalidPredictedAddress",
		);
	});

	it("createLaunch with same salt twice reverts SaltAlreadyUsed", async () => {
		const ctx = await deployStack();
		const fixedSalt = ethers.id("dup-salt-test");
		await createLaunch(ctx, TIER_80, { salt: fixedSalt });
		await expect(createLaunch(ctx, TIER_80, { salt: fixedSalt })).to.be.revertedWithCustomError(
			ctx.factory,
			"SaltAlreadyUsed",
		);
	});

	// =========================================================================
	// bundle bot attack surface
	// =========================================================================

	it("executeBundle from non-bundleBot reverts NotBundleBot", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { salt, addrs } = await createLaunch(ctx, TIER_80);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		const params = {
			vanitySalt: salt,
			name: ctx.name,
			symbol: ctx.symbol,
			meta: "Qm",
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31536000,
			antiFarmerDuration: 3600,
			commissionReceiver: ctx.creator.address,
			minV2TokensOut: 0,
			tipBnb: 0,
			deadline: (await currentTs()) + 600n,
		};
		await expect(router.connect(alice).executeBundle(params)).to.be.revertedWithCustomError(router, "NotBundleBot");
	});

	it("executeBundle twice reverts AlreadyExecuted", async () => {
		const ctx = await deployStack();
		const { alice, bundleBot, creator } = ctx;
		const { salt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(creator).close();
		const params = {
			vanitySalt: salt,
			name: ctx.name,
			symbol: ctx.symbol,
			meta: "Qm",
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31536000,
			antiFarmerDuration: 3600,
			commissionReceiver: creator.address,
			minV2TokensOut: 0,
			tipBnb: 0,
			deadline: (await currentTs()) + 600n,
		};
		await router.connect(bundleBot).executeBundle(params);
		await expect(router.connect(bundleBot).executeBundle(params)).to.be.revertedWithCustomError(
			router,
			"AlreadyExecuted",
		);
	});

	it("executeBundle after deadline reverts Expired", async () => {
		const ctx = await deployStack();
		const { alice, bundleBot, creator } = ctx;
		const { salt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(creator).close();
		const params = {
			vanitySalt: salt,
			name: ctx.name,
			symbol: ctx.symbol,
			meta: "Qm",
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31536000,
			antiFarmerDuration: 3600,
			commissionReceiver: creator.address,
			minV2TokensOut: 0,
			tipBnb: 0,
			deadline: (await currentTs()) - 1n,
		};
		await expect(router.connect(bundleBot).executeBundle(params)).to.be.revertedWithCustomError(router, "Expired");
	});

	// =========================================================================
	// refund-state edge cases
	// =========================================================================

	it("enableRefundUnderSubscribed before closeTimestamp reverts WindowClosed", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		await expect(vault.connect(alice).enableRefundUnderSubscribed()).to.be.revertedWithCustomError(
			vault,
			"WindowClosed",
		);
	});

	it("enableRefundBundleFailed by non-bundleBot reverts NotBundleBot", async () => {
		const ctx = await deployStack();
		const { alice, creator } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(creator).close();
		await expect(vault.connect(alice).enableRefundBundleFailed()).to.be.revertedWithCustomError(vault, "NotBundleBot");
	});

	it("refund() in non-REFUND state reverts InvalidState", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });
		await expect(vault.connect(alice).refund()).to.be.revertedWithCustomError(vault, "InvalidState");
	});

	it("refund() drains bonusPool exactly via principal == totalDeposited shortcut", async () => {
		const ctx = await deployStack();
		const { alice, bundleBot } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80, { closeTimestamp: (await currentTs()) + 10n });
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		await vault.connect(alice).deposit({ value: ethers.parseEther("4") });

		// Wait for window to close, then enable refund (under-subscribed)
		await advanceTo((await currentTs()) + 20n);
		await vault.connect(alice).enableRefundUnderSubscribed();

		const beforeBal = await ethers.provider.getBalance(alice.address);
		const tx = await vault.connect(alice).refund();
		const r = await tx.wait();
		const gas = r.gasUsed * r.gasPrice;
		const afterBal = await ethers.provider.getBalance(alice.address);

		// Should have received full 4 BNB (no penalty was set, bonusPool=0)
		expect(afterBal + gas - beforeBal).to.equal(ethers.parseEther("4"));
		expect(await vault.totalDeposited()).to.equal(0n);
		expect(await vault.bonusPool()).to.equal(0n);
	});

	// =========================================================================
	// treasury lp
	// =========================================================================

	it("recordManagedToken with zero addr reverts ZeroAddress", async () => {
		const ctx = await deployStack();
		const { addrs } = await createLaunch(ctx, TIER_80);
		const treasury = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);
		await expect(treasury.recordManagedToken(ethers.ZeroAddress)).to.be.revertedWithCustomError(
			treasury,
			"ZeroAddress",
		);
	});

	it("recordManagedToken twice with different tokens reverts MultipleTokens", async () => {
		const ctx = await deployStack();
		const { alice, bob } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const treasury = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);
		await treasury.recordManagedToken(alice.address);
		await expect(treasury.recordManagedToken(bob.address)).to.be.revertedWithCustomError(treasury, "MultipleTokens");
	});

	it("recordManagedToken twice with same token is idempotent (no revert)", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const treasury = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);
		await treasury.recordManagedToken(alice.address);
		await expect(treasury.recordManagedToken(alice.address)).to.not.be.reverted;
	});

	it("sweep by non-owner reverts NotOwner", async () => {
		const ctx = await deployStack();
		const { alice, bob } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const treasury = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);
		await expect(treasury.connect(alice).sweep(bob.address, alice.address, 0)).to.be.revertedWithCustomError(
			treasury,
			"NotOwner",
		);
	});

	it("treasury rejects raw BNB via receive()", async () => {
		const ctx = await deployStack();
		const { alice } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const treasury = await ethers.getContractAt("TreasuryLP", addrs.treasuryLp);
		await expect(
			alice.sendTransaction({ to: addrs.treasuryLp, value: ethers.parseEther("0.1") }),
		).to.be.revertedWithCustomError(treasury, "NoBnbAccepted");
	});

	// =========================================================================
	// pro-rata + math correctness
	// =========================================================================

	it("three depositors get correct pro-rata shares", async () => {
		const ctx = await deployStack();
		const { alice, bob, carol, bundleBot, creator } = ctx;
		const { salt, predicted, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		const a = ethers.parseEther("8");
		const b = ethers.parseEther("5");
		const c = ethers.parseEther("3");
		await vault.connect(alice).deposit({ value: a });
		await vault.connect(bob).deposit({ value: b });
		await vault.connect(carol).deposit({ value: c });
		await vault.connect(creator).close();
		const params = {
			vanitySalt: salt,
			name: ctx.name,
			symbol: ctx.symbol,
			meta: "Qm",
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31536000,
			antiFarmerDuration: 3600,
			commissionReceiver: creator.address,
			minV2TokensOut: 0,
			tipBnb: 0,
			deadline: (await currentTs()) + 600n,
		};
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
	});

	// =========================================================================
	// atomicity guarantee
	// =========================================================================

	it("bundle revert leaves vault BNB intact (atomic EVM rollback)", async () => {
		const ctx = await deployStack();
		const { alice, bundleBot, creator, portal } = ctx;
		const { salt, addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		await vault.connect(creator).close();
		const balBefore = await ethers.provider.getBalance(addrs.vault);
		await portal.setShouldRevert(true);
		const params = {
			vanitySalt: salt,
			name: ctx.name,
			symbol: ctx.symbol,
			meta: "Qm",
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 31536000,
			antiFarmerDuration: 3600,
			commissionReceiver: creator.address,
			minV2TokensOut: 0,
			tipBnb: 0,
			deadline: (await currentTs()) + 600n,
		};
		await expect(router.connect(bundleBot).executeBundle(params)).to.be.reverted;
		// Vault should still be CLOSED (EVM rollback), BNB intact
		expect(await vault.state()).to.equal(1n);
		expect(await ethers.provider.getBalance(addrs.vault)).to.equal(balBefore);
		expect(await router.executed()).to.equal(false);
	});

	// =========================================================================
	// requestLaunch view
	// =========================================================================

	it("requestLaunch returns true only when CLOSED + cap-met", async () => {
		const ctx = await deployStack();
		const { alice, creator } = ctx;
		const { addrs } = await createLaunch(ctx, TIER_80);
		const vault = await ethers.getContractAt("LaunchVault", addrs.vault);
		expect(await vault.requestLaunch()).to.equal(false);
		await vault.connect(alice).deposit({ value: PRESALE_CAPS[TIER_80] });
		expect(await vault.requestLaunch()).to.equal(false);
		await vault.connect(creator).close();
		expect(await vault.requestLaunch()).to.equal(true);
	});
});
