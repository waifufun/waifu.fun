const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AgentToken", () => {
	let token;
	let owner;
	let curve;
	let treasury;
	let creator;
	const TOTAL_SUPPLY = ethers.utils.parseEther("1000000000"); // 1B

	beforeEach(async () => {
		[owner, curve, treasury, creator] = await ethers.getSigners();
		const Token = await ethers.getContractFactory("AgentToken");
		token = await Token.deploy("TestAgent", "AGENT", TOTAL_SUPPLY, curve.address, treasury.address, creator.address);
		await token.deployed();
	});

	it("should have correct total supply", async () => {
		expect(await token.totalSupply()).to.equal(TOTAL_SUPPLY);
	});

	it("should send 80% to bonding curve", async () => {
		const expected = TOTAL_SUPPLY.mul(80).div(100);
		expect(await token.balanceOf(curve.address)).to.equal(expected);
	});

	it("should send 10% to agent treasury", async () => {
		const expected = TOTAL_SUPPLY.mul(10).div(100);
		expect(await token.balanceOf(treasury.address)).to.equal(expected);
	});

	it("should send 10% to creator", async () => {
		const curveShare = TOTAL_SUPPLY.mul(80).div(100);
		const treasuryShare = TOTAL_SUPPLY.mul(10).div(100);
		const creatorShare = TOTAL_SUPPLY.sub(curveShare).sub(treasuryShare);
		expect(await token.balanceOf(creator.address)).to.equal(creatorShare);
	});

	it("should have 18 decimals", async () => {
		expect(await token.decimals()).to.equal(18);
	});

	it("should allow standard transfers", async () => {
		const amount = ethers.utils.parseEther("100");
		await token.connect(creator).transfer(owner.address, amount);
		expect(await token.balanceOf(owner.address)).to.equal(amount);
	});
});
