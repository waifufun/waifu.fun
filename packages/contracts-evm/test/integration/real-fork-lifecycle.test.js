// SPDX-License-Identifier: MIT
// Real BSC fork coverage for LaunchFactory + LaunchVault against real PCS V2.
// This intentionally does not mock PCS. Factory-minted AgentTokenV3 launches use
// BundleRouter's LP-inventory fallback, because they are not real Flap tokens.

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const INIT_CODE_HASH = "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";
const DEAD = "0x000000000000000000000000000000000000dEaD";

const PCS_FACTORY_ABI = ["function getPair(address tokenA, address tokenB) view returns (address)"];
const PCS_ROUTER_ABI = [
	"function swapExactETHForTokensSupportingFeeOnTransferTokens(uint amountOutMin,address[] calldata path,address to,uint deadline) external payable",
	"function swapExactTokensForETHSupportingFeeOnTransferTokens(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) external",
];

const TIER_95 = 2;
const TOTAL_SUPPLY = ethers.parseEther("1000000000");
const INITIAL_BURN = ethers.parseEther("500000000");
const PRESALE_AMOUNT = ethers.parseEther("200000000");
const TREASURY_AMOUNT = ethers.parseEther("100000000");
const ONE_DAY = 86_400;

async function requireBscFork(ctx) {
	if (process.env.FORK_BSC !== "true") {
		if (process.env.REQUIRE_BSC_FORK === "true") throw new Error("FORK_BSC=true is required");
		ctx.skip();
	}
	for (const addr of [FLAP_PORTAL, PCS_ROUTER, PCS_FACTORY, WBNB]) {
		expect(await ethers.provider.getCode(addr), `${addr} has code`).to.not.equal("0x");
	}
}

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

