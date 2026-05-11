const { expect } = require("chai");
const { ethers } = require("hardhat");

// PCS V2 addresses (BSC mainnet — used on local fork OR with mocks)
const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const INIT_CODE_HASH = "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";

describe("BundleRouter (LaunchRouter)", () => {
	let owner;
	let attacker;
	let router;
	let flapToken;
	let snapshotId;

	const CURVE_FILL = ethers.parseEther("16");
	const V2_BUY = ethers.parseEther("16"); // 90% tier
	const TOTAL_BNB = CURVE_FILL + V2_BUY;

	beforeEach(async function () {
		snapshotId = await ethers.provider.send("evm_snapshot", []);
		[owner, attacker] = await ethers.getSigners();

		// Check if BSC fork is active by reading PCS factory code
		const factoryCode = await ethers.provider.getCode(PCS_FACTORY);
		if (factoryCode === "0x") {
			const msg = "BSC fork not detected at PCS_FACTORY. Set FORK_BSC=true and FORK_BSC_URL to enable";
			if (process.env.REQUIRE_BSC_FORK === "true") {
				throw new Error(msg);
			}
			this.skip();
			return;
		}
		const factoryAddr = PCS_FACTORY;
		const routerAddr = PCS_ROUTER;
		const wbnbAddr = WBNB;

		const MockPortal = await ethers.getContractFactory("MockFlapPortal");
		const mockPortal = await MockPortal.deploy();
		await mockPortal.waitForDeployment();
		const portalCode = await ethers.provider.getCode(await mockPortal.getAddress());
		await ethers.provider.send("hardhat_setCode", [FLAP_PORTAL, portalCode]);

		const MockFlap = await ethers.getContractFactory("MockFlapToken");
		flapToken = await MockFlap.deploy(routerAddr, factoryAddr, wbnbAddr);
		await flapToken.waitForDeployment();

		const BundleRouter = await ethers.getContractFactory("BundleRouter");
		router = await BundleRouter.deploy(wbnbAddr, factoryAddr, routerAddr, INIT_CODE_HASH, FLAP_PORTAL);
		await router.waitForDeployment();
	});

	afterEach(async () => {
		if (snapshotId) {
			await ethers.provider.send("evm_revert", [snapshotId]);
			snapshotId = undefined;
		}
	});

	describe("execute — full flow", () => {
		it("executes through Portal correctly, fills curve, buys from V2, burns tokens", async () => {
			const deadline = 9_999_999_999;

			const tx = await router.execute(
				{
					flapToken: await flapToken.getAddress(),
					curveFillBnb: CURVE_FILL,
					v2BuyBnb: V2_BUY,
					minTokensFromV2: 0, // no slippage protection for test
					deadline,
				},
				{ value: TOTAL_BNB },
			);

			const receipt = await tx.wait();

			// Verify graduation happened
			expect(await flapToken.graduated()).to.be.true;

			// Verify V2 pair was created
			const pairAddr = await flapToken.v2Pair();
			expect(pairAddr).to.not.equal(ethers.ZeroAddress);

			// Verify tokens were burned (sent to DEAD) from V2 buy
			const deadBalance = await flapToken.balanceOf(DEAD);
			expect(deadBalance).to.be.gt(0);

			// Router forwards curve tokens to its vault/owner and does not retain token custody.
			const routerBalance = await flapToken.balanceOf(await router.getAddress());
			expect(routerBalance).to.equal(0);
			expect(await flapToken.balanceOf(owner.address)).to.be.gt(0);

			// Verify BundleRouter emitted tax accounting based on the token buy tax.
			await expect(tx).to.emit(router, "BundleExecuted");
			const event = receipt.logs
				.map((log) => {
					try {
						return router.interface.parseLog(log);
					} catch (_) {
						return null;
					}
				})
				.find((log) => log && log.name === "BundleExecuted");
			expect(event.args.tokensToTax).to.be.gt(0);
		});
	});

	describe("execute — curve only (0 V2 buy)", () => {
		it("fills curve without V2 buy", async () => {
			const deadline = 9_999_999_999;

			await router.execute(
				{
					flapToken: await flapToken.getAddress(),
					curveFillBnb: CURVE_FILL,
					v2BuyBnb: 0,
					minTokensFromV2: 0,
					deadline,
				},
				{ value: CURVE_FILL },
			);

			expect(await flapToken.graduated()).to.be.true;

			// No tokens burned (no V2 buy)
			const deadBalance = await flapToken.balanceOf(DEAD);
			expect(deadBalance).to.equal(0);
		});
	});

	describe("asymmetric tax accounting", () => {
		it("uses the token buy tax instead of assuming 3%", async () => {
			await flapToken.setTaxRates(400, 300);
			const deadline = 9_999_999_999;

			const tx = await router.execute(
				{
					flapToken: await flapToken.getAddress(),
					curveFillBnb: CURVE_FILL,
					v2BuyBnb: V2_BUY,
					minTokensFromV2: 0,
					deadline,
				},
				{ value: TOTAL_BNB },
			);
			const receipt = await tx.wait();
			const event = receipt.logs
				.map((log) => {
					try {
						return router.interface.parseLog(log);
					} catch (_) {
						return null;
					}
				})
				.find((log) => log && log.name === "BundleExecuted");

			const expectedTax = (event.args.tokensBurned * 10_000n) / 9_600n - event.args.tokensBurned;
			expect(event.args.tokensToTax).to.equal(expectedTax);
			expect(event.args.tokensToTax).to.not.equal((event.args.tokensBurned * 100n) / 97n - event.args.tokensBurned);
		});
	});

	describe("reverts", () => {
		it("reverts on non-vault call", async () => {
			const deadline = 9_999_999_999;
			await expect(
				router.connect(attacker).execute(
					{
						flapToken: await flapToken.getAddress(),
						curveFillBnb: CURVE_FILL,
						v2BuyBnb: V2_BUY,
						minTokensFromV2: 0,
						deadline,
					},
					{ value: TOTAL_BNB },
				),
			).to.be.revertedWithCustomError(router, "Unauthorized");
		});

		it("reverts on expired deadline", async () => {
			const deadline = 1; // way in the past
			await expect(
				router.execute(
					{
						flapToken: await flapToken.getAddress(),
						curveFillBnb: CURVE_FILL,
						v2BuyBnb: V2_BUY,
						minTokensFromV2: 0,
						deadline,
					},
					{ value: TOTAL_BNB },
				),
			).to.be.revertedWithCustomError(router, "Expired");
		});

		it("reverts on BNB mismatch", async () => {
			const deadline = 9_999_999_999;
			await expect(
				router.execute(
					{
						flapToken: await flapToken.getAddress(),
						curveFillBnb: CURVE_FILL,
						v2BuyBnb: V2_BUY,
						minTokensFromV2: 0,
						deadline,
					},
					{ value: ethers.parseEther("1") }, // wrong amount
				),
			).to.be.revertedWithCustomError(router, "BnbMismatch");
		});

		it("reverts on slippage (minTokensFromV2 too high)", async () => {
			const deadline = 9_999_999_999;
			await expect(
				router.execute(
					{
						flapToken: await flapToken.getAddress(),
						curveFillBnb: CURVE_FILL,
						v2BuyBnb: V2_BUY,
						minTokensFromV2: ethers.parseEther("999999999"), // impossibly high
						deadline,
					},
					{ value: TOTAL_BNB },
				),
			).to.be.reverted; // PCS router will revert with insufficient output
		});
	});

	describe("dust sweep", () => {
		it("sweeps remaining BNB back to owner", async () => {
			const deadline = 9_999_999_999;
			const balBefore = await ethers.provider.getBalance(owner.address);

			await router.execute(
				{
					flapToken: await flapToken.getAddress(),
					curveFillBnb: CURVE_FILL,
					v2BuyBnb: V2_BUY,
					minTokensFromV2: 0,
					deadline,
				},
				{ value: TOTAL_BNB },
			);

			// Router should have 0 BNB
			const routerBal = await ethers.provider.getBalance(await router.getAddress());
			expect(routerBal).to.equal(0);
		});
	});

	describe("previewPairAddress", () => {
		it("matches actual pair address after graduation", async () => {
			const predicted = await router.previewPairAddress(await flapToken.getAddress());

			// Graduate
			const deadline = 9_999_999_999;
			await router.execute(
				{
					flapToken: await flapToken.getAddress(),
					curveFillBnb: CURVE_FILL,
					v2BuyBnb: 0,
					minTokensFromV2: 0,
					deadline,
				},
				{ value: CURVE_FILL },
			);

			const actual = await flapToken.v2Pair();
			expect(predicted.toLowerCase()).to.equal(actual.toLowerCase());
		});
	});
});
