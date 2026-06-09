const { expect } = require("chai");
const { ethers } = require("hardhat");

const SAFE_SINGLETON_BSC = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE_PROXY_FACTORY_BSC = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const TIER_80 = 0;
const CLAIM_REWARDS_SELECTOR = "0xc6a5026a";
const WITHDRAW_FUNDS_SELECTOR = "0xb60d4288";
const SENTINEL_MODULES = "0x0000000000000000000000000000000000000001";

const SAFE_ABI = [
	"function getModulesPaginated(address start,uint256 pageSize) view returns (address[] array,address next)",
	"function isModuleEnabled(address module) view returns (bool)",
];

const DEFAULT_ALLOWED_TARGET = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997";

const ROLES_ABI = [
	"function memberOf(address module,bytes32 role) view returns (bool)",
	"function scopedFunction(bytes32 role,address target,bytes4 selector) view returns (bool)",
	"function assignRoles(address module,bytes32[] roleKeys,bool[] memberOf)",
	"function scopeFunction(bytes32 roleKey,address targetAddress,bytes4 functionSig,(uint8 parent,uint8 paramType,uint8 operator,bytes compValue)[] conditions,uint8 executionOptions)",
	"function execTransactionWithRole(address to,uint256 value,bytes data,uint8 operation,bytes32 role,bool shouldRevert) returns (bool)",
	"error NotAllowed()",
];

function computeInitCodeHash(creationCode, name, symbol) {
	const encoded = ethers.AbiCoder.defaultAbiCoder().encode(["string", "string"], [name, symbol]);
	return ethers.keccak256(ethers.concat([creationCode, encoded]));
}

function effectiveSalt(creator, vanitySalt) {
	return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [creator, vanitySalt]));
}

async function currentTs() {
	return BigInt((await ethers.provider.getBlock("latest")).timestamp);
}

const describeFork = process.env.FORK_BSC === "true" ? describe : describe.skip;

