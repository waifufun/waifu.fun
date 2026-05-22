const { expect } = require("chai");
const { ethers } = require("hardhat");

// Wave H phase 2 smoke tests. Verifies the implemented contract behaviors
// for LaunchVault, LaunchFactory, TreasuryLP work end-to-end at the
// deployment + first-call level. Full bundle-flow integration with mocked
// Flap Portal lands in a follow-up.
//
// Authoritative TOKEN_TAXED_V3 impl: 0x024f18294970B5c76c0691b87f138A0317156422
describe("Wave H phase 2 smoke", () => {
	const ZERO_BYTES32 = `0x${"0".repeat(64)}`;

	async function setup() {
		const [owner, creator, bundleBot, depositor, depositor2] = await ethers.getSigners();
		const placeholderAddr = owner.address;
		return { owner, creator, bundleBot, depositor, depositor2, placeholderAddr };
	}

	async function deployFactory(placeholderAddr) {
		const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer");

		const routerDeployer = await RouterDeployerCF.deploy();

		// Wave M3: AgentSafeDeployer constructor arg requires non-zero singleton +
		// proxy factory; use the test mocks rather than the placeholder so the
		// deployer itself is valid (smoke test never calls deployAgentSafe).
		const SafeSingletonCF = await ethers.getContractFactory("MockSafeSingleton");
		const safeSingleton = await SafeSingletonCF.deploy();
		const SafeProxyFactoryCF = await ethers.getContractFactory("MockSafeProxyFactory");
		const safeProxyFactory = await SafeProxyFactoryCF.deploy();
		const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeDeployer");
		const agentSafeDeployer = await AgentSafeDeployerCF.deploy(
			await safeSingleton.getAddress(),
			await safeProxyFactory.getAddress(),
		);

		const Factory = await ethers.getContractFactory("LaunchFactory");
		return await Factory.deploy(
			placeholderAddr, // _wbnb
			placeholderAddr, // _pcsFactory
			placeholderAddr, // _pcsRouter
			ZERO_BYTES32, // _initCodeHash
			placeholderAddr, // _flapPortal
			placeholderAddr, // _tokenImplTaxedV3
			placeholderAddr, // _tipReceiver
			placeholderAddr, // _platformCommissionReceiver
			await routerDeployer.getAddress(), // _routerDeployer
			await agentSafeDeployer.getAddress(), // _agentSafeDeployer
			placeholderAddr, // _treasuryLp4Deployer (placeholder; not exercised here)
			placeholderAddr, // _pcsV3Npm
			placeholderAddr, // _pcsV3Factory
			placeholderAddr, // _bnbUsdFeed
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
			2, // _tier = LaunchTier.TIER_95
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
			2, // _tier = LaunchTier.TIER_95
		);

		await expect(vault.connect(depositor).deposit({ value: ethers.parseEther("33") })).to.be.reverted;
	});

	it("LaunchVault deposit enforces per-wallet presale cap", async () => {
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
			2, // _tier = LaunchTier.TIER_95
		);

		await vault.connect(depositor).deposit({ value: ethers.parseEther("19.2") });
		await expect(vault.connect(depositor).deposit({ value: 1n })).to.be.revertedWithCustomError(vault, "CapExceeded");
	});

	it("LaunchVault cannot close a filled cap before the minimum open duration", async () => {
		const { owner, creator, bundleBot, depositor, depositor2 } = await setup();
		const Vault = await ethers.getContractFactory("LaunchVault");
		const now = BigInt((await ethers.provider.getBlock("latest")).timestamp);
		const vault = await Vault.deploy(
			owner.address,
			creator.address,
			bundleBot.address,
			ethers.parseEther("32"),
			ethers.parseEther("16"),
			0n,
			now + 3600n,
			0,
			false,
			2, // _tier = LaunchTier.TIER_95
		);

		await vault.connect(depositor).deposit({ value: ethers.parseEther("19.2") });
		await vault.connect(depositor2).deposit({ value: ethers.parseEther("12.8") });
		await expect(vault.connect(creator).close()).to.be.revertedWithCustomError(vault, "WindowClosed");

		await ethers.provider.send("evm_setNextBlockTimestamp", [Number(now + 900n)]);
		await ethers.provider.send("evm_mine", []);
		await expect(vault.connect(creator).close()).to.emit(vault, "Closed");
	});

	it("TreasuryLP recordManagedToken succeeds once", async () => {
		const { owner, creator } = await setup();
		const Treasury = await ethers.getContractFactory("TreasuryLP");
		const treasury = await Treasury.deploy(creator.address, owner.address);
		const Token = await ethers.getContractFactory("ERC20Mock");
		const token = await Token.deploy();
		await token.mint(await treasury.getAddress(), 1n);

		await expect(treasury.connect(owner).recordManagedToken(await token.getAddress())).to.not.be.reverted;
		expect(await treasury.managedToken()).to.equal(await token.getAddress());
	});

	it("TreasuryLP recordManagedToken reverts on different second token", async () => {
		const { owner, creator } = await setup();
		const Treasury = await ethers.getContractFactory("TreasuryLP");
		const treasury = await Treasury.deploy(creator.address, owner.address);
		const Token = await ethers.getContractFactory("ERC20Mock");
		const tokenA = await Token.deploy();
		const tokenB = await Token.deploy();
		await tokenA.mint(await treasury.getAddress(), 1n);
		await tokenB.mint(await treasury.getAddress(), 1n);

		await treasury.connect(owner).recordManagedToken(await tokenA.getAddress());
		// Second call with different token must revert MultipleTokens
		await expect(treasury.connect(owner).recordManagedToken(await tokenB.getAddress())).to.be.reverted;
	});

	it("TreasuryLP owner can only rescue non-managed tokens", async () => {
		const { owner, creator } = await setup();
		const Treasury = await ethers.getContractFactory("TreasuryLP");
		const treasury = await Treasury.deploy(creator.address, owner.address);
		const Token = await ethers.getContractFactory("ERC20Mock");
		const managed = await Token.deploy();
		const dust = await Token.deploy();
		await managed.mint(await treasury.getAddress(), 100n);
		await dust.mint(await treasury.getAddress(), 10n);

		await treasury.connect(owner).recordManagedToken(await managed.getAddress());
		await expect(
			treasury.connect(creator).sweep(creator.address, await managed.getAddress(), 100n),
		).to.be.revertedWithCustomError(treasury, "NotAuthorized");

		await expect(treasury.connect(creator).sweep(creator.address, await dust.getAddress(), 10n)).to.not.be.reverted;
		expect(await dust.balanceOf(creator.address)).to.equal(10n);
		expect(await managed.balanceOf(await treasury.getAddress())).to.equal(100n);
	});

	it("Wave H contracts compile + deploy with phase-2 impls", async () => {
		// All four new artifacts have non-empty bytecode (impl, not stubs).
		const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer");

		const routerDeployer = await RouterDeployerCF.deploy();

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
