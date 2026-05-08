const { expect } = require("chai");
const { ethers } = require("hardhat");

// PCS V2 addresses (BSC mainnet — used on local fork OR with mocks)
const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const INIT_CODE_HASH = "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";

describe("BundleRouter (LaunchRouter)", () => {
	let owner;
	let attacker;
	let router;
	let flapToken;

	const CURVE_FILL = ethers.parseEther("16");
	const V2_BUY = ethers.parseEther("16"); // 90% tier
	const TOTAL_BNB = CURVE_FILL + V2_BUY;

	beforeEach(async function () {
		[owner, attacker] = await ethers.getSigners();

		let factoryAddr;
		let routerAddr;
		let wbnbAddr;

		// Check if BSC fork is active by reading PCS factory code
		const factoryCode = await ethers.provider.getCode(PCS_FACTORY);
		if (factoryCode === "0x") {
			// Not on a BSC fork, skip
			this.skip();
			return;
		}
		factoryAddr = PCS_FACTORY;
		routerAddr = PCS_ROUTER;
		wbnbAddr = WBNB;

		const MockFlap = await ethers.getContractFactory("MockFlapToken");
		flapToken = await MockFlap.deploy(routerAddr, factoryAddr, wbnbAddr);
		await flapToken.waitForDeployment();

		const BundleRouter = await ethers.getContractFactory("BundleRouter");
		router = await BundleRouter.deploy(wbnbAddr, factoryAddr, routerAddr, INIT_CODE_HASH);
		await router.waitForDeployment();
	});

	describe("execute — full flow", () => {
		it("fills curve, buys from V2, burns tokens", async () => {
			const deadline = Math.floor(Date.now() / 1000) + 3600;

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

			// Router keeps curve tokens (these get allocated to presale/treasury later)
			// Only V2-bought tokens are burned in the same tx
			const routerBalance = await flapToken.balanceOf(await router.getAddress());
			// routerBalance should have curve tokens but no V2-buy tokens
			expect(routerBalance).to.be.gt(0); // curve tokens are here

			// Verify event emitted
			const routerAddr = await router.getAddress();
			const events = receipt.logs.filter((l) => l.address.toLowerCase() === routerAddr.toLowerCase());
			expect(events.length).to.be.gte(1);
		});
	});

	describe("execute — curve only (0 V2 buy)", () => {
		it("fills curve without V2 buy", async () => {
			const deadline = Math.floor(Date.now() / 1000) + 3600;

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

	describe("reverts", () => {
		it("reverts on non-owner call", async () => {
			const deadline = Math.floor(Date.now() / 1000) + 3600;
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
			const deadline = Math.floor(Date.now() / 1000) + 3600;
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
			const deadline = Math.floor(Date.now() / 1000) + 3600;
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
			const deadline = Math.floor(Date.now() / 1000) + 3600;
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
			const deadline = Math.floor(Date.now() / 1000) + 3600;
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