describe("real fork lifecycle: LaunchFactory + real PCS V2", function () {
	this.timeout(240_000);
	let deployer;
	let creator;
	let platform;
	let alice;
	let bob;
	let carol;
	let dave;
	let snapshotId;

	before(async function () {
		await requireBscFork(this);
	});

	beforeEach(async () => {
		snapshotId = await ethers.provider.send("evm_snapshot", []);
		[deployer, creator, platform, alice, bob, carol, dave] = await ethers.getSigners();
	});

	afterEach(async () => {
		if (snapshotId) await ethers.provider.send("evm_revert", [snapshotId]);
		snapshotId = undefined;
	});

	async function createLaunch() {
		const Factory = await ethers.getContractFactory("LaunchFactory");
		const factory = await Factory.deploy(WBNB, PCS_FACTORY, PCS_ROUTER, INIT_CODE_HASH, platform.address, FLAP_PORTAL);
		await factory.waitForDeployment();

		const tx = await factory.createLaunch({
			name: "RealForkAgent",
			symbol: "RFORK",
			metadataURI: "ipfs://real-fork",
			creator: creator.address,
			tier: TIER_95,
			closeTimestamp: (await now()) + ONE_DAY,
		});
		const receipt = await tx.wait();
		const ev = receipt.logs.find((l) => l.fragment?.name === "LaunchCreated");
		const token = await ethers.getContractAt("AgentTokenV3", ev.args.token);
		const vault = await ethers.getContractAt("LaunchVault", ev.args.vault);
		const router = await ethers.getContractAt("BundleRouter", ev.args.router);
		const splitter = await ethers.getContractAt("TaxSplitter", ev.args.taxSplitter);
		return { factory, token, vault, router, splitter, ev };
	}

	it("runs a tier 95 factory launch through real PCS V2 and claims presale tokens", async () => {
		const { token, vault, router, splitter, ev } = await createLaunch();
		const tokenAddr = await token.getAddress();
		const vaultAddr = await vault.getAddress();
		const routerAddr = await router.getAddress();
		const treasuryAddr = ev.args.treasuryReserve;

		expect(tokenAddr).to.not.equal(ethers.ZeroAddress);
		expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
		expect(routerAddr).to.not.equal(ethers.ZeroAddress);
		expect(ev.args.taxSplitter).to.not.equal(ethers.ZeroAddress);
		expect(treasuryAddr).to.not.equal(ethers.ZeroAddress);
		expect(await router.owner()).to.equal(vaultAddr);

		expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
		expect(await token.balanceOf(DEAD)).to.equal(INITIAL_BURN);
		expect(await token.balanceOf(vaultAddr)).to.equal(PRESALE_AMOUNT * 2n);
		expect(await token.balanceOf(treasuryAddr)).to.equal(TREASURY_AMOUNT);

		const deposits = [ethers.parseEther("16"), ethers.parseEther("16"), ethers.parseEther("16"), ethers.parseEther("16")];
		for (const [i, signer] of [alice, bob, carol, dave].entries()) {
			await vault.connect(signer).deposit({ value: deposits[i] });
		}
		expect(await vault.totalDeposited()).to.equal(ethers.parseEther("64"));

		await network.provider.send("evm_increaseTime", [ONE_DAY + 1]);
		await network.provider.send("evm_mine", []);
		await vault.connect(alice).close();
		expect(await vault.state()).to.equal(1);

		const launchTx = await vault.connect(creator).launch(tokenAddr, 0, (await now()) + 3600);
		const launchReceipt = await launchTx.wait();
		const bundleEvent = launchReceipt.logs.map((log) => parseLog(router, log)).find((log) => log?.name === "BundleExecuted");
		expect(bundleEvent, "BundleRouter.execute emitted").to.not.equal(undefined);
		expect(bundleEvent.args.curveFillBnb).to.equal(ethers.parseEther("16"));
		expect(bundleEvent.args.v2BuyBnb).to.equal(ethers.parseEther("48"));
		expect(bundleEvent.args.tokensBurned).to.be.gt(ethers.parseEther("145000000"));

		const pcsFactory = new ethers.Contract(PCS_FACTORY, PCS_FACTORY_ABI, ethers.provider);
		const pair = await pcsFactory.getPair(tokenAddr, WBNB);
		expect(pair).to.not.equal(ethers.ZeroAddress);
		expect(await token.balanceOf(DEAD)).to.be.gt(INITIAL_BURN + ethers.parseEther("145000000"));
		expect(await vault.state()).to.equal(2);
		expect(await token.balanceOf(vaultAddr)).to.equal(PRESALE_AMOUNT);

		for (const signer of [alice, bob, carol, dave]) {
			await vault.connect(signer).claim();
			expect(await token.balanceOf(signer.address)).to.equal(PRESALE_AMOUNT / 8n);
		}

		const pcsRouter = new ethers.Contract(PCS_ROUTER, PCS_ROUTER_ABI, alice);
		const deadline = (await now()) + 3600;
		const splitterBefore = await token.balanceOf(ev.args.taxSplitter);
		await pcsRouter.swapExactETHForTokensSupportingFeeOnTransferTokens(0, [WBNB, tokenAddr], alice.address, deadline, {
			value: ethers.parseEther("1"),
		});
		const afterBuyTax = await token.balanceOf(ev.args.taxSplitter);
		expect(afterBuyTax).to.be.gt(splitterBefore);

		const sellAmount = (await token.balanceOf(alice.address)) / 5n;
		await token.connect(alice).approve(PCS_ROUTER, sellAmount);
		await pcsRouter.swapExactTokensForETHSupportingFeeOnTransferTokens(sellAmount, 0, [tokenAddr, WBNB], alice.address, deadline);
		const afterSellTax = await token.balanceOf(ev.args.taxSplitter);
		expect(afterSellTax).to.be.gt(afterBuyTax);

		const creatorBefore = await token.balanceOf(creator.address);
		const platformBefore = await token.balanceOf(platform.address);
		await splitter.release(tokenAddr);
		const creatorDelta = (await token.balanceOf(creator.address)) - creatorBefore;
		const platformDelta = (await token.balanceOf(platform.address)) - platformBefore;
		expect(creatorDelta).to.be.gt(platformDelta * 8n);
		expect(platformDelta).to.be.gt(0n);
	});
});
