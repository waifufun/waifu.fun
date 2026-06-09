// Wave M (M1 + M2 + M3) adversarial / edge-case test matrix.
//
// Companion to:
//   - test/wave-m-tax-splitter.test.js (happy paths for M1)
//   - test/wave-m-agent-safe-deployer.test.js (happy paths for M2)
//   - test/wave-m-factory-integration.test.js (happy paths for M3)
//
// Covers the attacker-controlled inputs that are NOT exercised by the
// happy-path suite. Every test should PASS; a failure here means the
// contract violates a defensive invariant we promised mainnet to uphold.

const { expect } = require("chai");
const { ethers } = require("hardhat");

const TIER_80 = 0;

// =====================================================================
// Helpers (mirrors the factory-integration deployStack so we can hit
// the createLaunch path under adversarial inputs).
// =====================================================================

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

async function currentTs() {
	const blk = await ethers.provider.getBlock("latest");
	return BigInt(blk.timestamp);
}

async function deployStack() {
	const [owner, creator, bundleBot, tipReceiver, patron, agentCoOwner, otherUser] = await ethers.getSigners();

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

	const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer");
	const routerDeployer = await RouterDeployerCF.deploy();

	// Wave O.1: TreasuryLP5Deployer (no Chainlink feed)
	const TreasuryDeployerCF = await ethers.getContractFactory("TreasuryLP5Deployer");
	const treasuryLp5Deployer = await TreasuryDeployerCF.deploy();

	const V3FactoryCF = await ethers.getContractFactory("MockV3Factory");
	const mockV3Factory = await V3FactoryCF.deploy();
	const NPMCF = await ethers.getContractFactory("MockNonfungiblePositionManager");
	const mockNpm = await NPMCF.deploy(wbnb);

	const SafeSingletonCF = await ethers.getContractFactory("MockSafeSingleton");
	const safeSingleton = await SafeSingletonCF.deploy();
	const SafeProxyFactoryCF = await ethers.getContractFactory("MockSafeProxyFactory");
	const safeProxyFactory = await SafeProxyFactoryCF.deploy();
	const RolesFactoryCF = await ethers.getContractFactory("MockRolesModuleFactory");
	const rolesFactory = await RolesFactoryCF.deploy();
	const RolesMastercopyCF = await ethers.getContractFactory("MockAgentActionTarget");
	const rolesMastercopy = await RolesMastercopyCF.deploy();
	const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeZodiacDeployer");
	const agentSafeDeployer = await AgentSafeDeployerCF.deploy(
		await safeSingleton.getAddress(),
		await safeProxyFactory.getAddress(),
		await rolesFactory.getAddress(),
		await rolesMastercopy.getAddress(),
	);

	const platformReceiver = creator.address;

	const Factory = await ethers.getContractFactory("LaunchFactory");
	const factory = await Factory.deploy(
		wbnb,
		await pcsFactory.getAddress(),
		await pcsRouter.getAddress(),
		initCodeHash,
		await portal.getAddress(),
		creator.address,
		tipReceiver.address,
		platformReceiver,
		await routerDeployer.getAddress(),
		await agentSafeDeployer.getAddress(),
		await treasuryLp5Deployer.getAddress(),
		await mockNpm.getAddress(),
		await mockV3Factory.getAddress(),
	);

	return {
		owner,
		creator,
		bundleBot,
		tipReceiver,
		patron,
		agentCoOwner,
		otherUser,
		portal,
		factory,
		initCodeHash,
		name,
		symbol,
		agentSafeDeployer,
		safeSingleton,
		safeProxyFactory,
		platformReceiver,
	};
}

