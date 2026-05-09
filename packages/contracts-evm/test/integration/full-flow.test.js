// SPDX-License-Identifier: MIT
//
// W41: End-to-end integration tests for Agent Launch v3.
//
// Two layers of coverage:
//   1. Factory + Vault path (real AgentTokenV3, real LaunchVault, real
//      BundleRouter wired by LaunchFactory). Validates atomic deploy,
//      tier configs, presale lifecycle, withdraw penalty, auto-close,
//      and revert paths.
//   2. Graduation path (MockFlapToken + LaunchVault + BundleRouter,
//      hand-wired). Validates real PCS V2 graduation + V2 buy + burn
//      against a BSC mainnet fork pinned to a deterministic block,
//      followed by pro-rata claim and 50/50/24h vesting checkpoints.
//
// AgentTokenV3 does not implement a bonding curve buy(); in production
// that role is filled by a separately deployed flap-style token. Until
// the curve token + factory wiring lands (post-W41), full end-to-end
// graduation through the factory itself is not exercisable. The scaffold
// here is the closest faithful representation: each layer tests against
// real dependencies and the seam between them is documented.
//
// Run on a BSC fork:
//   FORK_BSC=true \
//   FORK_BSC_URL="https://bnb-mainnet.g.alchemy.com/v2/$ALCHEMY_BSC_KEY" \
//   FORK_BSC_BLOCK=97368808 \
//   npx hardhat test test/integration/full-flow.test.js

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const INIT_CODE_HASH = "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";

const TIER = { TIER_80: 0, TIER_90: 1, TIER_95: 2, TIER_98: 3 };

const TOTAL_SUPPLY = ethers.parseEther("1000000000");
const BURN_AMOUNT = ethers.parseEther("500000000");
const PRESALE_AMOUNT = ethers.parseEther("200000000");

const ONE_DAY = 86_400;
const HALF_DAY = 43_200;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

async function blockTimestamp() {
	const block = await ethers.provider.getBlock("latest");
	return block.timestamp;
}

async function increaseTime(seconds) {
	await network.provider.send("evm_increaseTime", [Number(seconds)]);
	await network.provider.send("evm_mine", []);
}

async function isBscFork() {
	const code = await ethers.provider.getCode(PCS_FACTORY);
	return code !== "0x";
}

// -----------------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------------

