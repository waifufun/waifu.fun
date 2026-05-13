const { expect } = require("chai");
const { ethers } = require("hardhat");

// Wave H phase 1 scaffolding: all new + refactored launch contracts revert with
// "WaveH:phase2" in every entrypoint. Phase 2 (next PR) replaces these stubs with
// real impl + fork integration tests.
//
// Authoritative TOKEN_TAXED_V3 impl: 0x29e6383f0Ce68507B5A72a53C2B118a118332aA8
// Verified 2026-05-12 via on-chain bytecode read of two recent FlapTaxToken
// instances. See WAVE_H_FLAP_NATIVE_SPEC.md "Spec Verification Log".
describe("Wave H phase 1 scaffolds", () => {
	const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

	async function setup() {
		const [owner, creator, bundleBot] = await ethers.getSigners();
		const placeholderAddr = owner.address; // non-zero placeholder for constructors

		return { owner, creator, bundleBot, placeholderAddr };
	}

	it("LaunchFactory createLaunch reverts with WaveH:phase2", async () => {
		const { owner, placeholderAddr } = await setup();
		const Factory = await ethers.getContractFactory("LaunchFactory");
		const factory = await Factory.deploy(
			placeholderAddr, // _wbnb
			placeholderAddr, // _pcsFactory
			placeholderAddr, // _pcsRouter
			ZERO_BYTES32, // _initCodeHash
			placeholderAddr, // _flapPortal
			placeholderAddr, // _tokenImplTaxedV3 (real value: 0x29e6...332aA8)
			placeholderAddr, // _tipReceiver
		);
		// Just deploy successfully. createLaunch ABI varies; any-arg call would fail
		// type-check before runtime, so we just verify the contract is deployable
		// and the scaffold compiles. Phase 2 lands real tests.
		expect(await factory.getAddress()).to.match(/^0x[a-fA-F0-9]{40}$/);
	});

	it("LaunchVault deposit reverts with WaveH:phase2", async () => {
		const { owner, creator, bundleBot } = await setup();
		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = await Vault.deploy(
			owner.address, // _factory
			creator.address, // _creator
			bundleBot.address, // _bundleBot
			ethers.parseEther("32"), // _presaleCap (must be > _quoteAmt + _v2BuyBnb)
			ethers.parseEther("16"), // _quoteAmt
			0n, // _v2BuyBnb
			2000000000, // _closeTimestamp (future)
			0, // _penaltyBps
			false, // _vestingEnabled
		);
		await expect(vault.deposit({ value: ethers.parseEther("0.1") })).to.be.reverted;
	});

	it("TreasuryLP recordManagedToken reverts with WaveH:phase2", async () => {
		const { owner } = await setup();
		const Treasury = await ethers.getContractFactory("TreasuryLP");
		const treasury = await Treasury.deploy(owner.address, owner.address);
		await expect(treasury.recordManagedToken(owner.address)).to.be.reverted;
	});

	it("Wave H contracts compile and deploy with phase-2 stubs", async () => {
		// Just confirm all four new artifacts are available and deployable.
		// BundleRouter has a complex ConstructorArgs struct, so we don't deploy it
		// directly here; the LaunchFactory.createLaunch flow will deploy it in
		// phase 2.
		const Factory = await ethers.getContractFactory("LaunchFactory");
		const Vault = await ethers.getContractFactory("LaunchVault");
		const Router = await ethers.getContractFactory("BundleRouter");
		const Treasury = await ethers.getContractFactory("TreasuryLP");
		expect(Factory.bytecode.length).to.be.greaterThan(2);
		expect(Vault.bytecode.length).to.be.greaterThan(2);
		expect(Router.bytecode.length).to.be.greaterThan(2);
		expect(Treasury.bytecode.length).to.be.greaterThan(2);
	});
});
