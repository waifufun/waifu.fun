// Wave M3: LaunchFactory integration tests.
//
// Verifies that LaunchFactory.createLaunch deploys the full quintet
// (vault, router, treasuryLp, taxSplitter, agentSafe), wires the splitter
// into BundleRouter.commissionReceiver, and enforces the new validation
// (platformBps bounds, agent safe threshold, patron != zero, etc.).
//
// Uses the same MockFlapPortalCREATE2 + MockSafeProxyFactory mocks as the
// rest of the wave H/M suite so it runs against the in-process hardhat node
// without a BSC fork.

const { expect } = require("chai");
const { ethers } = require("hardhat");

const TIER_80 = 0;
const MAX_TICK_PCS_V3_1PCT = 887200;

const SAFE_ABI = [
	"function getModulesPaginated(address start,uint256 pageSize) view returns (address[] array,address next)",
	"function isModuleEnabled(address module) view returns (bool)",
];

const ROLES_ABI = [
	"function memberOf(address module,bytes32 role) view returns (bool)",
	"function scopedFunction(bytes32 role,address target,bytes4 selector) view returns (bool)",
	"function assignRoles(address module,bytes32[] roleKeys,bool[] memberOf)",
	"function scopeFunction(bytes32 roleKey,address targetAddress,bytes4 functionSig,uint8[] options,bytes conditions,uint8 executionOptions)",
	"function execTransactionWithRole(address to,uint256 value,bytes data,uint8 operation,bytes32 role,bool shouldRevert) returns (bool)",
	"error NotAllowed()",
];

const CLAIM_REWARDS_SELECTOR = "0x372500ab";
const WITHDRAW_FUNDS_SELECTOR = "0xb60d4288";
const SENTINEL_MODULES = "0x0000000000000000000000000000000000000001";

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
	const ActionTargetCF = await ethers.getContractFactory("MockAgentActionTarget");
	const actionTarget = await ActionTargetCF.deploy();
	const AgentSafeDeployerCF = await ethers.getContractFactory("AgentSafeZodiacDeployer");
	const agentSafeDeployer = await AgentSafeDeployerCF.deploy(
		await safeSingleton.getAddress(),
		await safeProxyFactory.getAddress(),
		await rolesFactory.getAddress(),
		await actionTarget.getAddress(),
	);

	// Platform receiver doubles as platformCommissionReceiver immutable.
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
		rolesFactory,
		actionTarget,
		safeSingleton,
		safeProxyFactory,
		platformReceiver,
	};
}

