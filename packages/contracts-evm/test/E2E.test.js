const { expect } = require("chai");
const { ethers } = require("hardhat");
const { bigNum, getCurrentTimestamp, getETHBalance, smallNum } = require("./helpers/test-utils");
const ERC20ABI = require("../external_abi/ERC20.abi.json");
const { setupWaifuFunSuite } = require("./helpers/deployment");

describe("WaifuFun End-To-End Test", () => {
	let globalConfig;
	const BONDING_CURVE_FIXED_POINT = 1000000;
	const FEE_FIXED_POINT = 10000;
	let primaryTokenAddress;
	let secondaryTokenAddress;

	before(async function () {
		Object.assign(this, await setupWaifuFunSuite());
		globalConfig = this.globalConfig;
		this.waifuFunAddr = await this.WaifuFun.getAddress();
		this.factoryAddr = await this.WaifuFunTokenFactory.getAddress();
	});

	it("Check Initialization", async () => {
		console.log("Initialized Successfully!");
	});

	it("set WaifuFunTokenFactory address", async function () {
		await expect(this.WaifuFun.connect(this.teamWallet).updateFactory(this.factoryAddr)).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await this.WaifuFun.updateFactory(this.factoryAddr);
		expect(await this.WaifuFun.factory()).to.be.equal(this.factoryAddr);
	});

	it("update Global config", async function () {
		globalConfig.maxDecimal = 20;
		expect((await this.WaifuFun.globalConfig()).maxDecimal).to.be.equal(18);
		await expect(this.WaifuFun.connect(this.teamWallet).updateGlobalConfig(globalConfig)).to.be.revertedWith(
			"Ownable: caller is not the owner",
		);
		await this.WaifuFun.updateGlobalConfig(globalConfig);
		expect((await this.WaifuFun.globalConfig()).maxDecimal).to.be.equal(20);
	});

	it("launch token and check", async function () {
		const virtualReserveETHAmount = ethers.parseEther("0.5");
		const decimals = 18;
		const totalSupply = bigNum(500000, decimals);
		const name = "First Autofun Token";
		const symbol = "AFT_1";
		const beforeAllLaunchedTokens = await this.WaifuFun.getAllLaunchedTokens();
		const beforeLaunchedTokensByOwner = await this.WaifuFun.getLaunchedTokensByOwner(this.user_1.address);

		await this.WaifuFun.connect(this.user_1).launch(totalSupply, virtualReserveETHAmount, decimals, name, symbol);

		const allLaunchedTokens = await this.WaifuFun.getAllLaunchedTokens();
		const launchedTokensByOwner = await this.WaifuFun.getLaunchedTokensByOwner(this.user_1.address);

		expect(launchedTokensByOwner.length).to.be.equal(beforeLaunchedTokensByOwner.length + 1);
		expect(allLaunchedTokens.length).to.be.equal(beforeAllLaunchedTokens.length + 1);
		const launchedTokenAddress = launchedTokensByOwner[launchedTokensByOwner.length - 1];
		primaryTokenAddress = launchedTokenAddress;

		expect(allLaunchedTokens[allLaunchedTokens.length - 1]).to.be.equal(launchedTokenAddress);
		const token = new ethers.Contract(launchedTokenAddress, ERC20ABI, this.deployer);
		expect(await token.decimals()).to.be.equal(decimals);
		expect(await token.name()).to.be.equal(name);
		expect(await token.symbol()).to.be.equal(symbol);
		expect(await token.totalSupply()).to.be.equal(totalSupply);

		const bondingCurve = await this.WaifuFun.bondingCurvesByToken(launchedTokenAddress);
		expect(bondingCurve.isCompleted).to.be.equal(false);
		expect(bondingCurve.reserveETHAmount).to.be.equal(virtualReserveETHAmount);
		expect(bondingCurve.initReserveETHAmount).to.be.equal(virtualReserveETHAmount);
		expect(bondingCurve.token).to.be.equal(launchedTokenAddress);
		expect(bondingCurve.creator).to.be.equal(this.user_1.address);
		expect(bondingCurve.curveLimit).to.be.equal(BigInt(globalConfig.curveLimit));

		const expectReserveTokenAmount =
			(totalSupply * BigInt(globalConfig.initBondingCurveRate)) / BigInt(BONDING_CURVE_FIXED_POINT);
		expect(expectReserveTokenAmount).to.be.equal(bondingCurve.reserveTokenAmount);
	});

	describe("swap tokens and check", async () => {
		let tokenAddress;
		let token;
		it("buy tokens and check", async function () {
			tokenAddress =
				primaryTokenAddress || (await this.WaifuFun.getLaunchedTokensByOwner(this.user_1.address)).slice(-1)[0];
			token = new ethers.Contract(tokenAddress, ERC20ABI, this.deployer);

			const ethAmountToSwap = ethers.parseEther("0.3");
			const minAmountOut = 0;
			const direction = 0;
			const deadline = (await getCurrentTimestamp()) + 10n;

			const beforeBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const beforeTeamWalletBalance = await getETHBalance(this.teamWallet.address);
			const beforeUserTokenBal = await token.balanceOf(this.user_1.address);
			await this.WaifuFun.connect(this.user_1).swap(
				{
					token: tokenAddress,
					amountIn: ethAmountToSwap,
					minAmountOut: minAmountOut,
					direction: direction,
					deadline: deadline,
				},
				{
					value: ethAmountToSwap,
				},
			);
			const afterBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const afterTeamWalletBalance = await getETHBalance(this.teamWallet.address);
			const afterUserTokenBal = await token.balanceOf(this.user_1.address);

			const receivedToken = afterUserTokenBal - beforeUserTokenBal;
			const buyFeeAmount = (ethAmountToSwap * BigInt(globalConfig.buyFee)) / BigInt(FEE_FIXED_POINT);
			const absSwapAmount = ethAmountToSwap - buyFeeAmount;
			const expectAmountOut =
				(beforeBondingCurve.reserveTokenAmount * absSwapAmount) / (beforeBondingCurve.reserveETHAmount + absSwapAmount);
			const swappedEthAmount = afterBondingCurve.reserveETHAmount - beforeBondingCurve.reserveETHAmount;
			const receivedTokenAmount = beforeBondingCurve.reserveTokenAmount - afterBondingCurve.reserveTokenAmount;
			const teamWalletUpdates = afterTeamWalletBalance - beforeTeamWalletBalance;

			expect(absSwapAmount).to.be.equal(swappedEthAmount);
			expect(expectAmountOut).to.be.equal(receivedTokenAmount);
			expect(buyFeeAmount).to.be.equal(teamWalletUpdates);
			expect(receivedToken).to.be.equal(receivedTokenAmount);
		});

		it("sell tokens and check", async function () {
			const tokenBalance = await token.balanceOf(this.user_1.address);
			const tokenAmountToSwap = tokenBalance / 2n;
			const minAmountOut = 0;
			const direction = 1;
			const deadline = (await getCurrentTimestamp()) + 10n;

			await token.connect(this.user_1).approve(this.waifuFunAddr, tokenAmountToSwap);

			const beforeBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const beforeTeamWalletBalance = await token.balanceOf(this.teamWallet.address);
			const beforeUserEthAmount = await getETHBalance(this.user_1.address);

			await this.WaifuFun.connect(this.user_1).swap({
				token: tokenAddress,
				amountIn: tokenAmountToSwap,
				minAmountOut: minAmountOut,
				direction: direction,
				deadline: deadline,
			});

			const afterBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const afterTeamWalletBalance = await token.balanceOf(this.teamWallet.address);
			const afterUserEthAmount = await getETHBalance(this.user_1.address);

			const receivedEthAmount = afterUserEthAmount - beforeUserEthAmount;
			const sellFeeAmount = (tokenAmountToSwap * BigInt(globalConfig.sellFee)) / BigInt(FEE_FIXED_POINT);
			const absSwapAmount = tokenAmountToSwap - sellFeeAmount;
			const expectAmountOut =
				(beforeBondingCurve.reserveETHAmount * absSwapAmount) / (beforeBondingCurve.reserveTokenAmount + absSwapAmount);
			const swappedTokenAmount = afterBondingCurve.reserveTokenAmount - beforeBondingCurve.reserveTokenAmount;
			const ethAmountOut = beforeBondingCurve.reserveETHAmount - afterBondingCurve.reserveETHAmount;
			const teamWalletUpdates = afterTeamWalletBalance - beforeTeamWalletBalance;

			expect(absSwapAmount).to.be.equal(swappedTokenAmount);
			expect(expectAmountOut).to.be.equal(ethAmountOut);
			expect(teamWalletUpdates).to.be.equal(sellFeeAmount);

			expect(smallNum(receivedEthAmount)).to.be.closeTo(smallNum(ethAmountOut), 0.001);
		});

		it("try buy token over curveLimit", async function () {
			const bondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const remainAmount = bondingCurve.curveLimit - bondingCurve.reserveETHAmount;
			const ethAmountToSwap = remainAmount * 2n;
			const minAmountOut = 0;
			const direction = 0;
			const deadline = (await getCurrentTimestamp()) + 10n;

			const beforeBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const beforeTeamWalletBalance = await getETHBalance(this.teamWallet.address);
			const beforeUserTokenBal = await token.balanceOf(this.user_1.address);
			await this.WaifuFun.connect(this.user_1).swap(
				{
					token: tokenAddress,
					amountIn: ethAmountToSwap,
					minAmountOut: minAmountOut,
					direction: direction,
					deadline: deadline,
				},
				{
					value: ethAmountToSwap,
				},
			);
			const afterBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const afterTeamWalletBalance = await getETHBalance(this.teamWallet.address);
			const afterUserTokenBal = await token.balanceOf(this.user_1.address);

			const receivedToken = afterUserTokenBal - beforeUserTokenBal;
			const buyFeeAmount = (remainAmount * BigInt(globalConfig.buyFee)) / BigInt(FEE_FIXED_POINT);
			const absSwapAmount = remainAmount - buyFeeAmount;

			const expectAmountOut =
				(beforeBondingCurve.reserveTokenAmount * absSwapAmount) / (beforeBondingCurve.reserveETHAmount + absSwapAmount);
			const swappedEthAmount = afterBondingCurve.reserveETHAmount - beforeBondingCurve.reserveETHAmount;
			const receivedTokenAmount = beforeBondingCurve.reserveTokenAmount - afterBondingCurve.reserveTokenAmount;
			const teamWalletUpdates = afterTeamWalletBalance - beforeTeamWalletBalance;

			expect(absSwapAmount).to.be.equal(swappedEthAmount);
			expect(expectAmountOut).to.be.equal(receivedTokenAmount);
			expect(buyFeeAmount).to.be.equal(teamWalletUpdates);
			expect(receivedToken).to.be.equal(receivedTokenAmount);
			expect(afterBondingCurve.isCompleted).to.be.equal(true);
		});
	});

	describe("launch and swap token", () => {
		it("launch and swap token", async function () {
			const virtualReserveETHAmount = ethers.parseEther("0.5");
			const decimals = 18;
			const totalSupply = bigNum(500000, decimals);
			const name = "Second Autofun Token";
			const symbol = "AFT_2";
			const beforeLaunchedTokensByOwner = await this.WaifuFun.getLaunchedTokensByOwner(this.user_2.address);

			const ethAmountToSwap = ethers.parseEther("0.3");
			const minAmountOut = 0;
			const direction = 0;
			const deadline = (await getCurrentTimestamp()) + 10n;

			await this.WaifuFun.connect(this.user_2).launchAndSwap(
				totalSupply,
				virtualReserveETHAmount,
				decimals,
				name,
				symbol,
				{
					token: ethers.ZeroAddress,
					amountIn: ethAmountToSwap,
					minAmountOut: minAmountOut,
					direction: direction,
					deadline: deadline,
				},
				{
					value: ethAmountToSwap,
				},
			);

			const launchedTokensByOwner = await this.WaifuFun.getLaunchedTokensByOwner(this.user_2.address);
			expect(launchedTokensByOwner.length).to.be.equal(beforeLaunchedTokensByOwner.length + 1);

			const tokenAddr = launchedTokensByOwner[launchedTokensByOwner.length - 1];
			secondaryTokenAddress = tokenAddr;

			const bondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddr);
			const initReserveTokenAmount =
				(totalSupply * BigInt(globalConfig.initBondingCurveRate)) / BigInt(BONDING_CURVE_FIXED_POINT);
			expect(bondingCurve.isCompleted).to.be.equal(false);
			expect(bondingCurve.initReserveETHAmount).to.be.equal(virtualReserveETHAmount);
			expect(bondingCurve.token).to.be.equal(tokenAddr);
			expect(bondingCurve.creator).to.be.equal(this.user_2.address);
			expect(bondingCurve.curveLimit).to.be.equal(BigInt(globalConfig.curveLimit));

			const buyFeeAmount = (ethAmountToSwap * BigInt(globalConfig.buyFee)) / BigInt(FEE_FIXED_POINT);
			const absSwapAmount = ethAmountToSwap - buyFeeAmount;
			const expectAmountOut =
				(initReserveTokenAmount * absSwapAmount) / (bondingCurve.initReserveETHAmount + absSwapAmount);

			expect(bondingCurve.reserveETHAmount - bondingCurve.initReserveETHAmount).to.be.equal(absSwapAmount);
			expect(initReserveTokenAmount - bondingCurve.reserveTokenAmount).to.be.equal(expectAmountOut);
		});
	});

	describe("withdraw", async () => {
		it("withdraw and check", async function () {
			const tokenAddress0 = primaryTokenAddress;
			const tokenAddress1 = secondaryTokenAddress;
			const tok = new ethers.Contract(tokenAddress0, ERC20ABI, this.deployer);

			const bondingCurve0 = await this.WaifuFun.bondingCurvesByToken(tokenAddress0);
			const bondingCurve1 = await this.WaifuFun.bondingCurvesByToken(tokenAddress1);
			expect(bondingCurve0.isCompleted).to.be.equal(true);
			expect(bondingCurve1.isCompleted).to.be.equal(false);

			await expect(this.WaifuFun.connect(this.user_1).withdraw(tokenAddress0)).to.be.revertedWith(
				"Ownable: caller is not the owner",
			);
			await expect(this.WaifuFun.withdraw(tokenAddress1)).to.be.revertedWith("BONDING_CURVE_IS_NOT_COMPLETED");

			const expectEthAmount = bondingCurve0.reserveETHAmount - bondingCurve0.initReserveETHAmount;
			const expectTokenAmount = bondingCurve0.reserveTokenAmount;
			const beforeEthBal = await getETHBalance(this.deployer.address);
			const beforeTokenBal = await tok.balanceOf(this.deployer.address);
			await this.WaifuFun.withdraw(tokenAddress0);
			const afterEthBal = await getETHBalance(this.deployer.address);
			const afterTokenBal = await tok.balanceOf(this.deployer.address);
			const receivedEthAmount = afterEthBal - beforeEthBal;
			const receivedTokenAmount = afterTokenBal - beforeTokenBal;
			expect(receivedTokenAmount).to.be.equal(expectTokenAmount);
			expect(smallNum(receivedEthAmount)).to.be.closeTo(smallNum(expectEthAmount), 0.001);
		});
	});
});
