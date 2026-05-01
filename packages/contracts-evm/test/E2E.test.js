const { expect } = require("chai");
const { ethers } = require("hardhat");
const { bigNum, getCurrentTimestamp, getETHBalance, smallNum } = require("hardhat-libutils");
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
	});

	it("Check Initialization", async () => {
		console.log("Initialized Successfully!");
	});

	it("set WaifuFunTokenFactory address", async function () {
		await expect(
			this.WaifuFun.connect(this.teamWallet).updateFactory(this.WaifuFunTokenFactory.address),
		).to.be.revertedWith("Ownable: caller is not the owner");
		await this.WaifuFun.updateFactory(this.WaifuFunTokenFactory.address);
		expect(await this.WaifuFun.factory()).to.be.equal(this.WaifuFunTokenFactory.address);
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
		const virtualReserveETHAmount = ethers.utils.parseEther("0.5");
		const decimals = 18;
		const totalSupply = bigNum(500000, decimals);
		const name = "First Autofun Token";
		const symbol = "AFT_1";
		const beforeAllLaunchedTokens = await this.WaifuFun.getAllLaunchedTokens();
		const beforeLaunchedTokensByOwner = await this.WaifuFun.getLaunchedTokensByOwner(this.user_1.address);

		await this.WaifuFun.connect(this.user_1).launch(
			BigInt(totalSupply),
			BigInt(virtualReserveETHAmount),
			decimals,
			name,
			symbol,
		);

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
		expect(BigInt(bondingCurve.reserveETHAmount)).to.be.equal(BigInt(virtualReserveETHAmount));
		expect(BigInt(bondingCurve.initReserveETHAmount)).to.be.equal(BigInt(virtualReserveETHAmount));
		expect(bondingCurve.token).to.be.equal(launchedTokenAddress);
		expect(bondingCurve.creator).to.be.equal(this.user_1.address);
		expect(BigInt(bondingCurve.curveLimit)).to.be.equal(BigInt(globalConfig.curveLimit));

		const expectReserveTokenAmount =
			(BigInt(totalSupply) * BigInt(globalConfig.initBondingCurveRate)) / BigInt(BONDING_CURVE_FIXED_POINT);
		expect(BigInt(expectReserveTokenAmount)).to.be.equal(BigInt(bondingCurve.reserveTokenAmount));
	});

	describe("swap tokens and check", async () => {
		let tokenAddress;
		let token;
		it("buy tokens and check", async function () {
			// swap ETH to Token
			tokenAddress =
				primaryTokenAddress || (await this.WaifuFun.getLaunchedTokensByOwner(this.user_1.address)).slice(-1)[0];
			token = new ethers.Contract(tokenAddress, ERC20ABI, this.deployer);

			const ethAmountToSwap = ethers.utils.parseEther("0.3");
			const minAmountOut = 0;
			const direction = 0; // buy
			const deadline = BigInt(await getCurrentTimestamp()) + BigInt(10);

			const beforeBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const beforeTeamWalletBalance = await getETHBalance(this.teamWallet.address);
			const beforeUserTokenBal = await token.balanceOf(this.user_1.address);
			await this.WaifuFun.connect(this.user_1).swap(
				{
					token: tokenAddress,
					amountIn: BigInt(ethAmountToSwap),
					minAmountOut: minAmountOut,
					direction: direction,
					deadline: BigInt(deadline),
				},
				{
					value: BigInt(ethAmountToSwap),
				},
			);
			const afterBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const afterTeamWalletBalance = await getETHBalance(this.teamWallet.address);
			const afterUserTokenBal = await token.balanceOf(this.user_1.address);

			const receivedToken = BigInt(afterUserTokenBal) - BigInt(beforeUserTokenBal);
			const buyFeeAmount = (BigInt(ethAmountToSwap) * BigInt(globalConfig.buyFee)) / BigInt(FEE_FIXED_POINT);
			const absSwapAmount = BigInt(ethAmountToSwap) - BigInt(buyFeeAmount);
			const expectAmountOut =
				(BigInt(beforeBondingCurve.reserveTokenAmount) * BigInt(absSwapAmount)) /
				(BigInt(beforeBondingCurve.reserveETHAmount) + BigInt(absSwapAmount));
			const swappedEthAmount = BigInt(afterBondingCurve.reserveETHAmount) - BigInt(beforeBondingCurve.reserveETHAmount);
			const receivedTokenAmount =
				BigInt(beforeBondingCurve.reserveTokenAmount) - BigInt(afterBondingCurve.reserveTokenAmount);
			const teamWalletUpdates = BigInt(afterTeamWalletBalance) - BigInt(beforeTeamWalletBalance);

			expect(BigInt(absSwapAmount)).to.be.equal(BigInt(swappedEthAmount));
			expect(BigInt(expectAmountOut)).to.be.equal(BigInt(receivedTokenAmount));
			expect(buyFeeAmount).to.be.equal(teamWalletUpdates);
			expect(BigInt(receivedToken)).to.be.equal(BigInt(receivedTokenAmount));
		});

		it("sell tokens and check", async function () {
			// Swap Token to ETH

			const tokenBalance = await token.balanceOf(this.user_1.address);
			const tokenAmountToSwap = BigInt(tokenBalance) / BigInt(2);
			const minAmountOut = 0;
			const direction = 1; // sell
			const deadline = BigInt(await getCurrentTimestamp()) + BigInt(10);

			await token.connect(this.user_1).approve(this.WaifuFun.address, BigInt(tokenAmountToSwap));

			const beforeBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const beforeTeamWalletBalance = await token.balanceOf(this.teamWallet.address);
			const beforeUserEthAmount = await getETHBalance(this.user_1.address);

			await this.WaifuFun.connect(this.user_1).swap({
				token: tokenAddress,
				amountIn: BigInt(tokenAmountToSwap),
				minAmountOut: minAmountOut,
				direction: direction,
				deadline: BigInt(deadline),
			});

			const afterBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const afterTeamWalletBalance = await token.balanceOf(this.teamWallet.address);
			const afterUserEthAmount = await getETHBalance(this.user_1.address);

			const receivedEthAmount = BigInt(afterUserEthAmount) - BigInt(beforeUserEthAmount);
			const sellFeeAmount = (BigInt(tokenAmountToSwap) * BigInt(globalConfig.sellFee)) / BigInt(FEE_FIXED_POINT);
			const absSwapAmount = BigInt(tokenAmountToSwap) - BigInt(sellFeeAmount);
			const expectAmountOut =
				(BigInt(beforeBondingCurve.reserveETHAmount) * BigInt(absSwapAmount)) /
				(BigInt(beforeBondingCurve.reserveTokenAmount) + BigInt(absSwapAmount));
			const swappedTokenAmount =
				BigInt(afterBondingCurve.reserveTokenAmount) - BigInt(beforeBondingCurve.reserveTokenAmount);
			const ethAmountOut = BigInt(beforeBondingCurve.reserveETHAmount) - BigInt(afterBondingCurve.reserveETHAmount);
			const teamWalletUpdates = BigInt(afterTeamWalletBalance) - BigInt(beforeTeamWalletBalance);

			expect(BigInt(absSwapAmount)).to.be.equal(BigInt(swappedTokenAmount));
			expect(BigInt(expectAmountOut)).to.be.equal(BigInt(ethAmountOut));
			expect(BigInt(teamWalletUpdates)).to.be.equal(BigInt(sellFeeAmount));

			expect(smallNum(receivedEthAmount)).to.be.closeTo(smallNum(ethAmountOut), 0.001);
		});

		it("try buy token over curveLimit", async function () {
			const bondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const remainAmount = BigInt(bondingCurve.curveLimit) - BigInt(bondingCurve.reserveETHAmount);
			const ethAmountToSwap = BigInt(remainAmount) * BigInt(2);
			const minAmountOut = 0;
			const direction = 0; // buy
			const deadline = BigInt(await getCurrentTimestamp()) + BigInt(10);

			const beforeBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const beforeTeamWalletBalance = await getETHBalance(this.teamWallet.address);
			const beforeUserTokenBal = await token.balanceOf(this.user_1.address);
			await this.WaifuFun.connect(this.user_1).swap(
				{
					token: tokenAddress,
					amountIn: BigInt(ethAmountToSwap),
					minAmountOut: minAmountOut,
					direction: direction,
					deadline: BigInt(deadline),
				},
				{
					value: BigInt(ethAmountToSwap),
				},
			);
			const afterBondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const afterTeamWalletBalance = await getETHBalance(this.teamWallet.address);
			const afterUserTokenBal = await token.balanceOf(this.user_1.address);

			const receivedToken = BigInt(afterUserTokenBal) - BigInt(beforeUserTokenBal);
			const buyFeeAmount = (BigInt(remainAmount) * BigInt(globalConfig.buyFee)) / BigInt(FEE_FIXED_POINT);
			const absSwapAmount = BigInt(remainAmount) - BigInt(buyFeeAmount);

			const expectAmountOut =
				(BigInt(beforeBondingCurve.reserveTokenAmount) * BigInt(absSwapAmount)) /
				(BigInt(beforeBondingCurve.reserveETHAmount) + BigInt(absSwapAmount));
			const swappedEthAmount = BigInt(afterBondingCurve.reserveETHAmount) - BigInt(beforeBondingCurve.reserveETHAmount);
			const receivedTokenAmount =
				BigInt(beforeBondingCurve.reserveTokenAmount) - BigInt(afterBondingCurve.reserveTokenAmount);
			const teamWalletUpdates = BigInt(afterTeamWalletBalance) - BigInt(beforeTeamWalletBalance);

			expect(BigInt(absSwapAmount)).to.be.equal(BigInt(swappedEthAmount));
			expect(BigInt(expectAmountOut)).to.be.equal(BigInt(receivedTokenAmount));
			expect(buyFeeAmount).to.be.equal(teamWalletUpdates);
			expect(BigInt(receivedToken)).to.be.equal(BigInt(receivedTokenAmount));
			expect(afterBondingCurve.isCompleted).to.be.equal(true);
		});
	});

	describe("launch and swap token", () => {
		it("launch and swap token", async function () {
			const virtualReserveETHAmount = ethers.utils.parseEther("0.5");
			const decimals = 18;
			const totalSupply = bigNum(500000, decimals);
			const name = "Second Autofun Token";
			const symbol = "AFT_2";
			const beforeLaunchedTokensByOwner = await this.WaifuFun.getLaunchedTokensByOwner(this.user_2.address);

			const ethAmountToSwap = ethers.utils.parseEther("0.3");
			const minAmountOut = 0;
			const direction = 0; // buy
			const deadline = BigInt(await getCurrentTimestamp()) + BigInt(10);

			await this.WaifuFun.connect(this.user_2).launchAndSwap(
				BigInt(totalSupply),
				BigInt(virtualReserveETHAmount),
				decimals,
				name,
				symbol,
				{
					token: ethers.constants.AddressZero,
					amountIn: BigInt(ethAmountToSwap),
					minAmountOut: minAmountOut,
					direction: direction,
					deadline: BigInt(deadline),
				},
				{
					value: BigInt(ethAmountToSwap),
				},
			);

			const launchedTokensByOwner = await this.WaifuFun.getLaunchedTokensByOwner(this.user_2.address);
			expect(launchedTokensByOwner.length).to.be.equal(beforeLaunchedTokensByOwner.length + 1);

			const tokenAddress = launchedTokensByOwner[launchedTokensByOwner.length - 1];
			secondaryTokenAddress = tokenAddress;
			const token = new ethers.Contract(tokenAddress, ERC20ABI, this.deployer);

			const bondingCurve = await this.WaifuFun.bondingCurvesByToken(tokenAddress);
			const initReserveTokenAmount =
				(BigInt(totalSupply) * BigInt(globalConfig.initBondingCurveRate)) / BigInt(BONDING_CURVE_FIXED_POINT);
			expect(bondingCurve.isCompleted).to.be.equal(false);
			expect(BigInt(bondingCurve.initReserveETHAmount)).to.be.equal(BigInt(virtualReserveETHAmount));
			expect(bondingCurve.token).to.be.equal(tokenAddress);
			expect(bondingCurve.creator).to.be.equal(this.user_2.address);
			expect(BigInt(bondingCurve.curveLimit)).to.be.equal(BigInt(globalConfig.curveLimit));

			const receivedToken = await token.balanceOf(this.user_2.address);
			const buyFeeAmount = (BigInt(ethAmountToSwap) * BigInt(globalConfig.buyFee)) / BigInt(FEE_FIXED_POINT);
			const absSwapAmount = BigInt(ethAmountToSwap) - BigInt(buyFeeAmount);
			const expectAmountOut =
				(BigInt(initReserveTokenAmount) * BigInt(absSwapAmount)) /
				(BigInt(bondingCurve.initReserveETHAmount) + BigInt(absSwapAmount));

			expect(BigInt(bondingCurve.reserveETHAmount) - BigInt(bondingCurve.initReserveETHAmount)).to.be.equal(
				BigInt(absSwapAmount),
			);
			expect(BigInt(initReserveTokenAmount) - BigInt(bondingCurve.reserveTokenAmount)).to.be.equal(
				BigInt(expectAmountOut),
			);
		});
	});

	describe("withdraw", async () => {
		it("withdraw and check", async function () {
			const tokenAddress0 = primaryTokenAddress;
			const tokenAddress1 = secondaryTokenAddress;
			const token = new ethers.Contract(tokenAddress0, ERC20ABI, this.deployer);

			const bondingCurve0 = await this.WaifuFun.bondingCurvesByToken(tokenAddress0);
			const bondingCurve1 = await this.WaifuFun.bondingCurvesByToken(tokenAddress1);
			expect(bondingCurve0.isCompleted).to.be.equal(true);
			expect(bondingCurve1.isCompleted).to.be.equal(false);

			await expect(this.WaifuFun.connect(this.user_1).withdraw(tokenAddress0)).to.be.revertedWith(
				"Ownable: caller is not the owner",
			);
			await expect(this.WaifuFun.withdraw(tokenAddress1)).to.be.revertedWith("BONDING_CURVE_IS_NOT_COMPLETED");

			const expectEthAmount = BigInt(bondingCurve0.reserveETHAmount) - BigInt(bondingCurve0.initReserveETHAmount);
			const expectTokenAmount = bondingCurve0.reserveTokenAmount;
			const beforeEthBal = await getETHBalance(this.deployer.address);
			const beforeTokenBal = await token.balanceOf(this.deployer.address);
			await this.WaifuFun.withdraw(tokenAddress0);
			const afterEthBal = await getETHBalance(this.deployer.address);
			const afterTokenBal = await token.balanceOf(this.deployer.address);
			const receivedEthAmount = BigInt(afterEthBal) - BigInt(beforeEthBal);
			const receivedTokenAmount = BigInt(afterTokenBal) - BigInt(beforeTokenBal);
			expect(BigInt(receivedTokenAmount)).to.be.equal(BigInt(expectTokenAmount));
			expect(smallNum(receivedEthAmount)).to.be.closeTo(smallNum(expectEthAmount), 0.001);
		});
	});
});