function buildConfig(ctx, overrides = {}) {
	const rawSalt = overrides.salt ?? ethers.id(`m3-salt-${Math.random()}`);
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
				metaCid: "QmM3",
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

describe("Wave M3 :: LaunchFactory + TaxSplitter + AgentSafe integration", () => {
	describe("happy path", () => {
		it("createLaunch deploys all 5 contracts and records their addresses", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx);
			const cfg = await builder.config();
			const addrs = await ctx.factory.connect(ctx.creator).createLaunch.staticCall(cfg);
			await (await ctx.factory.connect(ctx.creator).createLaunch(cfg)).wait();

			for (const k of ["vault", "router", "treasuryLp", "taxSplitter", "agentSafe", "predictedTokenAddress"]) {
				expect(addrs[k], `${k} must not be zero`).to.not.equal(ethers.ZeroAddress);
				const code = await ethers.provider.getCode(addrs[k]);
				if (k === "predictedTokenAddress") continue; // token not deployed until executeBundle
				expect(code, `${k} must have bytecode`).to.not.equal("0x");
			}

			// launches(token) returns the full quintet, keyed by predicted token.
			const stored = await ctx.factory.launches(addrs.predictedTokenAddress);
			expect(stored.vault).to.equal(addrs.vault);
			expect(stored.router).to.equal(addrs.router);
			expect(stored.treasuryLp).to.equal(addrs.treasuryLp);
			expect(stored.taxSplitter).to.equal(addrs.taxSplitter);
			expect(stored.agentSafe).to.equal(addrs.agentSafe);
		});

		it("BundleRouter.commissionReceiver bound via launchParamsHash == TaxSplitter address", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx);
			const cfg = await builder.config();
			const addrs = await ctx.factory.connect(ctx.creator).createLaunch.staticCall(cfg);
			await (await ctx.factory.connect(ctx.creator).createLaunch(cfg)).wait();

			// Off-chain: recompute launchParamsHash using the splitter address and
			// verify it matches what BundleRouter stored as its immutable.
			const expected = await ctx.factory.launchParamsHash(cfg, addrs.taxSplitter);
			const router = await ethers.getContractAt("BundleRouter", addrs.router);
			expect(await router.launchParamsHash()).to.equal(expected);

			// Negative: hashing with any other commissionReceiver value must NOT match.
			const wrong = await ctx.factory.launchParamsHash(cfg, ctx.creator.address);
			expect(await router.launchParamsHash()).to.not.equal(wrong);
		});

		it("TaxSplitter is configured with platform / patron / agent + bps", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, { platformBps: 1500, patronBps: 3000 });
			const cfg = await builder.config();
			const addrs = await ctx.factory.connect(ctx.creator).createLaunch.staticCall(cfg);
			await (await ctx.factory.connect(ctx.creator).createLaunch(cfg)).wait();

			const splitter = await ethers.getContractAt("TaxSplitter", addrs.taxSplitter);
			expect(await splitter.platform()).to.equal(ctx.platformReceiver);
			expect(await splitter.patron()).to.equal(ctx.patron.address);
			expect(await splitter.agent()).to.equal(addrs.agentSafe);
			expect(await splitter.platformBps()).to.equal(1500);
			expect(await splitter.patronBps()).to.equal(3000);
			expect(await splitter.agentBps()).to.equal(10000 - 1500 - 3000);
		});

		it("createLaunch deploys a Zodiac-constrained AgentSafe through the real factory", async () => {
			const ctx = await deployStack();
			const agentRole = await ctx.agentSafeDeployer.AGENT_ROLE();
			const rolesInterface = new ethers.Interface(ROLES_ABI);
			const roleConfigCalls = [
				rolesInterface.encodeFunctionData("assignRoles", [ctx.bundleBot.address, [agentRole], [true]]),
				rolesInterface.encodeFunctionData("scopeFunction", [
					agentRole,
					await ctx.actionTarget.getAddress(),
					CLAIM_REWARDS_SELECTOR,
					[1],
					"0x",
					0,
				]),
			];
			const cfg = await buildConfig(ctx, {
				agentEoa: ctx.bundleBot.address,
				roleConfigCalls,
			}).config();

			const addrs = await ctx.factory.connect(ctx.creator).createLaunch.staticCall(cfg);
			await (await ctx.factory.connect(ctx.creator).createLaunch(cfg)).wait();

			const safe = new ethers.Contract(addrs.agentSafe, SAFE_ABI, ethers.provider);
			const [modules, next] = await safe.getModulesPaginated(SENTINEL_MODULES, 10);
			expect(modules.length).to.equal(1);
			expect(next).to.equal(SENTINEL_MODULES);
			const rolesAddress = modules[0];
			expect(await safe.isModuleEnabled(rolesAddress)).to.equal(true);

			const rolesRead = new ethers.Contract(rolesAddress, ROLES_ABI, ethers.provider);
			expect(await rolesRead.memberOf(ctx.bundleBot.address, agentRole)).to.equal(true);
			expect(
				await rolesRead.scopedFunction(agentRole, await ctx.actionTarget.getAddress(), CLAIM_REWARDS_SELECTOR),
			).to.equal(true);
			expect(
				await rolesRead.scopedFunction(agentRole, await ctx.actionTarget.getAddress(), WITHDRAW_FUNDS_SELECTOR),
			).to.equal(false);

			const rolesAsAgent = new ethers.Contract(rolesAddress, ROLES_ABI, ctx.bundleBot);
			await expect(
				rolesAsAgent.execTransactionWithRole(
					await ctx.actionTarget.getAddress(),
					0,
					ctx.actionTarget.interface.encodeFunctionData("claimRewards"),
					0,
					agentRole,
					true,
				),
			).to.not.be.reverted;
			expect(await ctx.actionTarget.allowedCalls()).to.equal(1n);

			await expect(
				rolesAsAgent.execTransactionWithRole(
					await ctx.actionTarget.getAddress(),
					0,
					ctx.actionTarget.interface.encodeFunctionData("withdrawFunds"),
					0,
					agentRole,
					true,
				),
			).to.be.revertedWithCustomError(rolesAsAgent, "NotAllowed");
			expect(await ctx.actionTarget.gatedCalls()).to.equal(0n);
		});

		it("AgentSafe has the configured owners and threshold", async () => {
			const ctx = await deployStack();
			const owners = [ctx.creator.address, ctx.agentCoOwner.address];
			const builder = buildConfig(ctx, {
				agentSafeOwners: owners,
				agentSafeThreshold: 2,
			});
			const cfg = await builder.config();
			const addrs = await ctx.factory.connect(ctx.creator).createLaunch.staticCall(cfg);
			await (await ctx.factory.connect(ctx.creator).createLaunch(cfg)).wait();

			// MockSafeProxy delegatecalls into MockSafeSingleton; cast to singleton ABI.
			const safe = await ethers.getContractAt("MockSafeSingleton", addrs.agentSafe);
			expect(await safe.getThreshold()).to.equal(2);
			const safeOwners = await safe.getOwners();
			expect([...safeOwners]).to.deep.equal(owners);
			expect(await safe.isOwner(ctx.creator.address)).to.equal(true);
			expect(await safe.isOwner(ctx.agentCoOwner.address)).to.equal(true);
			expect(await safe.isOwner(ctx.otherUser.address)).to.equal(false);
		});

		it("emits LaunchCreated with the new addresses", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx);
			const cfg = await builder.config();
			const addrs = await ctx.factory.connect(ctx.creator).createLaunch.staticCall(cfg);
			const tx = await ctx.factory.connect(ctx.creator).createLaunch(cfg);
			const receipt = await tx.wait();

			const launchCreatedTopic = ctx.factory.interface.getEvent("LaunchCreated").topicHash;
			const log = receipt.logs.find((l) => l.topics[0] === launchCreatedTopic);
			expect(log, "LaunchCreated event must be emitted").to.not.equal(undefined);
			const parsed = ctx.factory.interface.parseLog(log);
			expect(parsed.args.taxSplitter).to.equal(addrs.taxSplitter);
			expect(parsed.args.agentSafe).to.equal(addrs.agentSafe);
			expect(parsed.args.creator).to.equal(ctx.creator.address);
			expect(parsed.args.predictedToken).to.equal(addrs.predictedTokenAddress);
		});
	});

	describe("validation", () => {
		it("reverts InvalidPlatformReceiver on zero", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, { platformReceiver: ethers.ZeroAddress });
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidPlatformReceiver",
			);
		});

		it("reverts InvalidPlatformReceiver when not equal to immutable", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, { platformReceiver: ctx.otherUser.address });
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidPlatformReceiver",
			);
		});

		it("reverts InvalidPatron on zero", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, { patron: ethers.ZeroAddress });
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidPatron",
			);
		});

		it("reverts InvalidPlatformBps below 1000 (10% floor)", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, { platformBps: 999 });
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidPlatformBps",
			);
		});

		it("reverts InvalidPlatformBps above 5000 (50% ceiling)", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, { platformBps: 5001 });
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidPlatformBps",
			);
		});

		it("reverts InvalidPlatformBps when platform + patron > 10000", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, { platformBps: 5000, patronBps: 5001 });
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidPlatformBps",
			);
		});

		it("reverts InvalidAgentSafeConfig on empty owners", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, { agentSafeOwners: [] });
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidAgentSafeConfig",
			);
		});

		it("reverts InvalidAgentSafeConfig on threshold zero", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, { agentSafeThreshold: 0 });
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidAgentSafeConfig",
			);
		});

		it("reverts InvalidAgentSafeConfig on threshold > owners.length", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, {
				agentSafeOwners: [ctx.creator.address],
				agentSafeThreshold: 2,
			});
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidAgentSafeConfig",
			);
		});

		it("accepts all uppers = MAX_TICK_PCS_V3_1PCT", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, {
				treasuryTickUppers: [MAX_TICK_PCS_V3_1PCT, MAX_TICK_PCS_V3_1PCT, MAX_TICK_PCS_V3_1PCT, MAX_TICK_PCS_V3_1PCT],
			});
			const cfg = await builder.config();
			const addrs = await ctx.factory.connect(ctx.creator).createLaunch.staticCall(cfg);
			await (await ctx.factory.connect(ctx.creator).createLaunch(cfg)).wait();
			expect(addrs.treasuryLp).to.not.equal(ethers.ZeroAddress);
		});

		it("accepts tier[1].lower < tier[0].upper", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, {
				treasuryTickLowers: [2000, 2000, 10000, 14000],
				treasuryTickUppers: [4000, 8000, 12000, 16000],
			});
			const cfg = await builder.config();
			const addrs = await ctx.factory.connect(ctx.creator).createLaunch.staticCall(cfg);
			await (await ctx.factory.connect(ctx.creator).createLaunch(cfg)).wait();
			expect(addrs.treasuryLp).to.not.equal(ethers.ZeroAddress);
		});

		it("rejects upper > MAX_TICK_PCS_V3_1PCT", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, {
				treasuryTickUppers: [4000, 8000, 12000, MAX_TICK_PCS_V3_1PCT + 200],
			});
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidTickRange",
			);
		});

		it("still rejects tier.lower >= tier.upper", async () => {
			const ctx = await deployStack();
			const builder = buildConfig(ctx, {
				treasuryTickLowers: [2000, 8000, 10000, 14000],
				treasuryTickUppers: [4000, 8000, 12000, 16000],
			});
			const cfg = await builder.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg)).to.be.revertedWithCustomError(
				ctx.factory,
				"InvalidTickRange",
			);
		});
	});

	describe("CREATE2 determinism", () => {
		it("same creator + same vanity salt reverts cleanly on second deploy", async () => {
			const ctx = await deployStack();
			const fixedSalt = ethers.id("m3-fixed-salt");
			const builder = buildConfig(ctx, { salt: fixedSalt });
			const cfg = await builder.config();
			await (await ctx.factory.connect(ctx.creator).createLaunch(cfg)).wait();

			// Second attempt with the same vanitySalt must revert SaltAlreadyUsed
			// BEFORE attempting any CREATE2 (so the agent safe never gets re-collided).
			const builder2 = buildConfig(ctx, { salt: fixedSalt });
			const cfg2 = await builder2.config();
			await expect(ctx.factory.connect(ctx.creator).createLaunch(cfg2)).to.be.revertedWithCustomError(
				ctx.factory,
				"SaltAlreadyUsed",
			);
		});
	});

	describe("constructor validation", () => {
		it("LaunchFactory reverts on zero AgentSafeDeployer", async () => {
			const ctx = await deployStack();
			const placeholder = ctx.creator.address;
			const RouterDeployerCF = await ethers.getContractFactory("RouterDeployer");
			const rd = await RouterDeployerCF.deploy();
			const Factory = await ethers.getContractFactory("LaunchFactory");
			await expect(
				Factory.deploy(
					placeholder,
					placeholder,
					placeholder,
					ethers.ZeroHash,
					placeholder,
					placeholder,
					placeholder,
					placeholder,
					await rd.getAddress(),
					ethers.ZeroAddress, // agentSafeDeployer
					placeholder,
					placeholder,
					placeholder,
				),
			).to.be.revertedWithCustomError(Factory, "ZeroAddress");
		});
	});
});