function buildConfig(ctx, overrides = {}) {
	const rawSalt = overrides.salt ?? ethers.id(`adv-salt-${Math.random()}`);
	const salt = effectiveSalt(ctx.creator.address, rawSalt);
	return {
		rawSalt,
		salt,
		async config() {
			const predicted = computeCreate2Addr(await ctx.portal.getAddress(), salt, ctx.initCodeHash);
			const closeTimestamp = overrides.closeTimestamp ?? (await currentTs()) + 3600n;
			return {
				name: ctx.name,
				symbol: ctx.symbol,
				metaCid: "QmAdv",
				creator: ctx.creator.address,
				bundleBot: ctx.bundleBot.address,
				tier: TIER_80,
				buyTaxBps: 300,
				sellTaxBps: 300,
				taxDuration: 365 * 24 * 60 * 60,
				antiFarmerDuration: 3600,
				closeTimestamp,
				vanitySalt: rawSalt,
				predictedTokenAddress: overrides.predictedTokenAddress ?? predicted,
				noBurn: false,
				platformReceiver: overrides.platformReceiver ?? ctx.platformReceiver,
				patron: overrides.patron ?? ctx.patron.address,
				agentSafeOwners: overrides.agentSafeOwners ?? [ctx.creator.address],
				agentSafeThreshold: overrides.agentSafeThreshold ?? 1,
				platformBps: overrides.platformBps ?? 1000,
				patronBps: overrides.patronBps ?? 2500,
				agentEoa: overrides.agentEoa ?? ethers.ZeroAddress,
				roleConfigCalls: overrides.roleConfigCalls ?? [],
				treasuryTickLowers: overrides.treasuryTickLowers ?? [2000, 6000, 10000, 14000],
				treasuryTickUppers: overrides.treasuryTickUppers ?? [4000, 8000, 12000, 16000],
			};
		},
	};
}

// =====================================================================
// TaxSplitter adversarial scenarios
// =====================================================================