describe("W41 — Agent Launch v3 End-to-End", function () {
	this.timeout(180_000);

	let deployer;
	let creator;
	let platformWallet;
	let alice;
	let bob;
	let carol;
	let dave;
	let eve;
	let factory;

	before(async function () {
		if (!(await isBscFork())) {
			const msg = "BSC fork not detected at PCS_FACTORY. Set FORK_BSC=true and FORK_BSC_URL to enable";
			if (process.env.REQUIRE_BSC_FORK === "true") {
				throw new Error(msg);
			}
			console.warn(`    (${msg})`);
			this.skip();
		}
	});

	beforeEach(async () => {
		[deployer, creator, platformWallet, alice, bob, carol, dave, eve] = await ethers.getSigners();

		const MockPortal = await ethers.getContractFactory("MockFlapPortal");
		const mockPortal = await MockPortal.deploy();
		await mockPortal.waitForDeployment();
		const portalCode = await ethers.provider.getCode(await mockPortal.getAddress());
		await ethers.provider.send("hardhat_setCode", [FLAP_PORTAL, portalCode]);

		const Factory = await ethers.getContractFactory("LaunchFactory");
		factory = await Factory.deploy(WBNB, PCS_FACTORY, PCS_ROUTER, INIT_CODE_HASH, platformWallet.address, FLAP_PORTAL);
		await factory.waitForDeployment();
	});

	// -------------------------------------------------------------------------
	// Helpers (factory-backed launch + manual graduation rig)
	// -------------------------------------------------------------------------

	async function createFactoryLaunch(tier, closeOffset = ONE_DAY) {
		const now = await blockTimestamp();
		const tx = await factory.createLaunch({
			name: "TestAgent",
			symbol: "TEST",
			metadataURI: "ipfs://test",
			creator: creator.address,
			tier,
			closeTimestamp: now + closeOffset,
		});
		const receipt = await tx.wait();
		const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");
		return {
			token: await ethers.getContractAt("AgentTokenV3", ev.args.token),
			vault: await ethers.getContractAt("LaunchVault", ev.args.vault),
			router: await ethers.getContractAt("BundleRouter", ev.args.router),
			splitter: await ethers.getContractAt("TaxSplitter", ev.args.taxSplitter),
			tokenAddr: ev.args.token,
			vaultAddr: ev.args.vault,
			routerAddr: ev.args.router,
			splitterAddr: ev.args.taxSplitter,
			presaleCap: ev.args.presaleCap,
			v2BuyBnb: ev.args.v2BuyBnb,
			vestingEnabled: ev.args.vestingEnabled,
		};
	}

	// Hand-wires a MockFlapToken (has bonding curve) with a fresh
	// LaunchVault + BundleRouter so the launch+graduation flow can be
	// tested end-to-end against a real PCS V2 fork.
	async function deployGraduationRig({
		vestingEnabled,
		closeOffset = ONE_DAY,
		presaleCap = ethers.parseEther("32"),
		bnbForBuy = ethers.parseEther("16"),
	}) {
		const FlapToken = await ethers.getContractFactory("MockFlapToken");
		const flap = await FlapToken.deploy(PCS_ROUTER, PCS_FACTORY, WBNB);
		await flap.waitForDeployment();

		const Router = await ethers.getContractFactory("BundleRouter");
		const router = await Router.deploy(WBNB, PCS_FACTORY, PCS_ROUTER, INIT_CODE_HASH, FLAP_PORTAL);
		await router.waitForDeployment();

		const now = await blockTimestamp();
		const Vault = await ethers.getContractFactory("LaunchVault");
		const vault = await Vault.deploy(
			creator.address,
			await router.getAddress(),
			PRESALE_AMOUNT,
			presaleCap,
			bnbForBuy,
			500, // 5% penalty
			vestingEnabled,
			now + closeOffset,
		);
		await vault.waitForDeployment();
		await router.transferOwnership(await vault.getAddress());

		return { flap, router, vault };
	}

	// =========================================================================
	// 1. Tier 80 happy path (no V2 buy, no vesting)
	// =========================================================================

	describe("Tier 80 happy path", () => {
		it("deploys factory artifacts with correct allocations", async () => {
			const launch = await createFactoryLaunch(TIER.TIER_80);

			expect(await launch.token.totalSupply()).to.equal(TOTAL_SUPPLY);
			expect(await launch.token.balanceOf(DEAD)).to.equal(BURN_AMOUNT);
			expect(await launch.token.balanceOf(launch.vaultAddr)).to.equal(PRESALE_AMOUNT * 2n);
			expect(await launch.vault.vestingEnabled()).to.equal(false);
			expect(await launch.vault.presaleTokens()).to.equal(PRESALE_AMOUNT);
			expect(await launch.presaleCap).to.equal(ethers.parseEther("16"));
			expect(await launch.v2BuyBnb).to.equal(0);
			expect(await launch.vestingEnabled).to.equal(false);
		});

		it("accepts deposits, closes, and exposes 100% allocation immediately", async () => {
			const { vault } = await createFactoryLaunch(TIER.TIER_80);

			await vault.connect(alice).deposit({ value: ethers.parseEther("8") });
			await vault.connect(bob).deposit({ value: ethers.parseEther("8") });
			expect(await vault.totalDeposited()).to.equal(ethers.parseEther("16"));
			expect(await vault.depositorCount()).to.equal(2);

			await vault.connect(creator).close();
			expect(await vault.state()).to.equal(1); // CLOSED

			// Pre-launch allocations are informational and should be 50/50.
			const aliceAlloc = await vault.allocationOf(alice.address);
			const bobAlloc = await vault.allocationOf(bob.address);
			expect(aliceAlloc).to.equal(PRESALE_AMOUNT / 2n);
			expect(bobAlloc).to.equal(PRESALE_AMOUNT / 2n);
		});

		it("factory vault.launch creates a PCS V2 pair for AgentTokenV3", async () => {
			const { token, tokenAddr, vault } = await createFactoryLaunch(TIER.TIER_80);

			await vault.connect(alice).deposit({ value: ethers.parseEther("8") });
			await vault.connect(bob).deposit({ value: ethers.parseEther("8") });
			await vault.connect(creator).close();
			await vault.connect(creator).launch(tokenAddr, 0, (await blockTimestamp()) + 3600);

			const pcsFactory = await ethers.getContractAt("IPancakeFactory", PCS_FACTORY);
			const pair = await pcsFactory.getPair(tokenAddr, WBNB);
			expect(pair).to.not.equal(ethers.ZeroAddress);
			expect(await vault.state()).to.equal(2);
			expect(await token.balanceOf(await vault.getAddress())).to.equal(PRESALE_AMOUNT);
		});

		it("withdraw applies 5% penalty and grows bonus pool", async () => {
			const { vault } = await createFactoryLaunch(TIER.TIER_80);

			await vault.connect(alice).deposit({ value: ethers.parseEther("10") });

			const before = await ethers.provider.getBalance(alice.address);
			const tx = await vault.connect(alice).withdrawAll();
			const receipt = await tx.wait();
			const gas = receipt.gasUsed * receipt.gasPrice;
			const after = await ethers.provider.getBalance(alice.address);

			expect(after - before + gas).to.equal(ethers.parseEther("9.5"));
			expect(await vault.bonusPool()).to.equal(ethers.parseEther("0.5"));
			expect(await vault.totalDeposited()).to.equal(0);
		});
	});

	// =========================================================================
	// 2. Tier 90 happy path (V2 buy, 50/50/24h vesting)
	// =========================================================================

	describe("Tier 90 happy path", () => {
		it("factory wires vesting and v2BuyBnb correctly", async () => {
			const launch = await createFactoryLaunch(TIER.TIER_90);
			expect(launch.presaleCap).to.equal(ethers.parseEther("32"));
			expect(launch.v2BuyBnb).to.equal(ethers.parseEther("16"));
			expect(launch.vestingEnabled).to.equal(true);
			expect(await launch.vault.vestingEnabled()).to.equal(true);
		});

		it("end-to-end: deposit, close, launch, V2 graduation, claim with 50/50/24h vesting", async () => {
			const { flap, router, vault } = await deployGraduationRig({ vestingEnabled: true });

			// 5 presalers totalling 32 BNB at the cap.
			const deposits = [
				[alice, ethers.parseEther("12")],
				[bob, ethers.parseEther("10")],
				[carol, ethers.parseEther("6")],
				[dave, ethers.parseEther("4")],
			];
			for (const [signer, amount] of deposits) {
				await vault.connect(signer).deposit({ value: amount });
			}
			expect(await vault.totalDeposited()).to.equal(ethers.parseEther("32"));
			expect(await vault.depositorCount()).to.equal(4);

			expect(await vault.bonusPool()).to.equal(0n);
			expect(await vault.totalDeposited()).to.equal(ethers.parseEther("32"));

			// Owner closes.
			await vault.connect(creator).close();
			expect(await vault.state()).to.equal(1); // CLOSED

			// Owner launches. Vault calls the router, which executes the bundle in this tx.
			const flapAddr = await flap.getAddress();
			const routerAddr = await router.getAddress();
			const deadBalBefore = await flap.balanceOf(DEAD);
			await vault.connect(creator).launch(flapAddr, 0, (await blockTimestamp()) + 3600);
			expect(await vault.state()).to.equal(2); // LAUNCHED
			expect(await vault.totalDepositedAtLaunch()).to.equal(ethers.parseEther("32"));

			expect(await flap.graduated()).to.equal(true);
			const v2Pair = await flap.v2Pair();
			expect(v2Pair).to.not.equal(ethers.ZeroAddress);
			expect(await flap.balanceOf(DEAD)).to.be.gt(deadBalBefore);
			expect(await ethers.provider.getBalance(routerAddr)).to.equal(0);
			expect(await flap.balanceOf(routerAddr)).to.equal(0);
			expect(await flap.balanceOf(await vault.getAddress())).to.be.gte(PRESALE_AMOUNT);

			// TGE claim: vesting is 50/50/24h, so each presaler gets 50% now.
			// Allocations are pro-rata over 32 BNB snapshot:
			const aliceAlloc = (PRESALE_AMOUNT * 12n) / 32n;
			const bobAlloc = (PRESALE_AMOUNT * 10n) / 32n;
			const carolAlloc = (PRESALE_AMOUNT * 6n) / 32n;
			const daveAlloc = (PRESALE_AMOUNT * 4n) / 32n;

			expect(await vault.allocationOf(alice.address)).to.equal(aliceAlloc);
			expect(await vault.allocationOf(bob.address)).to.equal(bobAlloc);
			expect(await vault.allocationOf(carol.address)).to.equal(carolAlloc);
			expect(await vault.allocationOf(dave.address)).to.equal(daveAlloc);

			await vault.connect(alice).claim();
			// MockFlapToken applies a 3% tax on transfers from non-exempt
			// senders; the vault is not exempt on the mock, so net received
			// is 97% of half allocation.
			const tge50 = aliceAlloc / 2n;
			const tge50Net = (tge50 * 97n) / 100n;
			expect(await flap.balanceOf(alice.address)).to.equal(tge50Net);

			// Fast-forward 12h: vested should be ~75% (50% + 25% linear).
			await increaseTime(HALF_DAY);
			const aliceVested12h = await vault.vestedOf(alice.address);
			const expectedAt12h = (aliceAlloc * 7500n) / 10000n;
			expect(aliceVested12h).to.equal(expectedAt12h);

			await vault.connect(alice).claim();
			const claimableExtra12h = expectedAt12h - tge50;
			const cumNetExpected12h = tge50Net + (claimableExtra12h * 97n) / 100n;
			expect(await flap.balanceOf(alice.address)).to.equal(cumNetExpected12h);

			// Fast-forward another 12h+: should be 100% vested.
			await increaseTime(HALF_DAY + 60);
			const aliceVestedDone = await vault.vestedOf(alice.address);
			expect(aliceVestedDone).to.equal(aliceAlloc);

			await vault.connect(alice).claim();
			const claimableLast = aliceAlloc - expectedAt12h;
			const cumNetExpectedDone = cumNetExpected12h + (claimableLast * 97n) / 100n;
			expect(await flap.balanceOf(alice.address)).to.equal(cumNetExpectedDone);

			// Cumulative claimed in vault accounting equals full allocation.
			const aliceState = await vault.depositors(alice.address);
			expect(aliceState.claimed).to.equal(aliceAlloc);

			// Other presalers can still claim their full allocations.
			await vault.connect(bob).claim();
			await vault.connect(carol).claim();
			await vault.connect(dave).claim();

			expect((await vault.depositors(bob.address)).claimed).to.equal(bobAlloc);
			expect((await vault.depositors(carol.address)).claimed).to.equal(carolAlloc);
			expect((await vault.depositors(dave.address)).claimed).to.equal(daveAlloc);
		});
	});

	// =========================================================================
	// 3. Cap not hit (deposit < cap, launch with smaller V2 buy)
	// =========================================================================

	describe("Cap not hit (under-subscribed launch)", () => {
		it("under-subscribed launches use refund path", async () => {
			const { flap, vault } = await deployGraduationRig({ vestingEnabled: true, bnbForBuy: ethers.parseEther("16") });

			await vault.connect(alice).deposit({ value: ethers.parseEther("10") });
			await vault.connect(bob).deposit({ value: ethers.parseEther("6") });
			await vault.connect(carol).deposit({ value: ethers.parseEther("4") });
			expect(await vault.totalDeposited()).to.equal(ethers.parseEther("20"));

			await vault.connect(creator).close();

			const flapAddr = await flap.getAddress();
			await expect(
				vault.connect(creator).launch(flapAddr, 0, (await blockTimestamp()) + 3600),
			).to.be.revertedWithCustomError(vault, "UnderSubscribed");
			await vault.connect(creator).enableRefunds();
			await expect(
				vault.connect(creator).launch(flapAddr, 0, (await blockTimestamp()) + 3600),
			).to.be.revertedWithCustomError(vault, "UnderSubscribed");
			await vault.connect(alice).refund();
			expect((await vault.depositors(alice.address)).deposited).to.equal(0);
		});
	});

	// =========================================================================
	// 4. Reverts and edge cases
	// =========================================================================

	describe("Reverts and edge cases", () => {
		it("cannot deposit when CLOSED", async () => {
			const { vault } = await createFactoryLaunch(TIER.TIER_80);
			await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
			await vault.connect(creator).close();
			await expect(vault.connect(alice).deposit({ value: ethers.parseEther("1") })).to.be.revertedWithCustomError(
				vault,
				"InvalidState",
			);
		});

		it("cannot withdraw when CLOSED", async () => {
			const { vault } = await createFactoryLaunch(TIER.TIER_80);
			await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
			await vault.connect(creator).close();
			await expect(vault.connect(alice).withdrawAll()).to.be.revertedWithCustomError(vault, "InvalidState");
		});

		it("cannot claim before launched", async () => {
			const { vault } = await createFactoryLaunch(TIER.TIER_80);
			await vault.connect(alice).deposit({ value: ethers.parseEther("1") });
			await vault.connect(creator).close();
			await expect(vault.connect(alice).claim()).to.be.revertedWithCustomError(vault, "InvalidState");
		});

		it("cannot launch twice", async () => {
			const { flap, vault } = await deployGraduationRig({ vestingEnabled: false, bnbForBuy: 0n });
			await vault.connect(alice).deposit({ value: ethers.parseEther("32") });
			await vault.connect(creator).close();
			const flapAddr = await flap.getAddress();
			await vault.connect(creator).launch(flapAddr, 0, (await blockTimestamp()) + 3600);

			await expect(
				vault.connect(creator).launch(flapAddr, 0, (await blockTimestamp()) + 3600),
			).to.be.revertedWithCustomError(vault, "InvalidState");
		});

		it("non-owner cannot launch", async () => {
			const { flap, vault } = await deployGraduationRig({ vestingEnabled: false });
			await vault.connect(alice).deposit({ value: ethers.parseEther("16") });
			await vault.connect(creator).close();
			await expect(
				vault.connect(alice).launch(await flap.getAddress(), 0, (await blockTimestamp()) + 3600),
			).to.be.revertedWithCustomError(vault, "NotOwner");
		});

		it("router execute reverts for non-vault", async () => {
			const { flap, router } = await deployGraduationRig({ vestingEnabled: false });
			const deadline = (await blockTimestamp()) + 3600;
			await expect(
				router.connect(alice).execute(
					{
						flapToken: await flap.getAddress(),
						curveFillBnb: ethers.parseEther("16"),
						v2BuyBnb: ethers.parseEther("16"),
						minTokensFromV2: 0,
						deadline,
					},
					{ value: ethers.parseEther("32") },
				),
			).to.be.revertedWithCustomError(router, "Unauthorized");
		});

		it("router execute reverts on slippage", async () => {
			const { flap, router } = await deployGraduationRig({ vestingEnabled: false });
			const deadline = (await blockTimestamp()) + 3600;
			await expect(
				router.connect(deployer).execute(
					{
						flapToken: await flap.getAddress(),
						curveFillBnb: ethers.parseEther("16"),
						v2BuyBnb: ethers.parseEther("16"),
						minTokensFromV2: ethers.parseEther("9999999999"),
						deadline,
					},
					{ value: ethers.parseEther("32") },
				),
			).to.be.reverted;
		});

		it("factory rejects zero creator", async () => {
			const now = await blockTimestamp();
			await expect(
				factory.createLaunch({
					name: "X",
					symbol: "X",
					metadataURI: "ipfs://x",
					creator: ethers.ZeroAddress,
					tier: TIER.TIER_80,
					closeTimestamp: now + ONE_DAY,
				}),
			).to.be.revertedWithCustomError(factory, "InvalidCreator");
		});

		it("factory rejects past closeTimestamp", async () => {
			await expect(
				factory.createLaunch({
					name: "X",
					symbol: "X",
					metadataURI: "ipfs://x",
					creator: creator.address,
					tier: TIER.TIER_80,
					closeTimestamp: 1,
				}),
			).to.be.revertedWithCustomError(factory, "InvalidCloseTimestamp");
		});
	});

	// =========================================================================
	// 5. Multiple presalers pro-rata correctness
	// =========================================================================

	describe("Multiple presalers pro-rata", () => {
		it("allocation is exactly proportional to deposits at the launch snapshot", async () => {
			const { vault } = await createFactoryLaunch(TIER.TIER_98);

			// 4 presalers; deposit fractions designed to expose rounding.
			await vault.connect(alice).deposit({ value: ethers.parseEther("100") });
			await vault.connect(bob).deposit({ value: ethers.parseEther("33") });
			await vault.connect(carol).deposit({ value: ethers.parseEther("17") });
			await vault.connect(dave).deposit({ value: ethers.parseEther("10") });

			const total = ethers.parseEther("160");
			expect(await vault.totalDeposited()).to.equal(total);

			const aliceAlloc = await vault.allocationOf(alice.address);
			const bobAlloc = await vault.allocationOf(bob.address);
			const carolAlloc = await vault.allocationOf(carol.address);
			const daveAlloc = await vault.allocationOf(dave.address);

			expect(aliceAlloc).to.equal((PRESALE_AMOUNT * 100n) / 160n);
			expect(bobAlloc).to.equal((PRESALE_AMOUNT * 33n) / 160n);
			expect(carolAlloc).to.equal((PRESALE_AMOUNT * 17n) / 160n);
			expect(daveAlloc).to.equal((PRESALE_AMOUNT * 10n) / 160n);

			// Sum of allocations should never exceed presaleTokens.
			const sum = aliceAlloc + bobAlloc + carolAlloc + daveAlloc;
			expect(sum).to.be.lte(PRESALE_AMOUNT);
		});

		it("snapshot at launch is independent of post-launch state changes", async () => {
			const { flap, vault } = await deployGraduationRig({ vestingEnabled: false });

			await vault.connect(alice).deposit({ value: ethers.parseEther("16") });
			await vault.connect(bob).deposit({ value: ethers.parseEther("16") });
			await vault.connect(creator).close();
			await vault.connect(creator).launch(await flap.getAddress(), 0, (await blockTimestamp()) + 3600);

			expect(await vault.totalDepositedAtLaunch()).to.equal(ethers.parseEther("32"));
			// Post-launch allocation uses the snapshot, not live totalDeposited.
			expect(await vault.allocationOf(alice.address)).to.equal(PRESALE_AMOUNT / 2n);
			expect(await vault.allocationOf(bob.address)).to.equal(PRESALE_AMOUNT / 2n);
		});
	});

	// =========================================================================
	// 6. Auto-close after closeTimestamp
	// =========================================================================

	describe("Auto-close after closeTimestamp", () => {
		it("non-owner can close once timestamp passes", async () => {
			const { vault } = await createFactoryLaunch(TIER.TIER_80, 100);
			await vault.connect(alice).deposit({ value: ethers.parseEther("5") });
			await increaseTime(200);
			await vault.connect(bob).close();
			expect(await vault.state()).to.equal(1);
		});

		it("non-owner cannot close before timestamp", async () => {
			const { vault } = await createFactoryLaunch(TIER.TIER_80, ONE_DAY);
			await vault.connect(alice).deposit({ value: ethers.parseEther("5") });
			await expect(vault.connect(bob).close()).to.be.revertedWithCustomError(vault, "NotAuthorizedToClose");
		});
	});

	// =========================================================================
	// 7. Per-agent TaxSplitter wiring (W40c / V3 audit C-5)
	// =========================================================================

	describe("Per-agent TaxSplitter wiring", () => {
		it("taxed transfer routes 90% to creator and 10% to platform via release(token)", async () => {
			const launch = await createFactoryLaunch(TIER.TIER_80);
			const { token, splitter, splitterAddr, vault } = launch;

			// Bring tokens onto the open market: alice deposits, vault closes,
			// then we drop tokens directly into alice via the vault's tax-exempt
			// transfer so we can stage a taxable transfer downstream.
			await vault.connect(alice).deposit({ value: ethers.parseEther("8") });
			await vault.connect(bob).deposit({ value: ethers.parseEther("8") });
			await vault.connect(creator).close();

			// Vault is tax-exempt, so impersonate it to fund alice with tokens
			// without paying tax (mimics a post-launch claim path on the cheap).
			const vaultAddr = await vault.getAddress();
			await network.provider.send("hardhat_impersonateAccount", [vaultAddr]);
			await network.provider.send("hardhat_setBalance", [vaultAddr, "0x56BC75E2D63100000"]);
			const vaultSigner = await ethers.getSigner(vaultAddr);
			const transferAmount = ethers.parseEther("1000");
			await token.connect(vaultSigner).transfer(alice.address, transferAmount);
			await network.provider.send("hardhat_stopImpersonatingAccount", [vaultAddr]);

			// alice → bob is a taxable transfer (neither is exempt). 3% to splitter.
			const sendAmount = ethers.parseEther("100");
			const expectedTax = (sendAmount * 300n) / 10000n;

			const splitterBefore = await token.balanceOf(splitterAddr);
			await token.connect(alice).transfer(bob.address, sendAmount);
			const splitterAfter = await token.balanceOf(splitterAddr);
			expect(splitterAfter - splitterBefore).to.equal(expectedTax);

			// release(token) splits 90% to creator and 10% to platform wallet.
			const creatorBefore = await token.balanceOf(creator.address);
			const platformBefore = await token.balanceOf(platformWallet.address);
			await splitter.release(await token.getAddress());
			const creatorAfter = await token.balanceOf(creator.address);
			const platformAfter = await token.balanceOf(platformWallet.address);

			const creatorCut = (expectedTax * 9000n) / 10000n;
			const platformCut = (expectedTax * 1000n) / 10000n;
			expect(creatorAfter - creatorBefore).to.equal(creatorCut);
			expect(platformAfter - platformBefore).to.equal(platformCut);
			expect(await token.balanceOf(splitterAddr)).to.equal(0n);
		});
	});
});
