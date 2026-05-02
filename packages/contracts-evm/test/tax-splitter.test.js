const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

async function expectCustomError(promise, errorName) {
	await assert.rejects(promise, (err) => String(err).includes(errorName));
}

describe("TaxSplitter", () => {
	async function deploySplitter() {
		const [owner, agent, patron] = await ethers.getSigners();
		const recipients = [agent.address, patron.address];
		const bpsRates = [8000, 2000];
		const splitter = await ethers.deployContract("TaxSplitter", [recipients, bpsRates]);
		await splitter.waitForDeployment();
		return { owner, agent, patron, recipients, bpsRates, splitter };
	}

	it("deploys with an 80/20 split", async () => {
		const { agent, patron, splitter } = await deploySplitter();

		assert.equal(await splitter.recipientsLength(), 2n);
		assert.equal(await splitter.recipients(0), agent.address);
		assert.equal(await splitter.recipients(1), patron.address);
		assert.equal(await splitter.bpsRates(0), 8000n);
		assert.equal(await splitter.bpsRates(1), 2000n);
	});

	it("reverts when bpsRates do not sum to 10000", async () => {
		const [, agent, patron] = await ethers.getSigners();

		await expectCustomError(
			ethers.deployContract("TaxSplitter", [
				[agent.address, patron.address],
				[8000, 1000],
			]),
			"InvalidRates",
		);
	});

	it("reverts when recipients are empty", async () => {
		await expectCustomError(ethers.deployContract("TaxSplitter", [[], []]), "EmptyRecipients");
	});

	it("forwards BNB proportionally through receive()", async () => {
		const { owner, agent, patron, splitter } = await deploySplitter();
		const splitterAddress = await splitter.getAddress();
		const amount = ethers.parseEther("1");
		const agentBefore = await ethers.provider.getBalance(agent.address);
		const patronBefore = await ethers.provider.getBalance(patron.address);

		await owner.sendTransaction({ to: splitterAddress, value: amount });

		assert.equal(await ethers.provider.getBalance(splitterAddress), 0n);
		assert.equal((await ethers.provider.getBalance(agent.address)) - agentBefore, ethers.parseEther("0.8"));
		assert.equal((await ethers.provider.getBalance(patron.address)) - patronBefore, ethers.parseEther("0.2"));
	});

	it("release(token) forwards ERC-20 proportionally", async () => {
		const { owner, agent, patron, splitter } = await deploySplitter();
		const token = await ethers.deployContract("ERC20Mock");
		await token.waitForDeployment();
		const amount = ethers.parseEther("100");

		await token.mint(await splitter.getAddress(), amount);
		await splitter.connect(owner).release(await token.getAddress());

		assert.equal(await token.balanceOf(await splitter.getAddress()), 0n);
		assert.equal(await token.balanceOf(agent.address), ethers.parseEther("80"));
		assert.equal(await token.balanceOf(patron.address), ethers.parseEther("20"));
	});
});

describe("TaxSplitterFactory", () => {
	it("deploy() matches CREATE2 predict()", async () => {
		const [, agent, patron] = await ethers.getSigners();
		const factory = await ethers.deployContract("TaxSplitterFactory");
		await factory.waitForDeployment();
		const recipients = [agent.address, patron.address];
		const bpsRates = [8000, 2000];
		const salt = ethers.id("waifu-tax-splitter-test");

		const predicted = await factory.predict(recipients, bpsRates, salt);
		const tx = await factory.deploy(recipients, bpsRates, salt);
		const receipt = await tx.wait();
		const deployed = receipt.logs
			.map((log) => {
				try {
					return factory.interface.parseLog(log);
				} catch {
					return null;
				}
			})
			.find((event) => event?.name === "SplitterDeployed").args.splitter;

		assert.equal(deployed, predicted);
		assert.equal(await ethers.provider.getCode(predicted).then((code) => code.length > 2), true);
	});
});
