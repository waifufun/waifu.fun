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
			2, // _tier = LaunchTier.TIER_95
		);

		return { owner, creator, bundleBot, depositor, factory, vault };
	}

	// Tier enum mirror of contracts/LaunchTier.sol — TIER_80=0, TIER_90=1,
	// TIER_95=2, TIER_98=3, TIER_TEST=4.
	const TIER_TEST = 4;
	const TIER_95 = 2;

	async function deployVaultWithTier(tierValue) {
		const [owner, creator, bundleBot, depositor, depositor2] = await ethers.getSigners();
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
			tierValue,
		);
		return { owner, creator, bundleBot, depositor, depositor2, factory, vault };
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

	describe("instantAdminRefund (TIER_TEST only)", () => {
		it("A) factory owner can instant-refund a TIER_TEST vault during OPEN; depositors get principal back", async () => {
			const { owner, depositor, vault } = await deployVaultWithTier(TIER_TEST);

			const depositAmount = ethers.parseEther("1");
			await vault.connect(depositor).deposit({ value: depositAmount });
			expect(await vault.state()).to.equal(0n); // OPEN

			const before = await ethers.provider.getBalance(depositor.address);
			await expect(vault.connect(owner).instantAdminRefund("admin-refund-test"))
				.to.emit(vault, "RefundEnabled")
				.withArgs(owner.address, "admin-refund-test");
			expect(await vault.state()).to.equal(3n); // REFUND

			const refundTx = await vault.connect(depositor).refund();
			const rcpt = await refundTx.wait();
			const gas = rcpt.gasUsed * rcpt.gasPrice;
			const after = await ethers.provider.getBalance(depositor.address);
			expect(after - before + gas).to.equal(depositAmount);
			expect((await vault.depositors(depositor.address)).deposited).to.equal(0n);
		});

		it("B) instantAdminRefund reverts InvalidState on a non-TEST tier (TIER_95)", async () => {
			const { owner, depositor, vault } = await deployVaultWithTier(TIER_95);
			await vault.connect(depositor).deposit({ value: ethers.parseEther("1") });
			await expect(
				vault.connect(owner).instantAdminRefund("should-not-work"),
			).to.be.revertedWithCustomError(vault, "InvalidState");
			expect(await vault.state()).to.equal(0n); // still OPEN
		});

		it("C) instantAdminRefund reverts NotFactoryOwner when caller is not the factory owner", async () => {
			const { depositor, vault } = await deployVaultWithTier(TIER_TEST);
			await expect(
				vault.connect(depositor).instantAdminRefund("not-owner"),
			).to.be.revertedWithCustomError(vault, "NotFactoryOwner");
		});

		it("D) instantAdminRefund reverts InvalidState after LAUNCHED", async () => {
			// Drive the vault into LAUNCHED by impersonating the factory mock as
			// the caller of setRouter, then using bundleBot signer as the router
			// EOA (which can both call pullBnbForLaunch and receive the BNB).
			const [owner, creator, bundleBot, depositor, depositor2] = await ethers.getSigners();
			const FactoryOwnerMock = await ethers.getContractFactory("FactoryOwnerMock");
			const factory = await FactoryOwnerMock.deploy(owner.address);
			const LaunchVault = await ethers.getContractFactory("LaunchVault");
			const now = BigInt((await ethers.provider.getBlock("latest")).timestamp);
			const presaleCap = ethers.parseEther("2");
			const vault = await LaunchVault.deploy(
				await factory.getAddress(),
				creator.address,
				bundleBot.address,
				presaleCap,
				ethers.parseEther("1"),
				0n,
				now + 3600n,
				0,
				false,
				TIER_TEST,
			);

			// setRouter must be called by the address stored as vault.factory().
			// Impersonate FactoryOwnerMock's address to make that call.
			const factoryAddress = await factory.getAddress();
			await ethers.provider.send("hardhat_impersonateAccount", [factoryAddress]);
			await ethers.provider.send("hardhat_setBalance", [factoryAddress, "0x56BC75E2D63100000"]);
			const factorySigner = await ethers.getSigner(factoryAddress);
			await vault.connect(factorySigner).setRouter(bundleBot.address);
			await ethers.provider.send("hardhat_stopImpersonatingAccount", [factoryAddress]);

			// Fill the cap across two depositors to stay under the 60% wallet cap.
			const half = presaleCap / 2n;
			await vault.connect(depositor).deposit({ value: half });
			await vault.connect(depositor2).deposit({ value: half });
			// Past closeTimestamp so close() is unconditional (avoids MIN_OPEN_DURATION).
			await advanceTo(now + 3700n);
			await vault.connect(bundleBot).close();
			expect(await vault.state()).to.equal(1n); // CLOSED

			await vault.connect(bundleBot).pullBnbForLaunch(presaleCap);
			expect(await vault.state()).to.equal(2n); // LAUNCHED

			await expect(
				vault.connect(owner).instantAdminRefund("too-late"),
			).to.be.revertedWithCustomError(vault, "InvalidState");
		});
	});
});