describeFork("LaunchFactory + AgentSafeZodiacDeployer :: BSC fork", () => {
	it("createLaunch deploys a Safe v1.4.1 proxy with Roles enabled and gated actions blocked", async () => {
		const chainId = (await ethers.provider.getNetwork()).chainId;
		expect(Number(chainId)).to.equal(56);
		expect(await ethers.provider.getCode(SAFE_SINGLETON_BSC)).to.not.equal("0x");
		expect(await ethers.provider.getCode(SAFE_PROXY_FACTORY_BSC)).to.not.equal("0x");

		const [deployer, creator, agent, tipReceiver, patron] = await ethers.getSigners();
		const wbnb = "0x0000000000000000000000000000000000000B0B";

		const PCSFactory = await ethers.getContractFactory("MockBundlePCSFactory");
		const pcsFactory = await PCSFactory.deploy();
		const PCSRouter = await ethers.getContractFactory("MockSimplePCSRouter");
		const pcsRouter = await PCSRouter.deploy();
		await pcsRouter.setRate(ethers.parseEther("1000000"));

		const Portal = await ethers.getContractFactory("MockFlapPortalCREATE2");
		const portal = await Portal.deploy(await pcsFactory.getAddress(), wbnb);
		await portal.setPCSRouter(await pcsRouter.getAddress());

		const name = "ForkZodiac";
		const symbol = "FZOD";
		const TokenArtifact = await ethers.getContractFactory("BundleFlowToken");
		const initCodeHash = computeInitCodeHash(TokenArtifact.bytecode, name, symbol);

		const RouterDeployer = await ethers.getContractFactory("RouterDeployer");
		const routerDeployer = await RouterDeployer.deploy();
		const TreasuryDeployer = await ethers.getContractFactory("TreasuryLP5Deployer");
		const treasuryDeployer = await TreasuryDeployer.deploy();
		const V3Factory = await ethers.getContractFactory("MockV3Factory");
		const mockV3Factory = await V3Factory.deploy();
		const NPM = await ethers.getContractFactory("MockNonfungiblePositionManager");
		const mockNpm = await NPM.deploy(wbnb);
		const RolesFactory = await ethers.getContractFactory("MockRolesModuleFactory");
		const rolesFactory = await RolesFactory.deploy();
		const ActionTarget = await ethers.getContractFactory("MockAgentActionTarget");
		const actionTargetImpl = await ActionTarget.deploy();
		await ethers.provider.send("hardhat_setCode", [
			DEFAULT_ALLOWED_TARGET,
			await ethers.provider.getCode(await actionTargetImpl.getAddress()),
		]);
		const actionTarget = await ethers.getContractAt("MockAgentActionTarget", DEFAULT_ALLOWED_TARGET);
	await ethers.provider.send("hardhat_setStorageAt", [DEFAULT_ALLOWED_TARGET, "0x0", "0x" + "00".repeat(32)]);
	await ethers.provider.send("hardhat_setStorageAt", [DEFAULT_ALLOWED_TARGET, "0x1", "0x" + "00".repeat(32)]);

		const ZodiacDeployer = await ethers.getContractFactory("AgentSafeZodiacDeployer");
		const zodiacDeployer = await ZodiacDeployer.connect(deployer).deploy(
			SAFE_SINGLETON_BSC,
			SAFE_PROXY_FACTORY_BSC,
			await rolesFactory.getAddress(),
			DEFAULT_ALLOWED_TARGET,
		);

		const Factory = await ethers.getContractFactory("LaunchFactory");
		const factory = await Factory.deploy(
			wbnb,
			await pcsFactory.getAddress(),
			await pcsRouter.getAddress(),
			initCodeHash,
			await portal.getAddress(),
			creator.address,
			tipReceiver.address,
			creator.address,
			await routerDeployer.getAddress(),
			await zodiacDeployer.getAddress(),
			await treasuryDeployer.getAddress(),
			await mockNpm.getAddress(),
			await mockV3Factory.getAddress(),
		);

		const role = await zodiacDeployer.AGENT_ROLE();
		const rolesInterface = new ethers.Interface(ROLES_ABI);
		const roleConfigCalls = [
			rolesInterface.encodeFunctionData("assignRoles", [agent.address, [role], [true]]),
			rolesInterface.encodeFunctionData("scopeFunction", [
				role,
				DEFAULT_ALLOWED_TARGET,
				CLAIM_REWARDS_SELECTOR,
				[],
				0,
			]),
		];

		const rawSalt = ethers.id("factory-zodiac-fork");
		const predictedTokenAddress = ethers.getCreate2Address(
			await portal.getAddress(),
			effectiveSalt(creator.address, rawSalt),
			initCodeHash,
		);
		const config = {
			name,
			symbol,
			metaCid: "QmForkZodiac",
			creator: creator.address,
			bundleBot: agent.address,
			tier: TIER_80,
			buyTaxBps: 300,
			sellTaxBps: 300,
			taxDuration: 365 * 24 * 60 * 60,
			antiFarmerDuration: 3600,
			closeTimestamp: (await currentTs()) + 3600n,
			vanitySalt: rawSalt,
			predictedTokenAddress,
			noBurn: false,
			platformReceiver: creator.address,
			patron: patron.address,
			agentSafeOwners: [creator.address],
			agentSafeThreshold: 1,
			agentEoa: agent.address,
			roleConfigCalls,
			platformBps: 1000,
			patronBps: 2500,
			treasuryTickLowers: [2000, 6000, 10000, 14000],
			treasuryTickUppers: [4000, 8000, 12000, 16000],
		};

		const addrs = await factory.connect(creator).createLaunch.staticCall(config);
		const receipt = await (await factory.connect(creator).createLaunch(config)).wait();
		console.log(`    [fork-zodiac] createLaunch gas: ${receipt.gasUsed}`);

		const safe = new ethers.Contract(addrs.agentSafe, SAFE_ABI, ethers.provider);
		const [modules, next] = await safe.getModulesPaginated(SENTINEL_MODULES, 10);
		expect(modules.length).to.equal(1);
		expect(next).to.equal(SENTINEL_MODULES);
		expect(await safe.isModuleEnabled(modules[0])).to.equal(true);

		const roles = new ethers.Contract(modules[0], ROLES_ABI, agent);
		expect(await roles.memberOf(agent.address, role)).to.equal(true);
		expect(await roles.scopedFunction(role, DEFAULT_ALLOWED_TARGET, CLAIM_REWARDS_SELECTOR)).to.equal(true);
		expect(await roles.scopedFunction(role, DEFAULT_ALLOWED_TARGET, WITHDRAW_FUNDS_SELECTOR)).to.equal(false);

		await expect(
			roles.execTransactionWithRole(
				DEFAULT_ALLOWED_TARGET,
				0,
				CLAIM_REWARDS_SELECTOR,
				0,
				role,
				true,
			),
		).to.not.be.reverted;
		expect(await actionTarget.allowedCalls()).to.equal(1n);

		await expect(
			roles.execTransactionWithRole(
				DEFAULT_ALLOWED_TARGET,
				0,
				actionTarget.interface.encodeFunctionData("withdrawFunds"),
				0,
				role,
				true,
			),
		).to.be.revertedWithCustomError(roles, "NotAllowed");
		expect(await actionTarget.gatedCalls()).to.equal(0n);
	});
});
