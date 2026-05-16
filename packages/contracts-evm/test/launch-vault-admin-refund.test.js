const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LaunchVault admin refund controls", () => {
	async function advanceTo(timestamp) {
		await ethers.provider.send("evm_setNextBlockTimestamp", [Number(timestamp)]);
		await ethers.provider.send("evm_mine", []);
	}

	async function deployVaultFixture() {
		const [owner, creator, bundleBot, depositor] = await ethers.getSigners();
		const FactoryOwnerMock = await ethers.getContractFactory("FactoryOwnerMock");
		const factory = await FactoryOwnerMock.deploy(owner.address);
		const LaunchVault = await ethers.getContractFactory("LaunchVault");
		const vault = await LaunchVault.deploy(
			await factory.getAddress(),
			creator.address,
			bundleBot.address,
			ethers.parseEther("32"),
			ethers.parseEther("16"),
			0n,
			2000000000,
			0,
			false,
		);

		return { owner, creator, bundleBot, depositor, factory, vault };
	}

	it("requires factory owner schedule plus delay before emergency refund", async () => {
		const { owner, depositor, vault } = await deployVaultFixture();

		await vault.connect(depositor).deposit({ value: ethers.parseEther("1") });
		await expect(vault.connect(depositor).scheduleAdminRefund("test")).to.be.revertedWithCustomError(
			vault,
			"NotFactoryOwner",
		);
		await expect(vault.connect(owner).adminEnableRefund("test")).to.be.revertedWithCustomError(
			vault,
			"AdminRefundNotScheduled",
		);

		const scheduled = await vault.connect(owner).scheduleAdminRefund("test");
		const scheduledAt = BigInt((await ethers.provider.getBlock(scheduled.blockNumber)).timestamp);
		expect(await vault.adminRefundReadyAt()).to.equal(scheduledAt + 86400n);
		await expect(vault.connect(owner).adminEnableRefund("test")).to.be.revertedWithCustomError(
			vault,
			"AdminRefundDelayNotElapsed",
		);

		await advanceTo(scheduledAt + 86400n);
		await vault.connect(owner).adminEnableRefund("test");
		expect(await vault.state()).to.equal(3n);
		await vault.connect(depositor).refund();
		expect((await vault.depositors(depositor.address)).deposited).to.equal(0n);
	});
});
