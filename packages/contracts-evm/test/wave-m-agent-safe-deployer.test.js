const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// Wave M2: AgentSafeDeployer fork tests.
//
// Architecture under test:
//   AgentSafeDeployer.deployAgentSafe(owners, threshold, saltNonce)
//     -> SafeProxyFactory.createProxyWithNonce(singleton, initializer, salt)
//        -> Safe.setup(owners, threshold, 0, "", 0, 0, 0, 0)
//
// These tests rely on the canonical Safe v1.4.1 contracts on BSC mainnet,
// so they only run when the hardhat network is forking BSC (chainId 56).
// To run:
//   FORK_BSC=true FORK_BSC_URL=https://bsc-mainnet.public.blastapi.io \
//   FORK_BSC_BLOCK=98869000 \
//   bun hardhat test test/wave-m-agent-safe-deployer.test.js

const SAFE_SINGLETON = "0x29fcB43b46531BcA003ddC8FCB67FFE91900C762";
const SAFE_PROXY_FACTORY = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";

// Minimal Safe ABI (v1.4.1) for read-back assertions.
const SAFE_ABI = [
	"function getOwners() view returns (address[])",
	"function getThreshold() view returns (uint256)",
	"function isOwner(address owner) view returns (bool)",
	"function VERSION() view returns (string)",
];

const onFork = process.env.FORK_BSC === "true";
const describeFn = onFork ? describe : describe.skip;