describe("Wave M adversarial :: TaxSplitter", () => {
	let owner;
	let platform;
	let patron;
	let agent;
	let other;

	beforeEach(async () => {
		[owner, platform, patron, agent, other] = await ethers.getSigners();
	});

	it("RevertingRecipient: native split reverts atomically when any recipient reverts", async () => {
		const Splitter = await ethers.getContractFactory("TaxSplitter");
		const RejecterCF = await ethers.getContractFactory("BnbRejecter");
		const rejecter = await RejecterCF.deploy();

		// Put rejecter as the platform. Any split() should revert before other recipients
		// are paid. Atomic-revert is the documented behavior (NativeTransferFailed).
		const s = await Splitter.deploy(await rejecter.getAddress(), patron.address, agent.address, 1000, 2500);
		await owner.sendTransaction({ to: await s.getAddress(), value: ethers.parseEther("10") });

		const patronBefore = await ethers.provider.getBalance(patron.address);
		const agentBefore = await ethers.provider.getBalance(agent.address);

		await expect(s.split()).to.be.revertedWithCustomError(s, "NativeTransferFailed");

		const patronAfter = await ethers.provider.getBalance(patron.address);
		const agentAfter = await ethers.provider.getBalance(agent.address);
		expect(patronAfter).to.equal(patronBefore);
		expect(agentAfter).to.equal(agentBefore);
		// All the funds are still inside the splitter.
		expect(await ethers.provider.getBalance(await s.getAddress())).to.equal(ethers.parseEther("10"));
	});

	it("ReentrantRecipient: recursive split() inside receive() is bounded; no inflation possible", async () => {
		const Splitter = await ethers.getContractFactory("TaxSplitter");
		const ReentrantCF = await ethers.getContractFactory("ReentrantReceiver");
		const reentrant = await ReentrantCF.deploy();

		// Reentrant is the platform; it tries to recursively call split() during receive().
		const s = await Splitter.deploy(await reentrant.getAddress(), patron.address, agent.address, 1000, 2500);
		await reentrant.setTarget(await s.getAddress());

		const seed = ethers.parseEther("5");
		await owner.sendTransaction({ to: await s.getAddress(), value: seed });

		// Outer split() snapshots balance and computes the OUTER patron/agent
		// amounts. The reentrant receive() at the platform leg consumes more BNB
		// via an inner split. When the OUTER call returns to send patron, the
		// splitter is drained below the snapshotted patron amount, so the leg
		// reverts NativeTransferFailed. The whole tx reverts atomically — NO
		// double-pay can happen, NO funds can be created. That is the safety
		// property we care about.
		await expect(s.split()).to.be.revertedWithCustomError(s, "NativeTransferFailed");

		// Splitter still holds the seed; no inflation, no loss.
		expect(await ethers.provider.getBalance(await s.getAddress())).to.equal(seed);
		// Reentrant contract never received any funds because the outer tx reverted.
		expect(await ethers.provider.getBalance(await reentrant.getAddress())).to.equal(0);
	});

	it("SplitterCollision: deploying two splitters via the same factory works because address depends on creator nonce", async () => {
		// Plain `new` (CREATE) bumps the deployer's nonce, so two consecutive deploys
		// land on distinct addresses; the splitter contract has no CREATE2 path.
		const Splitter = await ethers.getContractFactory("TaxSplitter");
		const a = await Splitter.deploy(platform.address, patron.address, agent.address, 1000, 2500);
		const b = await Splitter.deploy(platform.address, patron.address, agent.address, 1000, 2500);
		expect(await a.getAddress()).to.not.equal(await b.getAddress());
	});

	it("TaxFlowAdversarial: patron == DEAD still routes platform + agent slices correctly", async () => {
		const Splitter = await ethers.getContractFactory("TaxSplitter");
		const dead = "0x000000000000000000000000000000000000dEaD";
		const s = await Splitter.deploy(platform.address, dead, agent.address, 1000, 2500);

		const seed = ethers.parseEther("100");
		await owner.sendTransaction({ to: await s.getAddress(), value: seed });

		const platformBefore = await ethers.provider.getBalance(platform.address);
		const agentBefore = await ethers.provider.getBalance(agent.address);
		const deadBefore = await ethers.provider.getBalance(dead);

		await s.split();

		expect((await ethers.provider.getBalance(platform.address)) - platformBefore).to.equal(seed / 10n);
		expect((await ethers.provider.getBalance(dead)) - deadBefore).to.equal((seed * 25n) / 100n);
		expect((await ethers.provider.getBalance(agent.address)) - agentBefore).to.equal((seed * 65n) / 100n);
	});

	it("splitMany cannot drain native via a re-entry into split() across token loop", async () => {
		// splitMany does not call split() so this is a pure positive test:
		// loop runs to completion across multiple ERC20s without touching native.
		const Splitter = await ethers.getContractFactory("TaxSplitter");
		const ERC = await ethers.getContractFactory("ERC20Mock");
		const tokA = await ERC.deploy();
		const tokB = await ERC.deploy();
		const s = await Splitter.deploy(platform.address, patron.address, agent.address, 1000, 2500);
		await tokA.mint(await s.getAddress(), 1000n);
		await tokB.mint(await s.getAddress(), 2000n);
		await owner.sendTransaction({ to: await s.getAddress(), value: ethers.parseEther("1") });

		await s.splitMany([await tokA.getAddress(), await tokB.getAddress()]);

		// native untouched by splitMany.
		expect(await ethers.provider.getBalance(await s.getAddress())).to.equal(ethers.parseEther("1"));
		// token sides drained.
		expect(await tokA.balanceOf(await s.getAddress())).to.equal(0);
		expect(await tokB.balanceOf(await s.getAddress())).to.equal(0);
	});
});

// =====================================================================
// AgentSafeDeployer adversarial scenarios
// =====================================================================

