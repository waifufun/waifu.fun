const { expect } = require("chai");
const { ethers } = require("hardhat");

const SAFE_ABI = [
	"function getOwners() view returns (address[])",
	"function getThreshold() view returns (uint256)",
	"function getModulesPaginated(address start,uint256 pageSize) view returns (address[] array,address next)",
	"function isModuleEnabled(address module) view returns (bool)",
];

const ROLES_ABI = [
	"function owner() view returns (address)",
	"function avatar() view returns (address)",
	"function target() view returns (address)",
	"function memberOf(address module,bytes32 role) view returns (bool)",
	"function scopedFunction(bytes32 role,address target,bytes4 selector) view returns (bool)",
	"function assignRoles(address module,bytes32[] roleKeys,bool[] memberOf)",
	"function scopeFunction(bytes32 roleKey,address targetAddress,bytes4 functionSig,(uint8 parent,uint8 paramType,uint8 operator,bytes compValue)[] conditions,uint8 executionOptions)",
	"function execTransactionWithRole(address to,uint256 value,bytes data,uint8 operation,bytes32 role,bool shouldRevert) returns (bool)",
	"error NotAllowed()",
];

const CLAIM_REWARDS_SELECTOR = "0xc6a5026a"; // Pancake V3 QuoterV2 quoteExactInputSingle, default allowlist
const WITHDRAW_FUNDS_SELECTOR = "0xb60d4288"; // withdrawFunds()
const SENTINEL_MODULES = "0x0000000000000000000000000000000000000001";
const DEFAULT_ALLOWED_TARGET = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997";

