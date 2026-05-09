// SPDX-License-Identifier: MIT
// Real Flap V3 integration coverage for BundleRouter. Requires a BSC fork.

const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const FLAP_PORTAL = "0xe2cE6ab80874Fa9Fa2aAE65D277Dd6B8e65C9De0";
const INIT_CODE_HASH = "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";

const TEST1_TOKEN = "0x1f4d04b456b96893d8fe0467d07dc5d7ebfa7777";
const FORK_BLOCK = Number.parseInt(process.env.FORK_BSC_BLOCK || "97368808", 10);
const LAUNCHED_TO_DEX_TOPIC = "0x6e4f47630b8745b8cacbd44f42a8a33e7eea7cc08ef22fc7630f4f385784ff7d";

const FACTORY_ABI = ["function getPair(address tokenA, address tokenB) view returns (address)"];

describe("BundleRouter real Flap V3 fork", function () {
	this.timeout(240_000);

	before(async function () {
		if (process.env.FORK_BSC !== "true") {
			if (process.env.REQUIRE_BSC_FORK === "true") throw new Error("FORK_BSC=true is required");
			this.skip();
		}
		const forkUrl = process.env.FORK_BSC_URL;
		if (!forkUrl) {
			if (process.env.REQUIRE_BSC_FORK === "true") throw new Error("FORK_BSC_URL is required");
			this.skip();
		}

		await network.provider.request({
			method: "hardhat_reset",
			params: [{ forking: { jsonRpcUrl: forkUrl, blockNumber: FORK_BLOCK } }],
		});

		const portalCode = await ethers.provider.getCode(FLAP_PORTAL);
		const factoryCode = await ethers.provider.getCode(PCS_FACTORY);
		if (portalCode === "0x" || factoryCode === "0x") throw new Error("BSC fork not detected");
	});

	it("BundleRouter executes through Portal correctly and graduates Test-1 to PCS V2", async () => {
		const [owner] = await ethers.getSigners();
		const factory = new ethers.Contract(PCS_FACTORY, FACTORY_ABI, ethers.provider);

		expect(await factory.getPair(TEST1_TOKEN, WBNB)).to.equal(ethers.ZeroAddress);

		const BundleRouter = await ethers.getContractFactory("BundleRouter");
		const router = await BundleRouter.deploy(WBNB, PCS_FACTORY, PCS_ROUTER, INIT_CODE_HASH, FLAP_PORTAL);
		await router.waitForDeployment();

		const tx = await router.execute(
			{
				flapToken: TEST1_TOKEN,
				curveFillBnb: ethers.parseEther("16"),
				v2BuyBnb: ethers.parseEther("1"),
				minTokensFromV2: 0,
				deadline: 9_999_999_999,
			},
			{ value: ethers.parseEther("17") },
		);
		const receipt = await tx.wait();

		const launched = receipt.logs.some(
			(log) => log.address.toLowerCase() === FLAP_PORTAL.toLowerCase() && log.topics[0] === LAUNCHED_TO_DEX_TOPIC,
		);
		expect(launched).to.equal(true);

		const pair = await factory.getPair(TEST1_TOKEN, WBNB);
		expect(pair).to.not.equal(ethers.ZeroAddress);

		expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(0n);
		expect(owner.address).to.not.equal(ethers.ZeroAddress);
	});
});
