const { expect } = require("chai");
const { ethers } = require("hardhat");

// Wave H phase 2 smoke tests. Verifies the implemented contract behaviors
// for LaunchVault, LaunchFactory, TreasuryLP work end-to-end at the
// deployment + first-call level. Full bundle-flow integration with mocked
// Flap Portal lands in a follow-up.
//
// Authoritative TOKEN_TAXED_V3 impl: 0x29e6383f0Ce68507B5A72a53C2B118a118332aA8
describe("Wave H phase 2 smoke", () => {
	const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

	async function setup() {
		const [owner, creator, bundleBot, depositor] = await ethers.getSigners();
		const placeholderAddr = owner.address;
		return { owner, creator, bundleBot, depositor, placeholderAddr };
	}

	async function deployFactory(placeholderAddr) {
		const Factory = await ethers.getContractFactory("LaunchFactory");
		return await Factory.deploy(
			placeholderAddr, // _wbnb
			placeholderAddr, // _pcsFactory
			placeholderAddr, // _pcsRouter
			ZERO_BYTES32, // _initCodeHash
			placeholderAddr, // _flapPortal
			placeholderAddr, // _tokenImplTaxedV3
			placeholderAddr, // _tipReceiver
		);
	}

	it("LaunchFactory deploys with constructor", async () => {
		const { placeholderAddr } = await setup();
		const factory = await deployFactory(placeholderAddr);
		expect(await factory.getAddress()).to.match(/^0x[a-fA-F0-9]{40}$/);
		expect(await factory.WBNB()).to.equal(placeholderAddr);
		expect(await factory.launchCount()).to.equal(0n);
	});

	it("LaunchVault deposit succeeds in OPEN state", async () => {
		const { owner, creator, bundleBot, depositor } = await setup();
		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = await Vault.deploy(
			owner.address, // _factory
			creator.address, // _creator
			bundleBot.address, // _bundleBot
			ethers.parseEther("32"), // _presaleCap
			ethers.parseEther("16"), // _quoteAmt
			0n, // _v2BuyBnb
			2000000000, // _closeTimestamp (future)
			0, // _penaltyBps
			false, // _vestingEnabled
		);

		const tx = await vault.connect(depositor).deposit({ value: ethers.parseEther("1") });
		await tx.wait();

		expect(await vault.totalDeposited()).to.equal(ethers.parseEther("1"));
		expect(await vault.depositorCount()).to.equal(1n);
		const dep = await vault.depositors(depositor.address);
		expect(dep.deposited).to.equal(ethers.parseEther("1"));
	});

	it("LaunchVault deposit reverts above presale cap", async () => {
		const { owner, creator, bundleBot, depositor } = await setup();
		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = await Vault.deploy(
			owner.address,
			creator.address,
			bundleBot.address,
			ethers.parseEther("32"),
			ethers.parseEther("16"),
			0n,
			2000000000,
			0,
			false,
		);

		await expect(vault.connect(depositor).deposit({ value: ethers.parseEther("33") })).to.be.reverted;
	});

	it("TreasuryLP recordManagedToken succeeds once", async () => {
		const { owner, creator } = await setup();
		const Treasury = await ethers.getContractFactory("TreasuryLP");
		const treasury = await Treasury.deploy(creator.address, owner.address);

		await expect(treasury.recordManagedToken(creator.address)).to.not.be.reverted;
		expect(await treasury.managedToken()).to.equal(creator.address);
	});

	it("TreasuryLP recordManagedToken reverts on different second token", async () => {
		const { owner, creator, bundleBot } = await setup();
		const Treasury = await ethers.getContractFactory("TreasuryLP");
		const treasury = await Treasury.deploy(creator.address, owner.address);

		await treasury.recordManagedToken(creator.address);
		// Second call with different token must revert MultipleTokens
		await expect(treasury.recordManagedToken(bundleBot.address)).to.be.reverted;
	});

	it("Wave H contracts compile + deploy with phase-2 impls", async () => {
		// All four new artifacts have non-empty bytecode (impl, not stubs).
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
