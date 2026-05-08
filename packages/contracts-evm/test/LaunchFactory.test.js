const { expect } = require("chai");
const { ethers } = require("hardhat");

const PCS_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E";
const PCS_FACTORY = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73";
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const DEAD = "0x000000000000000000000000000000000000dEaD";
const INIT_CODE_HASH = "0x00fb7f630766e6a796048ea87d01acd3068e8ff67d078148a3fa3f4a84f69bd5";

const TOTAL_SUPPLY = ethers.parseEther("1000000000");
const BURN_AMOUNT = ethers.parseEther("500000000");
const PRESALE_AMOUNT = ethers.parseEther("200000000");
const TIER = { TIER_80: 0, TIER_90: 1, TIER_95: 2, TIER_98: 3 };

describe("LaunchFactory", () => {
	let factory;
	let deployer;
	let creator;
	let taxSplitter;

	beforeEach(async () => {
		[deployer, creator, taxSplitter] = await ethers.getSigners();

		// Use real PCS V2 addresses (works on local without fork via mocks but tests
		// that don't need actual PCS calls will still pass)
		const Factory = await ethers.getContractFactory("LaunchFactory");
		factory = await Factory.deploy(WBNB, PCS_FACTORY, PCS_ROUTER, INIT_CODE_HASH, taxSplitter.address);
		await factory.waitForDeployment();
	});

	describe("tierConfig", () => {
		it("returns correct config for TIER_80", async () => {
			const [cap, v2, vest] = await factory.tierConfig(TIER.TIER_80);
			expect(cap).to.equal(ethers.parseEther("16"));
			expect(v2).to.equal(0);
			expect(vest).to.equal(false);
		});

		it("returns correct config for TIER_90", async () => {
			const [cap, v2, vest] = await factory.tierConfig(TIER.TIER_90);
			expect(cap).to.equal(ethers.parseEther("32"));
			expect(v2).to.equal(ethers.parseEther("16"));
			expect(vest).to.equal(true);
		});

		it("returns correct config for TIER_95", async () => {
			const [cap, v2, vest] = await factory.tierConfig(TIER.TIER_95);
			expect(cap).to.equal(ethers.parseEther("64"));
			expect(v2).to.equal(ethers.parseEther("48"));
			expect(vest).to.equal(true);
		});

		it("returns correct config for TIER_98", async () => {
			const [cap, v2, vest] = await factory.tierConfig(TIER.TIER_98);
			expect(cap).to.equal(ethers.parseEther("160"));
			expect(v2).to.equal(ethers.parseEther("144"));
			expect(vest).to.equal(true);
		});
	});

	describe("createLaunch", () => {
		const baseConfig = (creatorAddr, tier = TIER.TIER_90) => ({
			name: "TestAgent",
			symbol: "TEST",
			metadataURI: "ipfs://test",
			creator: creatorAddr,
			tier,
			closeTimestamp: Math.floor(Date.now() / 1000) + 86400,
		});

		it("deploys for TIER_80", async () => {
			const cfg = baseConfig(creator.address, TIER.TIER_80);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();

			const events = receipt.logs.filter((l) => l.fragment && l.fragment.name === "LaunchCreated");
			expect(events.length).to.equal(1);

			const ev = events[0];
			expect(ev.args.creator).to.equal(creator.address);
			expect(ev.args.tier).to.equal(TIER.TIER_80);
			expect(ev.args.presaleCap).to.equal(ethers.parseEther("16"));
			expect(ev.args.v2BuyBnb).to.equal(0);
			expect(ev.args.vestingEnabled).to.equal(false);
		});

		it("deploys for TIER_90", async () => {
			const cfg = baseConfig(creator.address, TIER.TIER_90);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();

			const events = receipt.logs.filter((l) => l.fragment && l.fragment.name === "LaunchCreated");
			expect(events.length).to.equal(1);
			const ev = events[0];
			expect(ev.args.tier).to.equal(TIER.TIER_90);
			expect(ev.args.presaleCap).to.equal(ethers.parseEther("32"));
			expect(ev.args.v2BuyBnb).to.equal(ethers.parseEther("16"));
			expect(ev.args.vestingEnabled).to.equal(true);
		});

		it("deploys for TIER_95", async () => {
			const cfg = baseConfig(creator.address, TIER.TIER_95);
			await expect(factory.createLaunch(cfg)).to.emit(factory, "LaunchCreated");
		});

		it("deploys for TIER_98", async () => {
			const cfg = baseConfig(creator.address, TIER.TIER_98);
			await expect(factory.createLaunch(cfg)).to.emit(factory, "LaunchCreated");
		});

		it("burns 50% of supply at launch", async () => {
			const cfg = baseConfig(creator.address, TIER.TIER_90);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();
			const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");
			const tokenAddr = ev.args.token;

			const token = await ethers.getContractAt("AgentTokenV3", tokenAddr);
			const deadBalance = await token.balanceOf(DEAD);
			expect(deadBalance).to.equal(BURN_AMOUNT);
		});

		it("allocates 200M to vault", async () => {
			const cfg = baseConfig(creator.address);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();
			const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");

			const token = await ethers.getContractAt("AgentTokenV3", ev.args.token);
			const vaultBalance = await token.balanceOf(ev.args.vault);
			expect(vaultBalance).to.equal(PRESALE_AMOUNT);
		});

		it("factory holds 300M (200M for V2 LP + 100M for treasury)", async () => {
			const cfg = baseConfig(creator.address);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();
			const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");

			const token = await ethers.getContractAt("AgentTokenV3", ev.args.token);
			const factoryBalance = await token.balanceOf(await factory.getAddress());
			expect(factoryBalance).to.equal(ethers.parseEther("300000000"));
		});

		it("token totalSupply equals 1B", async () => {
			const cfg = baseConfig(creator.address);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();
			const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");

			const token = await ethers.getContractAt("AgentTokenV3", ev.args.token);
			expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
		});

		it("vault has correct owner (creator)", async () => {
			const cfg = baseConfig(creator.address);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();
			const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");

			const vault = await ethers.getContractAt("LaunchVault", ev.args.vault);
			expect(await vault.owner()).to.equal(creator.address);
		});

		it("metadataURI is queryable on token", async () => {
			const cfg = baseConfig(creator.address);
			cfg.metadataURI = "ipfs://QmTest123";
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();
			const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");

			const token = await ethers.getContractAt("AgentTokenV3", ev.args.token);
			expect(await token.metadataURI()).to.equal("ipfs://QmTest123");
		});

		it("token, vault, router are tax-exempt", async () => {
			const cfg = baseConfig(creator.address);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();
			const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");

			const token = await ethers.getContractAt("AgentTokenV3", ev.args.token);
			expect(await token.taxExempt(await factory.getAddress())).to.equal(true);
			expect(await token.taxExempt(ev.args.vault)).to.equal(true);
			expect(await token.taxExempt(ev.args.router)).to.equal(true);
			expect(await token.taxExempt(DEAD)).to.equal(true);
		});

		it("bootstrap is finalized after createLaunch", async () => {
			const cfg = baseConfig(creator.address);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();
			const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");

			const token = await ethers.getContractAt("AgentTokenV3", ev.args.token);
			expect(await token.bootstrapped()).to.equal(true);

			// Cannot set tax exempt anymore? Let's check that it reverts
			// (Note: factory itself is the only caller, but it shouldn't be able to call after bootstrap)
			// We can't easily test from outside since only factory can call setTaxExempt
		});

		it("populates launches[] mapping", async () => {
			const cfg = baseConfig(creator.address);
			const tx = await factory.createLaunch(cfg);
			const receipt = await tx.wait();
			const ev = receipt.logs.find((l) => l.fragment && l.fragment.name === "LaunchCreated");

			const stored = await factory.launches(ev.args.token);
			expect(stored.token).to.equal(ev.args.token);
			expect(stored.vault).to.equal(ev.args.vault);
			expect(stored.router).to.equal(ev.args.router);
		});

		it("allLaunches.length increments", async () => {
			expect(await factory.launchCount()).to.equal(0);
			await factory.createLaunch(baseConfig(creator.address));
			expect(await factory.launchCount()).to.equal(1);
			await factory.createLaunch({
				...baseConfig(creator.address),
				name: "Agent2",
				symbol: "A2",
			});
			expect(await factory.launchCount()).to.equal(2);
		});
	});

	describe("reverts", () => {
		const validCfg = (creatorAddr) => ({
			name: "TestAgent",
			symbol: "TEST",
			metadataURI: "ipfs://test",
			creator: creatorAddr,
			tier: TIER.TIER_90,
			closeTimestamp: Math.floor(Date.now() / 1000) + 86400,
		});

		it("reverts on zero creator", async () => {
			const cfg = validCfg(ethers.ZeroAddress);
			await expect(factory.createLaunch(cfg)).to.be.revertedWithCustomError(factory, "InvalidCreator");
		});

		it("reverts on past closeTimestamp", async () => {
			const cfg = validCfg(creator.address);
			cfg.closeTimestamp = 1;
			await expect(factory.createLaunch(cfg)).to.be.revertedWithCustomError(factory, "InvalidCloseTimestamp");
		});

		it("reverts on empty name", async () => {
			const cfg = validCfg(creator.address);
			cfg.name = "";
			await expect(factory.createLaunch(cfg)).to.be.revertedWithCustomError(factory, "EmptyName");
		});

		it("reverts on empty symbol", async () => {
			const cfg = validCfg(creator.address);
			cfg.symbol = "";
			await expect(factory.createLaunch(cfg)).to.be.revertedWithCustomError(factory, "EmptySymbol");
		});
	});
});
