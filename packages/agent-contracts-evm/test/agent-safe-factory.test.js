const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

async function deployFixture() {
	const [deployer, agent, patron] = await ethers.getSigners();
	const safeSingleton = await ethers.deployContract("MockSafe");
	const proxyFactory = await ethers.deployContract("MockSafeProxyFactory");
	const fallbackHandler = await ethers.Wallet.createRandom().getAddress();
	const rolesSingleton = await ethers.deployContract("MockRolesModifier");
	await Promise.all([
		safeSingleton.waitForDeployment(),
		proxyFactory.waitForDeployment(),
		rolesSingleton.waitForDeployment(),
	]);

	const factory = await ethers.deployContract("AgentSafeFactory", [
		await safeSingleton.getAddress(),
		await proxyFactory.getAddress(),
		fallbackHandler,
		await rolesSingleton.getAddress(),
	]);
	await factory.waitForDeployment();

	return { deployer, agent, patron, safeSingleton, proxyFactory, fallbackHandler, rolesSingleton, factory };
}

describe("AgentSafeFactory", () => {
	it("deploys a 1-of-2 Safe proxy and enables the Roles Modifier module", async () => {
		const { agent, patron, proxyFactory, fallbackHandler, rolesSingleton, factory } = await deployFixture();
		const salt = ethers.id("agent-safe-test");

		const tx = await factory.deployAgentSafe(agent.address, patron.address, salt);
		const receipt = await tx.wait();
		const event = receipt.logs
			.map((log) => {
				try {
					return factory.interface.parseLog(log);
				} catch {
					return null;
				}
			})
			.find((log) => log?.name === "AgentSafeDeployed");

		const { safe, rolesModifier, agentKey, patronWallet } = event.args;
		assert.equal(agentKey, agent.address);
		assert.equal(patronWallet, patron.address);
		assert.equal(safe, await proxyFactory.lastProxy());
		assert.notEqual(rolesModifier, ethers.ZeroAddress);
		assert.notEqual(rolesModifier, await rolesSingleton.getAddress());

		const safeContract = await ethers.getContractAt("MockSafe", safe);
		assert.equal(await safeContract.ownersLength(), 2n);
		assert.equal(await safeContract.owners(0), agent.address);
		assert.equal(await safeContract.owners(1), patron.address);
		assert.equal(await safeContract.threshold(), 1n);
		assert.equal(await safeContract.fallbackHandler(), fallbackHandler);
		assert.equal(await safeContract.enabledModule(), rolesModifier);

		const roles = await ethers.getContractAt("MockRolesModifier", rolesModifier);
		const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
			["address", "address", "address"],
			await roles.lastSetUpData(),
		);
		assert.deepEqual([...decoded], [safe, safe, safe]);
	});

	it("uses the salt as the Safe proxy nonce", async () => {
		const { agent, patron, proxyFactory, factory } = await deployFixture();
		const salt = ethers.keccak256("0x1234");

		await factory.deployAgentSafe(agent.address, patron.address, salt);

		assert.equal(await proxyFactory.lastSaltNonce(), BigInt(salt));
	});

	it("reverts on zero agent or patron address", async () => {
		const { patron, factory } = await deployFixture();
		const salt = ethers.id("bad");

		await assert.rejects(factory.deployAgentSafe(ethers.ZeroAddress, patron.address, salt), (err) =>
			String(err).includes("ZeroAddress"),
		);
	});
});