describe("Wave M adversarial :: AgentSafeDeployer", () => {
	let owner;
	let attacker;

	beforeEach(async () => {
		[owner, attacker] = await ethers.getSigners();
	});

	async function deployBare() {
		const SafeSingletonCF = await ethers.getContractFactory("MockSafeSingleton");
		const singleton = await SafeSingletonCF.deploy();
		const SafeProxyFactoryCF = await ethers.getContractFactory("MockSafeProxyFactory");
		const factory = await SafeProxyFactoryCF.deploy();
		const Dep = await ethers.getContractFactory("AgentSafeDeployer");
		const deployer = await Dep.deploy(await singleton.getAddress(), await factory.getAddress());
		return { singleton, factory, deployer };
	}

	it("MaliciousSafeOwner: 2/2 safe with one griefing owner — funds are locked (known Safe limitation)", async () => {
		// Deploy a 2/2 safe; document that without both signers, any funds sent
		// to the safe are unreachable. We do NOT attempt to recover; the test
		// asserts the Safe correctly enforces threshold=2.
		const { deployer } = await deployBare();
		const safe = await deployer.deployAgentSafe.staticCall([owner.address, attacker.address], 2, 1);
		await deployer.deployAgentSafe([owner.address, attacker.address], 2, 1);
		const SafeI = await ethers.getContractAt("MockSafeSingleton", safe);
		expect(await SafeI.getThreshold()).to.equal(2);
		expect((await SafeI.getOwners()).length).to.equal(2);
	});

	it("CREATE2 collision: redeploy same (owners, threshold, saltNonce) reverts cleanly", async () => {
		const { deployer } = await deployBare();
		await deployer.deployAgentSafe([owner.address], 1, 42);
		await expect(deployer.deployAgentSafe([owner.address], 1, 42)).to.be.reverted;
	});

	it("Predicted address matches actual for 1/1 / 1/2 / 2/2 / 2/3 / 3/3 shapes", async () => {
		const { deployer } = await deployBare();
		const shapes = [
			{ owners: [owner.address], threshold: 1, salt: 1 },
			{ owners: [owner.address, attacker.address], threshold: 1, salt: 2 },
			{ owners: [owner.address, attacker.address], threshold: 2, salt: 3 },
			{
				owners: [owner.address, attacker.address, "0x000000000000000000000000000000000000beef"],
				threshold: 2,
				salt: 4,
			},
			{
				owners: [owner.address, attacker.address, "0x000000000000000000000000000000000000beef"],
				threshold: 3,
				salt: 5,
			},
		];
		for (const s of shapes) {
			const predicted = await deployer.predictAgentSafe(s.owners, s.threshold, s.salt);
			const actual = await deployer.deployAgentSafe.staticCall(s.owners, s.threshold, s.salt);
			expect(actual).to.equal(predicted);
			await deployer.deployAgentSafe(s.owners, s.threshold, s.salt);
		}
	});

	it("Empty owner list reverts InvalidOwners", async () => {
		const { deployer } = await deployBare();
		await expect(deployer.deployAgentSafe([], 1, 1)).to.be.revertedWithCustomError(deployer, "InvalidOwners");
	});

	it("Threshold > owner count reverts InvalidThreshold", async () => {
		const { deployer } = await deployBare();
		await expect(deployer.deployAgentSafe([owner.address], 2, 1)).to.be.revertedWithCustomError(
			deployer,
			"InvalidThreshold",
		);
	});

	it("Zero threshold reverts InvalidThreshold", async () => {
		const { deployer } = await deployBare();
		await expect(deployer.deployAgentSafe([owner.address], 0, 1)).to.be.revertedWithCustomError(
			deployer,
			"InvalidThreshold",
		);
	});

	it("Deployer is NEVER an owner of the resulting Safe", async () => {
		const { deployer } = await deployBare();
		const safeAddr = await deployer.deployAgentSafe.staticCall([owner.address, attacker.address], 2, 99);
		await deployer.deployAgentSafe([owner.address, attacker.address], 2, 99);
		const safe = await ethers.getContractAt("MockSafeSingleton", safeAddr);
		const owners = await safe.getOwners();
		expect(owners).to.not.include(await deployer.getAddress());
	});
});

// =====================================================================
// LaunchFactory adversarial scenarios
// =====================================================================