describe("AgentSafeZodiacDeployer", () => {
	let deployer;
	let ownerA;
	let ownerB;
	let agent;
	let other;
	let safeSingleton;
	let safeFactory;
	let rolesFactory;
	let actionTarget;
	let zodiacDeployer;

	beforeEach(async () => {
		[deployer, ownerA, ownerB, agent, other] = await ethers.getSigners();

		const SafeSingleton = await ethers.getContractFactory("MockSafeSingleton");
		safeSingleton = await SafeSingleton.deploy();
		await safeSingleton.waitForDeployment();

		const SafeFactory = await ethers.getContractFactory("MockSafeProxyFactory");
		safeFactory = await SafeFactory.deploy();
		await safeFactory.waitForDeployment();

		const RolesFactory = await ethers.getContractFactory("MockRolesModuleFactory");
		rolesFactory = await RolesFactory.deploy();
		await rolesFactory.waitForDeployment();

		const ActionTarget = await ethers.getContractFactory("MockAgentActionTarget");
		const actionTargetImpl = await ActionTarget.deploy();
		await actionTargetImpl.waitForDeployment();
		await ethers.provider.send("hardhat_setCode", [
			DEFAULT_ALLOWED_TARGET,
			await ethers.provider.getCode(await actionTargetImpl.getAddress()),
		]);
		actionTarget = await ethers.getContractAt("MockAgentActionTarget", DEFAULT_ALLOWED_TARGET);
		await ethers.provider.send("hardhat_setStorageAt", [DEFAULT_ALLOWED_TARGET, "0x0", "0x" + "00".repeat(32)]);
		await ethers.provider.send("hardhat_setStorageAt", [DEFAULT_ALLOWED_TARGET, "0x1", "0x" + "00".repeat(32)]);

		const ZodiacDeployer = await ethers.getContractFactory("AgentSafeZodiacDeployer");
		zodiacDeployer = await ZodiacDeployer.deploy(
			await safeSingleton.getAddress(),
			await safeFactory.getAddress(),
			await rolesFactory.getAddress(),
			await actionTarget.getAddress(),
		);
		await zodiacDeployer.waitForDeployment();
	});

	async function roleConfigCalls() {
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const rolesInterface = new ethers.Interface(ROLES_ABI);
		return [
			rolesInterface.encodeFunctionData("assignRoles", [agent.address, [agentRole], [true]]),
			rolesInterface.encodeFunctionData("scopeFunction", [
				agentRole,
				actionTarget.target,
				CLAIM_REWARDS_SELECTOR,
				[],
				0,
			]),
		];
	}

	async function deploySafeWithRoles() {
		const owners = [ownerA.address, ownerB.address];
		const threshold = 2;
		const safeSalt = 42n;
		const rolesSalt = 777n;
		const configCalls = await roleConfigCalls();
		const [predictedSafe, predictedRoles] = await zodiacDeployer.predictAgentSafeWithRoles.staticCall(
			owners,
			threshold,
			safeSalt,
			rolesSalt,
			agent.address,
			configCalls,
		);

		const receipt = await (
			await zodiacDeployer.deployAgentSafeWithRoles(owners, threshold, safeSalt, rolesSalt, agent.address, configCalls)
		).wait();
		const parsed = receipt.logs
			.map((log) => {
				try {
					return zodiacDeployer.interface.parseLog(log);
				} catch (_e) {
					return null;
				}
			})
			.find((event) => event && event.name === "AgentSafeWithRolesDeployed");

		expect(parsed, "AgentSafeWithRolesDeployed missing").to.not.equal(undefined);
		expect(parsed.args.safe).to.equal(predictedSafe);
		expect(parsed.args.rolesModifier).to.equal(predictedRoles);
		return { safeAddress: predictedSafe, rolesAddress: predictedRoles, owners, threshold };
	}

	it("atomically deploys a Safe with the Roles module enabled and agent assigned", async () => {
		const { safeAddress, rolesAddress, owners, threshold } = await deploySafeWithRoles();

		const safe = new ethers.Contract(safeAddress, SAFE_ABI, ethers.provider);
		expect(await safe.getThreshold()).to.equal(BigInt(threshold));
		expect(await safe.getOwners()).to.deep.equal(owners);
		expect(await safe.isModuleEnabled(rolesAddress)).to.equal(true);

		const [modules, next] = await safe.getModulesPaginated(SENTINEL_MODULES, 10);
		expect(modules).to.deep.equal([rolesAddress]);
		expect(next).to.equal(SENTINEL_MODULES);

		const roles = new ethers.Contract(rolesAddress, ROLES_ABI, ethers.provider);
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		expect(await roles.owner()).to.equal(safeAddress);
		expect(await roles.avatar()).to.equal(safeAddress);
		expect(await roles.getFunction("target")()).to.equal(safeAddress);
		expect(await roles.memberOf(agent.address, agentRole)).to.equal(true);
		expect(await roles.scopedFunction(agentRole, actionTarget.target, CLAIM_REWARDS_SELECTOR)).to.equal(true);
		expect(await roles.scopedFunction(agentRole, actionTarget.target, WITHDRAW_FUNDS_SELECTOR)).to.equal(false);
	});

	it("lets agent-hot execute the default allowed action through Roles", async () => {
		const { rolesAddress } = await deploySafeWithRoles();
		const roles = new ethers.Contract(rolesAddress, ROLES_ABI, agent);
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const data = CLAIM_REWARDS_SELECTOR;

		await expect(roles.execTransactionWithRole(actionTarget.target, 0, data, 0, agentRole, true)).to.not.be.reverted;
		expect(await actionTarget.allowedCalls()).to.equal(1n);
	});

	it("reverts a gated withdraw/trade-like action for agent-hot without consent", async () => {
		const { rolesAddress } = await deploySafeWithRoles();
		const roles = new ethers.Contract(rolesAddress, ROLES_ABI, agent);
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const data = actionTarget.interface.encodeFunctionData("withdrawFunds");

		await expect(
			roles.execTransactionWithRole(actionTarget.target, 0, data, 0, agentRole, true),
		).to.be.revertedWithCustomError(roles, "NotAllowed");
		expect(await actionTarget.gatedCalls()).to.equal(0n);
	});


	it("blocks creator-supplied role config that assigns the agent role to an attacker EOA", async () => {
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const rolesInterface = new ethers.Interface(ROLES_ABI);
		const maliciousCalls = [
			rolesInterface.encodeFunctionData("assignRoles", [other.address, [agentRole], [true]]),
			rolesInterface.encodeFunctionData("scopeFunction", [
				agentRole,
				await actionTarget.getAddress(),
				CLAIM_REWARDS_SELECTOR,
				[],
				0,
			]),
		];

		await expect(
			zodiacDeployer.deployAgentSafeWithRoles(
				[ownerA.address, ownerB.address],
				2,
				9001n,
				9002n,
				agent.address,
				maliciousCalls,
			),
		).to.be.reverted;
	});

	it("blocks creator-supplied role config that scopes a withdraw selector allow-all", async () => {
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const rolesInterface = new ethers.Interface(ROLES_ABI);
		const maliciousCalls = [
			rolesInterface.encodeFunctionData("assignRoles", [agent.address, [agentRole], [true]]),
			rolesInterface.encodeFunctionData("scopeFunction", [
				agentRole,
				await actionTarget.getAddress(),
				WITHDRAW_FUNDS_SELECTOR,
				[],
				0,
			]),
		];

		await expect(
			zodiacDeployer.deployAgentSafeWithRoles(
				[ownerA.address, ownerB.address],
				2,
				9011n,
				9012n,
				agent.address,
				maliciousCalls,
			),
		).to.be.reverted;
	});

	it("blocks creator-supplied role config that reaches Roles admin functions", async () => {
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const rolesInterface = new ethers.Interface([
			...ROLES_ABI,
			"function transferOwnership(address newOwner)",
		]);
		const maliciousCalls = [
			rolesInterface.encodeFunctionData("assignRoles", [agent.address, [agentRole], [true]]),
			rolesInterface.encodeFunctionData("transferOwnership", [other.address]),
		];

		await expect(
			zodiacDeployer.deployAgentSafeWithRoles(
				[ownerA.address, ownerB.address],
				2,
				9021n,
				9022n,
				agent.address,
				maliciousCalls,
			),
		).to.be.reverted;
	});



	it("blocks creator-supplied allowance-increase selectors", async () => {
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const rolesInterface = new ethers.Interface(ROLES_ABI);
		const maliciousCalls = [
			rolesInterface.encodeFunctionData("assignRoles", [agent.address, [agentRole], [true]]),
			rolesInterface.encodeFunctionData("scopeFunction", [
				agentRole,
				await actionTarget.getAddress(),
				"0x39509351",
				[],
				0,
			]),
		];

		await expect(
			zodiacDeployer.deployAgentSafeWithRoles(
				[ownerA.address, ownerB.address],
				2,
				9041n,
				9042n,
				agent.address,
				maliciousCalls,
			),
		).to.be.reverted;
	});

	it("blocks creator-supplied target-wide scopeTarget permissions", async () => {
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const rolesInterface = new ethers.Interface([
			...ROLES_ABI,
			"function scopeTarget(bytes32 roleKey,address targetAddress)",
		]);
		const maliciousCalls = [
			rolesInterface.encodeFunctionData("assignRoles", [agent.address, [agentRole], [true]]),
			rolesInterface.encodeFunctionData("scopeTarget", [agentRole, await actionTarget.getAddress()]),
		];

		await expect(
			zodiacDeployer.deployAgentSafeWithRoles(
				[ownerA.address, ownerB.address],
				2,
				9031n,
				9032n,
				agent.address,
				maliciousCalls,
			),
		).to.be.reverted;
	});

	it("does not grant the default role to unrelated EOAs", async () => {
		const { rolesAddress } = await deploySafeWithRoles();
		const roles = new ethers.Contract(rolesAddress, ROLES_ABI, other);
		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const data = CLAIM_REWARDS_SELECTOR;

		await expect(
			roles.execTransactionWithRole(actionTarget.target, 0, data, 0, agentRole, true),
		).to.be.revertedWithCustomError(roles, "NotAllowed");
		expect(await actionTarget.allowedCalls()).to.equal(0n);
	});
});

