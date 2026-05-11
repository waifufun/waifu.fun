// SPDX-License-Identifier: MIT
// Real BSC fork refund coverage. Uses real PCS/Portal addresses in factory config,
// but intentionally never launches, so no pair or extra burns should occur.

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const INIT_CODE_HASH = "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const PCS_FACTORY_ABI = ["function getPair(address tokenA, address tokenB) view returns (address)"];

const TIER_95 = 2;
const INITIAL_BURN = ethers.parseEther("500000000");
const PRESALE_AMOUNT = ethers.parseEther("200000000");
const ONE_DAY = 86_400;

async function now() {
	return (await ethers.provider.getBlock("latest")).timestamp;
}

describe("real fork refund: LaunchVault undersubscription", function () {
	this.timeout(180_000);
	let creator;
	let platform;
	let alice;
	let bob;
	let snapshotId;

	before(async function () {
		if (process.env.FORK_BSC !== "true") {
			if (process.env.REQUIRE_BSC_FORK === "true") throw new Error("FORK_BSC=true is required");
			this.skip();
		}
		expect(await ethers.provider.getCode(PCS_FACTORY)).to.not.equal("0x");
		expect(await ethers.provider.getCode(FLAP_PORTAL)).to.not.equal("0x");
	});

	beforeEach(async () => {
		snapshotId = await ethers.provider.send("evm_snapshot", []);
		[, creator, platform, alice, bob] = await ethers.getSigners();
	});

	afterEach(async () => {
		if (snapshotId) await ethers.provider.send("evm_revert", [snapshotId]);
		snapshotId = undefined;
	});

	it("refunds principal plus pro-rata bonus and leaves token state unchanged", async () => {
		const Factory = await ethers.getContractFactory("LaunchFactory");
		const factory = await Factory.deploy(WBNB, PCS_FACTORY, PCS_ROUTER, INIT_CODE_HASH, platform.address, FLAP_PORTAL);
		await factory.waitForDeployment();

		const receipt = await (await factory.createLaunch({
			name: "RefundAgent",
			symbol: "RFD",
			metadataURI: "ipfs://refund",
			creator: creator.address,
			tier: TIER_95,
			closeTimestamp: (await now()) + ONE_DAY,
		})).wait();
		const ev = receipt.logs.find((l) => l.fragment?.name === "LaunchCreated");
		const token = await ethers.getContractAt("AgentTokenV3", ev.args.token);
		const vault = await ethers.getContractAt("LaunchVault", ev.args.vault);

		await vault.connect(alice).deposit({ value: ethers.parseEther("10") });
		await vault.connect(bob).deposit({ value: ethers.parseEther("5") });
		await vault.connect(alice).withdraw(ethers.parseEther("2"));
		expect(await vault.bonusPool()).to.equal(ethers.parseEther("0.1"));
		expect(await vault.totalDeposited()).to.equal(ethers.parseEther("13"));

		await network.provider.send("evm_increaseTime", [ONE_DAY + 1]);
		await network.provider.send("evm_mine", []);
		await vault.connect(bob).close();
		await expect(vault.connect(creator).launch(ev.args.token, 0, (await now()) + 3600)).to.be.revertedWithCustomError(
			vault,
			"UnderSubscribed",
		);

		const aliceBefore = await ethers.provider.getBalance(alice.address);
		const aliceTx = await vault.connect(alice).refund();
		const aliceReceipt = await aliceTx.wait();
		const aliceGas = aliceReceipt.gasUsed * aliceReceipt.gasPrice;
		expect((await ethers.provider.getBalance(alice.address)) - aliceBefore + aliceGas).to.equal(
			ethers.parseEther("8") + (ethers.parseEther("0.1") * 8n) / 13n,
		);

		const bobBefore = await ethers.provider.getBalance(bob.address);
		const bobTx = await vault.connect(bob).refund();
		const bobReceipt = await bobTx.wait();
		const bobGas = bobReceipt.gasUsed * bobReceipt.gasPrice;
		expect((await ethers.provider.getBalance(bob.address)) - bobBefore + bobGas).to.equal(await ethers.parseEther("5.038461538461538462"));

		expect(await ethers.provider.getBalance(ev.args.vault)).to.equal(0n);
		expect(await token.balanceOf(DEAD)).to.equal(INITIAL_BURN);
		expect(await token.balanceOf(ev.args.vault)).to.equal(PRESALE_AMOUNT * 2n);
		const pcsFactory = new ethers.Contract(PCS_FACTORY, PCS_FACTORY_ABI, ethers.provider);
		expect(await pcsFactory.getPair(ev.args.token, WBNB)).to.equal(ethers.ZeroAddress);
	});
});