describe("Wave M adversarial :: LaunchFactory", () => {
	it("FactoryGriefing: front-run with same vanitySalt from different EOA does NOT collide (creator-scoped salt)", async () => {
		const ctx = await deployStack();
		const sharedSalt = ethers.id("front-run");

		// creator deploys first.
		const builder1 = buildConfig(ctx, { salt: sharedSalt });
		const cfg1 = await builder1.config();
		await ctx.factory.connect(ctx.creator).createLaunch(cfg1);

		// otherUser tries the same vanitySalt. Different effectiveSalt (creator-scoped).
		const builder2 = buildConfig(
			{ ...ctx, creator: ctx.otherUser, platformReceiver: ctx.platformReceiver },
			{ salt: sharedSalt },
		);
		const cfg2 = await builder2.config();
		// re-target predictedTokenAddress to ctx.otherUser scope.
		const otherScopedSalt = effectiveSalt(ctx.otherUser.address, sharedSalt);
		const predictedForOther = computeCreate2Addr(await ctx.portal.getAddress(), otherScopedSalt, ctx.initCodeHash);
		cfg2.creator = ctx.otherUser.address;
		cfg2.predictedTokenAddress = predictedForOther;
		// The factory enforces msg.sender == creator and creator-scoped salt; the
		// other EOA cannot brick or hijack the creator's namespace.
		await ctx.factory.connect(ctx.otherUser).createLaunch(cfg2);
		expect((await ctx.factory.launches(predictedForOther)).vault).to.not.equal(ethers.ZeroAddress);
	});

	it("Same creator + same vanitySalt: second createLaunch reverts SaltAlreadyUsed", async () => {
		const ctx = await deployStack();
		const sharedSalt = ethers.id("dup-salt");
		const builder1 = buildConfig(ctx, { salt: sharedSalt });
		const cfg1 = await builder1.config();
		await ctx.factory.connect(ctx.creator).createLaunch(cfg1);

		const builder2 = buildConfig(ctx, { salt: sharedSalt });
		const cfg2 = await builder2.config();
		await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg2)).to.be.revertedWithCustomError(
			ctx.factory,
			"SaltAlreadyUsed",
		);
	});

	it("msg.sender != config.creator reverts NotCreator", async () => {
		const ctx = await deployStack();
		const builder = buildConfig(ctx);
		const cfg = await builder.config();
		await expect(ctx.factory.connect(ctx.otherUser).createLaunch(cfg)).to.be.revertedWithCustomError(
			ctx.factory,
			"NotCreator",
		);
	});

	it("platformReceiver != factory.platformCommissionReceiver reverts InvalidPlatformReceiver", async () => {
		const ctx = await deployStack();
		const builder = buildConfig(ctx, { platformReceiver: ctx.otherUser.address });
		const cfg = await builder.config();
		await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
			ctx.factory,
			"InvalidPlatformReceiver",
		);
	});

	it("patron == zero reverts InvalidPatron", async () => {
		const ctx = await deployStack();
		const builder = buildConfig(ctx, { patron: ethers.ZeroAddress });
		const cfg = await builder.config();
		await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
			ctx.factory,
			"InvalidPatron",
		);
	});

	it("Predicted token address mismatch reverts InvalidPredictedAddress", async () => {
		const ctx = await deployStack();
		const builder = buildConfig(ctx, {
			predictedTokenAddress: ethers.getAddress("0xdead000000000000000000000000000000000001"),
		});
		const cfg = await builder.config();
		await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
			ctx.factory,
			"InvalidPredictedAddress",
		);
	});

	it("agentSafeThreshold == 0 reverts InvalidAgentSafeConfig", async () => {
		const ctx = await deployStack();
		const builder = buildConfig(ctx, { agentSafeThreshold: 0 });
		const cfg = await builder.config();
		await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
			ctx.factory,
			"InvalidAgentSafeConfig",
		);
	});

	it("Empty agentSafeOwners reverts InvalidAgentSafeConfig", async () => {
		const ctx = await deployStack();
		const builder = buildConfig(ctx, { agentSafeOwners: [] });
		const cfg = await builder.config();
		await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
			ctx.factory,
			"InvalidAgentSafeConfig",
		);
	});

	it("Tax-flow rerouting attack: launchParamsHash binds router to splitter; bundle bot cannot swap commissionReceiver", async () => {
		const ctx = await deployStack();
		const builder = buildConfig(ctx);
		const cfg = await builder.config();
		const addrs = await ctx.factory.connect(ctx.creator).createLaunch.staticCall(cfg);
		await ctx.factory.connect(ctx.creator).createLaunch(cfg);

		const router = await ethers.getContractAt("BundleRouter", addrs.router);
		const realHash = await router.launchParamsHash();
		const expected = await ctx.factory.launchParamsHash(cfg, addrs.taxSplitter);
		expect(realHash).to.equal(expected);

		// Any commissionReceiver other than the splitter produces a different
		// launchParamsHash and would fail BundleRouter's hash gate.
		for (const evil of [ctx.otherUser.address, ctx.bundleBot.address, ctx.creator.address]) {
			const wrong = await ctx.factory.launchParamsHash(cfg, evil);
			expect(realHash).to.not.equal(wrong);
		}
	});
});