const SAFE_SINGLETON_BSC = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE_PROXY_FACTORY_BSC = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const describeFork = process.env.FORK_BSC === "true" ? describe : describe.skip;

describeFork("AgentSafeZodiacDeployer :: BSC fork Safe v1.4.1 module setup", () => {
	it("enables the Roles module on a canonical Safe proxy during setup", async () => {
		const chainId = (await ethers.provider.getNetwork()).chainId;
		expect(Number(chainId)).to.equal(56);
		expect(await ethers.provider.getCode(SAFE_SINGLETON_BSC)).to.not.equal("0x");
		expect(await ethers.provider.getCode(SAFE_PROXY_FACTORY_BSC)).to.not.equal("0x");

		const [deployer, ownerA, ownerB, agent] = await ethers.getSigners();
		const RolesFactory = await ethers.getContractFactory("MockRolesModuleFactory");
		const rolesFactory = await RolesFactory.deploy();
		await rolesFactory.waitForDeployment();
		const ActionTarget = await ethers.getContractFactory("MockAgentActionTarget");
		const actionTarget = await ActionTarget.deploy();
		await actionTarget.waitForDeployment();
		const ZodiacDeployer = await ethers.getContractFactory("AgentSafeZodiacDeployer");
		const zodiacDeployer = await ZodiacDeployer.connect(deployer).deploy(
			SAFE_SINGLETON_BSC,
			SAFE_PROXY_FACTORY_BSC,
			await rolesFactory.getAddress(),
			await actionTarget.getAddress(),
		);
		await zodiacDeployer.waitForDeployment();

		const agentRole = await zodiacDeployer.AGENT_ROLE();
		const rolesInterface = new ethers.Interface(ROLES_ABI);
		const configCalls = [
			rolesInterface.encodeFunctionData("assignRoles", [agent.address, [agentRole], [true]]),
			rolesInterface.encodeFunctionData("scopeFunction", [
				agentRole,
				actionTarget.target,
				CLAIM_REWARDS_SELECTOR,
				[],
				0,
			]),
		];
		const owners = [ownerA.address, ownerB.address];
		const [safeAddress, rolesAddress] = await zodiacDeployer.predictAgentSafeWithRoles.staticCall(
			owners,
			2,
			20260609n,
			20260610n,
			agent.address,
			configCalls,
		);
		await zodiacDeployer.deployAgentSafeWithRoles(owners, 2, 20260609n, 20260610n, agent.address, configCalls);

		const safe = new ethers.Contract(safeAddress, SAFE_ABI, ethers.provider);
		const [modules] = await safe.getModulesPaginated(SENTINEL_MODULES, 10);
		expect(modules).to.deep.equal([rolesAddress]);
	});
});
