const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
    bigNum,
    getCurrentTimestamp,
    getETHBalance,
    smallNum,
} = require("hardhat-libutils");
const ERC20ABI = require("../external_abi/ERC20.abi.json");
const { setupWaifuFunSuite } = require("./helpers/deployment");

describe("WaifuFun End-To-End Test", function () {
    let globalConfig;
    let BONDING_CURVE_FIXED_POINT = 1000000;
    let FEE_FIXED_POINT = 10000;
    before(async function () {
        Object.assign(this, await setupWaifuFunSuite());
        globalConfig = this.globalConfig;
    });

    it("Check Initialization", async function () {
        console.log("Initialized Successfully!");
    });

    it("set WaifuFunTokenFactory address", async function () {
        await expect(
            this.WaifuFun.connect(this.teamWallet).updateFactory(
                this.WaifuFunTokenFactory.address
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
        await this.WaifuFun.updateFactory(this.WaifuFunTokenFactory.address);
        expect(await this.WaifuFun.factory()).to.be.equal(
            this.WaifuFunTokenFactory.address
        );
    });

    it("update Global config", async function () {
        globalConfig.maxDecimal = 20;
        expect((await this.WaifuFun.globalConfig()).maxDecimal).to.be.equal(18);
        await expect(
            this.WaifuFun.connect(this.teamWallet).updateGlobalConfig(
                globalConfig
            )
        ).to.be.revertedWith("Ownable: caller is not the owner");
        await this.WaifuFun.updateGlobalConfig(globalConfig);
        expect((await this.WaifuFun.globalConfig()).maxDecimal).to.be.equal(20);
    });

    it("launch token and check", async function () {
        let virtualReserveETHAmount = ethers.utils.parseEther("0.5");
        let decimals = 18;
        let totalSupply = bigNum(500000, decimals);
        let name = "First Autofun Token";
        let symbol = "AFT_1";
        await this.WaifuFun.connect(this.user_1).launch(
            BigInt(totalSupply),
            BigInt(virtualReserveETHAmount),
            decimals,
            name,
            symbol
        );

        let allLaunchedTokens = await this.WaifuFun.getAllLaunchedTokens();
        let launchedTokensByOwner = await this.WaifuFun.getLaunchedTokensByOwner(
            this.user_1.address
        );

        expect(launchedTokensByOwner.length).to.be.equal(1);
        expect(allLaunchedTokens.length).to.be.equal(
            launchedTokensByOwner.length
        );
        let launchedTokenAddress = launchedTokensByOwner[0];
        let token = new ethers.Contract(
            launchedTokenAddress,
            ERC20ABI,
            this.deployer
        );
        expect(await token.decimals()).to.be.equal(decimals);
        expect(await token.name()).to.be.equal(name);
        expect(await token.symbol()).to.be.equal(symbol);
        expect(await token.totalSupply()).to.be.equal(totalSupply);

        let bondingCurve = await this.WaifuFun.bondingCurvesByToken(
            launchedTokenAddress
        );
        expect(bondingCurve.isCompleted).to.be.equal(false);
        expect(BigInt(bondingCurve.reserveETHAmount)).to.be.equal(
            BigInt(virtualReserveETHAmount)
        );
        expect(BigInt(bondingCurve.initReserveETHAmount)).to.be.equal(
            BigInt(virtualReserveETHAmount)
        );
        expect(bondingCurve.token).to.be.equal(launchedTokenAddress);
        expect(bondingCurve.creator).to.be.equal(this.user_1.address);
        expect(BigInt(bondingCurve.curveLimit)).to.be.equal(
            BigInt(globalConfig.curveLimit)
        );

        let expectReserveTokenAmount =
            (BigInt(totalSupply) * BigInt(globalConfig.initBondingCurveRate)) /
            BigInt(BONDING_CURVE_FIXED_POINT);
        expect(BigInt(expectReserveTokenAmount)).to.be.equal(
            BigInt(bondingCurve.reserveTokenAmount)
        );
    });

    describe("swap tokens and check", async function () {
        let tokenAddress, token;
        it("buy tokens and check", async function () {
            // swap ETH to Token
            tokenAddress = (
                await this.WaifuFun.getLaunchedTokensByOwner(this.user_1.address)
            )[0];
            token = new ethers.Contract(tokenAddress, ERC20ABI, this.deployer);

            let ethAmountToSwap = ethers.utils.parseEther("0.3");
            let minAmountOut = 0;
            let direction = 0; // buy
            let deadline = BigInt(await getCurrentTimestamp()) + BigInt(10);

            let beforeBondingCurve = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress
            );
            let beforeTeamWalletBalance = await getETHBalance(
                this.teamWallet.address
            );
            let beforeUserTokenBal = await token.balanceOf(this.user_1.address);
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
                }
            );
            let afterBondingCurve = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress
            );
            let afterTeamWalletBalance = await getETHBalance(
                this.teamWallet.address
            );
            let afterUserTokenBal = await token.balanceOf(this.user_1.address);

            let receivedToken =
                BigInt(afterUserTokenBal) - BigInt(beforeUserTokenBal);
            let buyFeeAmount =
                (BigInt(ethAmountToSwap) * BigInt(globalConfig.buyFee)) /
                BigInt(FEE_FIXED_POINT);
            let absSwapAmount = BigInt(ethAmountToSwap) - BigInt(buyFeeAmount);
            let expectAmountOut =
                (BigInt(beforeBondingCurve.reserveTokenAmount) *
                    BigInt(absSwapAmount)) /
                (BigInt(beforeBondingCurve.reserveETHAmount) +
                    BigInt(absSwapAmount));
            let swappedEthAmount =
                BigInt(afterBondingCurve.reserveETHAmount) -
                BigInt(beforeBondingCurve.reserveETHAmount);
            let receivedTokenAmount =
                BigInt(beforeBondingCurve.reserveTokenAmount) -
                BigInt(afterBondingCurve.reserveTokenAmount);
            let teamWalletUpdates =
                BigInt(afterTeamWalletBalance) -
                BigInt(beforeTeamWalletBalance);

            expect(BigInt(absSwapAmount)).to.be.equal(BigInt(swappedEthAmount));
            expect(BigInt(expectAmountOut)).to.be.equal(
                BigInt(receivedTokenAmount)
            );
            expect(buyFeeAmount).to.be.equal(teamWalletUpdates);
            expect(BigInt(receivedToken)).to.be.equal(
                BigInt(receivedTokenAmount)
            );
        });

        it("sell tokens and check", async function () {
            // Swap Token to ETH

            let tokenBalance = await token.balanceOf(this.user_1.address);
            let tokenAmountToSwap = BigInt(tokenBalance) / BigInt(2);
            let minAmountOut = 0;
            let direction = 1; // sell
            let deadline = BigInt(await getCurrentTimestamp()) + BigInt(10);

            await token
                .connect(this.user_1)
                .approve(this.WaifuFun.address, BigInt(tokenAmountToSwap));

            let beforeBondingCurve = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress
            );
            let beforeTeamWalletBalance = await token.balanceOf(
                this.teamWallet.address
            );
            let beforeUserEthAmount = await getETHBalance(this.user_1.address);

            await this.WaifuFun.connect(this.user_1).swap({
                token: tokenAddress,
                amountIn: BigInt(tokenAmountToSwap),
                minAmountOut: minAmountOut,
                direction: direction,
                deadline: BigInt(deadline),
            });

            let afterBondingCurve = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress
            );
            let afterTeamWalletBalance = await token.balanceOf(
                this.teamWallet.address
            );
            let afterUserEthAmount = await getETHBalance(this.user_1.address);

            let receivedEthAmount =
                BigInt(afterUserEthAmount) - BigInt(beforeUserEthAmount);
            let sellFeeAmount =
                (BigInt(tokenAmountToSwap) * BigInt(globalConfig.sellFee)) /
                BigInt(FEE_FIXED_POINT);
            let absSwapAmount =
                BigInt(tokenAmountToSwap) - BigInt(sellFeeAmount);
            let expectAmountOut =
                (BigInt(beforeBondingCurve.reserveETHAmount) *
                    BigInt(absSwapAmount)) /
                (BigInt(beforeBondingCurve.reserveTokenAmount) +
                    BigInt(absSwapAmount));
            let swappedTokenAmount =
                BigInt(afterBondingCurve.reserveTokenAmount) -
                BigInt(beforeBondingCurve.reserveTokenAmount);
            let ethAmountOut =
                BigInt(beforeBondingCurve.reserveETHAmount) -
                BigInt(afterBondingCurve.reserveETHAmount);
            let teamWalletUpdates =
                BigInt(afterTeamWalletBalance) -
                BigInt(beforeTeamWalletBalance);

            expect(BigInt(absSwapAmount)).to.be.equal(
                BigInt(swappedTokenAmount)
            );
            expect(BigInt(expectAmountOut)).to.be.equal(BigInt(ethAmountOut));
            expect(BigInt(teamWalletUpdates)).to.be.equal(
                BigInt(sellFeeAmount)
            );

            expect(smallNum(receivedEthAmount)).to.be.closeTo(
                smallNum(ethAmountOut),
                0.001
            );
        });

        it("try buy token over curveLimit", async function () {
            let bondingCurve = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress
            );
            let remainAmount =
                BigInt(bondingCurve.curveLimit) -
                BigInt(bondingCurve.reserveETHAmount);
            let ethAmountToSwap = BigInt(remainAmount) * BigInt(2);
            let minAmountOut = 0;
            let direction = 0; // buy
            let deadline = BigInt(await getCurrentTimestamp()) + BigInt(10);

            let beforeBondingCurve = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress
            );
            let beforeTeamWalletBalance = await getETHBalance(
                this.teamWallet.address
            );
            let beforeUserTokenBal = await token.balanceOf(this.user_1.address);
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
                }
            );
            let afterBondingCurve = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress
            );
            let afterTeamWalletBalance = await getETHBalance(
                this.teamWallet.address
            );
            let afterUserTokenBal = await token.balanceOf(this.user_1.address);

            let receivedToken =
                BigInt(afterUserTokenBal) - BigInt(beforeUserTokenBal);
            let buyFeeAmount =
                (BigInt(remainAmount) * BigInt(globalConfig.buyFee)) /
                BigInt(FEE_FIXED_POINT);
            let absSwapAmount = BigInt(remainAmount) - BigInt(buyFeeAmount);

            let expectAmountOut =
                (BigInt(beforeBondingCurve.reserveTokenAmount) *
                    BigInt(absSwapAmount)) /
                (BigInt(beforeBondingCurve.reserveETHAmount) +
                    BigInt(absSwapAmount));
            let swappedEthAmount =
                BigInt(afterBondingCurve.reserveETHAmount) -
                BigInt(beforeBondingCurve.reserveETHAmount);
            let receivedTokenAmount =
                BigInt(beforeBondingCurve.reserveTokenAmount) -
                BigInt(afterBondingCurve.reserveTokenAmount);
            let teamWalletUpdates =
                BigInt(afterTeamWalletBalance) -
                BigInt(beforeTeamWalletBalance);

            expect(BigInt(absSwapAmount)).to.be.equal(BigInt(swappedEthAmount));
            expect(BigInt(expectAmountOut)).to.be.equal(
                BigInt(receivedTokenAmount)
            );
            expect(buyFeeAmount).to.be.equal(teamWalletUpdates);
            expect(BigInt(receivedToken)).to.be.equal(
                BigInt(receivedTokenAmount)
            );
            expect(afterBondingCurve.isCompleted).to.be.equal(true);
        });
    });

    describe("launch and swap token", function () {
        it("launch and swap token", async function () {
            let virtualReserveETHAmount = ethers.utils.parseEther("0.5");
            let decimals = 18;
            let totalSupply = bigNum(500000, decimals);
            let name = "Second Autofun Token";
            let symbol = "AFT_2";

            let ethAmountToSwap = ethers.utils.parseEther("0.3");
            let minAmountOut = 0;
            let direction = 0; // buy
            let deadline = BigInt(await getCurrentTimestamp()) + BigInt(10);

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
                }
            );

            let tokenAddress = (
                await this.WaifuFun.getLaunchedTokensByOwner(this.user_2.address)
            )[0];
            let token = new ethers.Contract(
                tokenAddress,
                ERC20ABI,
                this.deployer
            );

            let bondingCurve = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress
            );
            let initReserveTokenAmount =
                (BigInt(totalSupply) *
                    BigInt(globalConfig.initBondingCurveRate)) /
                BigInt(BONDING_CURVE_FIXED_POINT);
            expect(bondingCurve.isCompleted).to.be.equal(false);
            expect(BigInt(bondingCurve.initReserveETHAmount)).to.be.equal(
                BigInt(virtualReserveETHAmount)
            );
            expect(bondingCurve.token).to.be.equal(tokenAddress);
            expect(bondingCurve.creator).to.be.equal(this.user_2.address);
            expect(BigInt(bondingCurve.curveLimit)).to.be.equal(
                BigInt(globalConfig.curveLimit)
            );

            let receivedToken = await token.balanceOf(this.user_2.address);
            let buyFeeAmount =
                (BigInt(ethAmountToSwap) * BigInt(globalConfig.buyFee)) /
                BigInt(FEE_FIXED_POINT);
            let absSwapAmount = BigInt(ethAmountToSwap) - BigInt(buyFeeAmount);
            let expectAmountOut =
                (BigInt(initReserveTokenAmount) * BigInt(absSwapAmount)) /
                (BigInt(bondingCurve.initReserveETHAmount) +
                    BigInt(absSwapAmount));

            expect(
                BigInt(bondingCurve.reserveETHAmount) -
                    BigInt(bondingCurve.initReserveETHAmount)
            ).to.be.equal(BigInt(absSwapAmount));
            expect(
                BigInt(initReserveTokenAmount) -
                    BigInt(bondingCurve.reserveTokenAmount)
            ).to.be.equal(BigInt(expectAmountOut));
        });
    });

    describe("withdraw", async function () {
        it("withdraw and check", async function () {
            let allLaunchedTokens = await this.WaifuFun.getAllLaunchedTokens();
            let tokenAddress0 = allLaunchedTokens[0];
            let tokenAddress1 = allLaunchedTokens[1];
            let token = new ethers.Contract(
                tokenAddress0,
                ERC20ABI,
                this.deployer
            );

            let bondingCurve0 = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress0
            );
            let bondingCurve1 = await this.WaifuFun.bondingCurvesByToken(
                tokenAddress1
            );
            expect(bondingCurve0.isCompleted).to.be.equal(true);
            expect(bondingCurve1.isCompleted).to.be.equal(false);

            await expect(
                this.WaifuFun.connect(this.user_1).withdraw(tokenAddress0)
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                this.WaifuFun.withdraw(tokenAddress1)
            ).to.be.revertedWith("BONDING_CURVE_IS_NOT_COMPLETED");

            let expectEthAmount =
                BigInt(bondingCurve0.reserveETHAmount) -
                BigInt(bondingCurve0.initReserveETHAmount);
            let expectTokenAmount = bondingCurve0.reserveTokenAmount;
            let beforeEthBal = await getETHBalance(this.deployer.address);
            let beforeTokenBal = await token.balanceOf(this.deployer.address);
            await this.WaifuFun.withdraw(tokenAddress0);
            let afterEthBal = await getETHBalance(this.deployer.address);
            let afterTokenBal = await token.balanceOf(this.deployer.address);
            let receivedEthAmount = BigInt(afterEthBal) - BigInt(beforeEthBal);
            let receivedTokenAmount =
                BigInt(afterTokenBal) - BigInt(beforeTokenBal);
            expect(BigInt(receivedTokenAmount)).to.be.equal(
                BigInt(expectTokenAmount)
            );
            expect(smallNum(receivedEthAmount)).to.be.closeTo(
                smallNum(expectEthAmount),
                0.001
            );
        });
    });
});
