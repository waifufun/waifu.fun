// SPDX-License-Identifier: MIT
// Real BSC fork coverage for a graduated TOKEN_TAXED_V3 with asymmetric taxes.

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const INIT_CODE_HASH = "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";

// The task prompt's shortened PTCG address is not a valid EVM address. This is
// the real PTCG token from C3_FLAP_INTEGRATION_RESEARCH.md.
const PTCG = "0x262F39B6ED3Af1F7A161c34fBbcAA66bfBC87777";
const PTCG_PAIR = "0xC3A3563F7236B04580D1200F409eE0834683bE49";

const PCS_FACTORY_ABI = ["function getPair(address tokenA, address tokenB) view returns (address)"];
const PCS_ROUTER_ABI = [
	"function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin,address[] calldata path,address to,uint deadline) external payable",
	"function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) external",
];
const TOKEN_ABI = [
	"function balanceOf(address) view returns (uint256)",
	"function approve(address spender,uint256 amount) returns (bool)",
	"function buyTaxRate() view returns (uint256)",
	"function sellTaxRate() view returns (uint256)",
];

async function now() {
	return (await ethers.provider.getBlock("latest")).timestamp;
}

function parseLog(contract, log) {
	try {
		return contract.interface.parseLog(log);
	} catch (_) {
		return null;
	}
}

describe("real fork asymmetric tax: PTCG TOKEN_TAXED_V3", function () {
	this.timeout(180_000);
	let owner;
	let snapshotId;

	before(async function () {
		if (process.env.FORK_BSC !== "true") {
			if (process.env.REQUIRE_BSC_FORK === "true") throw new Error("FORK_BSC=true is required");
			this.skip();
		}
		await network.provider.send("evm_mine", []);
		expect(await ethers.provider.getCode(PTCG)).to.not.equal("0x");
		expect(await ethers.provider.getCode(PTCG_PAIR)).to.not.equal("0x");
	});

	beforeEach(async () => {
		snapshotId = await ethers.provider.send("evm_snapshot", []);
		[owner] = await ethers.getSigners();
	});

	afterEach(async () => {
		if (snapshotId) await ethers.provider.send("evm_revert", [snapshotId]);
		snapshotId = undefined;
	});

	it("uses the real buyTaxRate for BundleExecuted.tokensToTax and observes the higher sell tax", async () => {
		const pcsFactory = new ethers.Contract(PCS_FACTORY, PCS_FACTORY_ABI, ethers.provider);
		expect(await pcsFactory.getPair(PTCG, WBNB)).to.equal(PTCG_PAIR);

		const ptcg = new ethers.Contract(PTCG, TOKEN_ABI, owner);
		const buyTax = await ptcg.buyTaxRate();
		const sellTax = await ptcg.sellTaxRate();
		expect(buyTax).to.equal(300n);
		expect(sellTax).to.equal(400n);

		const BundleRouter = await ethers.getContractFactory("BundleRouter");
		const bundle = await BundleRouter.deploy(WBNB, PCS_FACTORY, PCS_ROUTER, INIT_CODE_HASH, FLAP_PORTAL);
		await bundle.waitForDeployment();

		const tx = await bundle.execute(
			{
				flapToken: PTCG,
				curveFillBnb: 0,
				v2BuyBnb: ethers.parseEther("0.25"),
				minTokensFromV2: 0,
				deadline: (await now()) + 3600,
			},
			{ value: ethers.parseEther("0.25") },
		);
		const receipt = await tx.wait();
		const event = receipt.logs.map((log) => parseLog(bundle, log)).find((log) => log?.name === "BundleExecuted");
		expect(event, "BundleExecuted").to.not.equal(undefined);
		const expectedTax = (event.args.tokensBurned * 10_000n) / (10_000n - buyTax) - event.args.tokensBurned;
		expect(event.args.tokensToTax).to.equal(expectedTax);
		expect(event.args.tokensToTax).to.equal((event.args.tokensBurned * 10_000n) / 9700n - event.args.tokensBurned);

		const pcsRouter = new ethers.Contract(PCS_ROUTER, PCS_ROUTER_ABI, owner);
		await pcsRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [WBNB, PTCG], owner.address, (await now()) + 3600, {
			value: ethers.parseEther("0.1"),
		});
		const ptcgBalance = await ptcg.balanceOf(owner.address);
		expect(ptcgBalance).to.be.gt(0n);
		await ptcg.approve(PCS_ROUTER, ptcgBalance / 2n);
		await expect(
			pcsRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(
				ptcgBalance / 2n,
				0,
				[PTCG, WBNB],
				owner.address,
				(await now()) + 3600,
			),
		).to.not.be.reverted;
	});
});