describeFn("Wave M2 :: AgentSafeDeployer (BSC fork)", () => {
	let deployer;
	let alice;
	let bob;
	let carol;
	let agentSafeDeployer;

	before(async () => {
		if (!onFork) return;

		// Sanity: confirm the fork is actually on BSC chainId 56 so the
		// canonical Safe addresses below actually exist as deployed bytecode.
		const chainId = (await ethers.provider.getNetwork()).chainId;
		expect(Number(chainId)).to.equal(56);

		[deployer, alice, bob, carol] = await ethers.getSigners();

		const code = await ethers.provider.getCode(SAFE_SINGLETON);
		expect(code).to.not.equal("0x", "Safe singleton missing on fork");
		const factoryCode = await ethers.provider.getCode(SAFE_PROXY_FACTORY);
		expect(factoryCode).to.not.equal("0x", "Safe proxy factory missing on fork");

		const Factory = await ethers.getContractFactory("AgentSafeDeployer");
		agentSafeDeployer = await Factory.connect(deployer).deploy(SAFE_SINGLETON, SAFE_PROXY_FACTORY);
		await agentSafeDeployer.waitForDeployment();
	});

	it("stores singleton + factory as immutables", async () => {
		expect(await agentSafeDeployer.safeSingleton()).to.equal(SAFE_SINGLETON);
		expect(await agentSafeDeployer.safeProxyFactory()).to.equal(SAFE_PROXY_FACTORY);
	});

	it("rejects zero-address singleton / factory in constructor", async () => {
		const Factory = await ethers.getContractFactory("AgentSafeDeployer");
		await expect(
			Factory.connect(deployer).deploy(ethers.ZeroAddress, SAFE_PROXY_FACTORY),
		).to.be.revertedWithCustomError(agentSafeDeployer, "InvalidSingleton");
		await expect(Factory.connect(deployer).deploy(SAFE_SINGLETON, ethers.ZeroAddress)).to.be.revertedWithCustomError(
			agentSafeDeployer,
			"InvalidProxyFactory",
		);
	});

	it("rejects empty owners array", async () => {
		await expect(agentSafeDeployer.deployAgentSafe([], 1, 1)).to.be.revertedWithCustomError(
			agentSafeDeployer,
			"InvalidOwners",
		);
	});

	it("rejects threshold = 0", async () => {
		await expect(agentSafeDeployer.deployAgentSafe([alice.address], 0, 1)).to.be.revertedWithCustomError(
			agentSafeDeployer,
			"InvalidThreshold",
		);
	});

	it("rejects threshold > owners.length", async () => {
		await expect(agentSafeDeployer.deployAgentSafe([alice.address, bob.address], 3, 1)).to.be.revertedWithCustomError(
			agentSafeDeployer,
			"InvalidThreshold",
		);
	});

	it("deploys a 1/1 Safe with a single owner", async () => {
		const owners = [alice.address];
		const threshold = 1;
		const saltNonce = 1001n;

		const predicted = await agentSafeDeployer.predictAgentSafe(owners, threshold, saltNonce);

		const tx = await agentSafeDeployer.deployAgentSafe(owners, threshold, saltNonce);
		const receipt = await tx.wait();

		const event = receipt.logs
			.map((log) => {
				try {
					return agentSafeDeployer.interface.parseLog(log);
				} catch (_e) {
					return null;
				}
			})
			.find((parsed) => parsed && parsed.name === "SafeDeployed");
		expect(event, "SafeDeployed event missing").to.not.equal(undefined);

		const safeAddress = event.args.safe;
		expect(safeAddress).to.equal(predicted);
		expect(event.args.saltNonce).to.equal(saltNonce);
		expect(event.args.threshold).to.equal(BigInt(threshold));
		expect(event.args.owners).to.deep.equal(owners);

		const safe = new ethers.Contract(safeAddress, SAFE_ABI, ethers.provider);
		expect(await safe.getThreshold()).to.equal(BigInt(threshold));
		expect(await safe.getOwners()).to.deep.equal(owners);
		expect(await safe.isOwner(alice.address)).to.equal(true);
		expect(await safe.VERSION()).to.equal("1.4.1");
	});

	it("deploys a 2/2 Safe with two owners", async () => {
		const owners = [alice.address, bob.address];
		const threshold = 2;
		const saltNonce = 2002n;

		const predicted = await agentSafeDeployer.predictAgentSafe(owners, threshold, saltNonce);
		await agentSafeDeployer.deployAgentSafe(owners, threshold, saltNonce);

		const safe = new ethers.Contract(predicted, SAFE_ABI, ethers.provider);
		expect(await safe.getThreshold()).to.equal(BigInt(threshold));
		const onChainOwners = await safe.getOwners();
		expect(onChainOwners).to.have.lengthOf(2);
		expect(new Set(onChainOwners)).to.deep.equal(new Set(owners));
	});

	it("deploys a 2/3 Safe with three owners", async () => {
		const owners = [alice.address, bob.address, carol.address];
		const threshold = 2;
		const saltNonce = 3003n;

		const predicted = await agentSafeDeployer.predictAgentSafe(owners, threshold, saltNonce);
		await agentSafeDeployer.deployAgentSafe(owners, threshold, saltNonce);

		const safe = new ethers.Contract(predicted, SAFE_ABI, ethers.provider);
		expect(await safe.getThreshold()).to.equal(BigInt(threshold));
		const onChainOwners = await safe.getOwners();
		expect(onChainOwners).to.have.lengthOf(3);
		for (const owner of owners) {
			expect(await safe.isOwner(owner)).to.equal(true);
		}
	});

	it("different saltNonce produces a different Safe address", async () => {
		const owners = [alice.address];
		const threshold = 1;

		const addrA = await agentSafeDeployer.predictAgentSafe(owners, threshold, 4001n);
		const addrB = await agentSafeDeployer.predictAgentSafe(owners, threshold, 4002n);
		expect(addrA).to.not.equal(addrB);

		await agentSafeDeployer.deployAgentSafe(owners, threshold, 4001n);
		await agentSafeDeployer.deployAgentSafe(owners, threshold, 4002n);

		expect(await ethers.provider.getCode(addrA)).to.not.equal("0x");
		expect(await ethers.provider.getCode(addrB)).to.not.equal("0x");
	});

	it("reverts when deploying the same (args + saltNonce) twice (CREATE2 collision)", async () => {
		const owners = [alice.address, bob.address];
		const threshold = 2;
		const saltNonce = 5005n;

		await agentSafeDeployer.deployAgentSafe(owners, threshold, saltNonce);

		// The proxy factory reverts on collision because CREATE2 cannot
		// overwrite the existing proxy at that address.
		await expect(agentSafeDeployer.deployAgentSafe(owners, threshold, saltNonce)).to.be.reverted;
	});
});

// When not on a BSC fork, surface a single skipped test so CI shows why.
if (!onFork) {
	describe("Wave M2 :: AgentSafeDeployer", () => {
		it.skip("requires FORK_BSC=true to run (uses canonical Safe v1.4.1)", () => {});
	});
}
