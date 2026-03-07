const { expect } = require("chai");
const { ethers } = require("hardhat");
const ERC20ABI = require("../external_abi/ERC20.abi.json");
const { setupWaifuFunSuite } = require("./helpers/deployment");

describe("WaifuFun Security Regression Tests", function () {
    beforeEach(async function () {
        Object.assign(this, await setupWaifuFunSuite());
        this.decimals = 18;
        this.totalSupply = ethers.utils.parseUnits("500000", this.decimals);
        this.virtualReserveETHAmount = ethers.utils.parseEther("0.5");

        await this.WaifuFun.connect(this.user_1).launch(
            this.totalSupply,
            this.virtualReserveETHAmount,
            this.decimals,
            "Security Test Token",
            "SEC"
        );

        this.tokenAddress = (
            await this.WaifuFun.getLaunchedTokensByOwner(this.user_1.address)
        )[0];
        this.token = new ethers.Contract(
            this.tokenAddress,
            ERC20ABI,
            this.deployer
        );
    });

    function getDeadline() {
        return Math.floor(Date.now() / 1000) + 3600;
    }

    it("transfers bought tokens even when the fee rounds down to zero", async function () {
        const buyAmount = 1000;
        const beforeCurve = await this.WaifuFun.bondingCurvesByToken(
            this.tokenAddress
        );
        const beforeUserBal = await this.token.balanceOf(this.user_1.address);
        const beforeContractBal = await this.token.balanceOf(
            this.WaifuFun.address
        );

        await this.WaifuFun.connect(this.user_1).swap(
            {
                token: this.tokenAddress,
                amountIn: buyAmount,
                minAmountOut: 1,
                direction: 0,
                deadline: getDeadline(),
            },
            {
                value: buyAmount,
            }
        );

        const afterCurve = await this.WaifuFun.bondingCurvesByToken(
            this.tokenAddress
        );
        const afterUserBal = await this.token.balanceOf(this.user_1.address);
        const afterContractBal = await this.token.balanceOf(
            this.WaifuFun.address
        );

        const reserveDelta = beforeCurve.reserveTokenAmount.sub(
            afterCurve.reserveTokenAmount
        );
        const userDelta = afterUserBal.sub(beforeUserBal);
        const contractDelta = beforeContractBal.sub(afterContractBal);

        expect(userDelta).to.be.gt(0);
        expect(userDelta).to.equal(reserveDelta);
        expect(contractDelta).to.equal(reserveDelta);
    });

    it("reverts dust buys that would otherwise produce zero output", async function () {
        const decimals = 6;
        const totalSupply = ethers.BigNumber.from(10000).mul(
            ethers.BigNumber.from(10).pow(decimals)
        );

        await this.WaifuFun.connect(this.user_2).launch(
            totalSupply,
            this.virtualReserveETHAmount,
            decimals,
            "Dust Buy Token",
            "DBT"
        );

        const dustBuyToken = (
            await this.WaifuFun.getLaunchedTokensByOwner(this.user_2.address)
        )[0];
        const beforeCurve = await this.WaifuFun.bondingCurvesByToken(
            dustBuyToken
        );

        await expect(
            this.WaifuFun.connect(this.user_1).swap(
                {
                    token: dustBuyToken,
                    amountIn: 1,
                    minAmountOut: 0,
                    direction: 0,
                    deadline: getDeadline(),
                },
                {
                    value: 1,
                }
            )
        ).to.be.revertedWith("INSUFFICIENT_OUTPUT_AMOUNT");

        const afterCurve = await this.WaifuFun.bondingCurvesByToken(
            dustBuyToken
        );
        expect(afterCurve.reserveETHAmount).to.equal(
            beforeCurve.reserveETHAmount
        );
        expect(afterCurve.reserveTokenAmount).to.equal(
            beforeCurve.reserveTokenAmount
        );
    });

    it("reverts dust sells that would otherwise burn tokens for zero ETH", async function () {
        const buyAmount = ethers.utils.parseEther("0.1");

        await this.WaifuFun.connect(this.user_1).swap(
            {
                token: this.tokenAddress,
                amountIn: buyAmount,
                minAmountOut: 0,
                direction: 0,
                deadline: getDeadline(),
            },
            {
                value: buyAmount,
            }
        );

        await this.token.connect(this.user_1).approve(this.WaifuFun.address, 1);

        await expect(
            this.WaifuFun.connect(this.user_1).swap({
                token: this.tokenAddress,
                amountIn: 1,
                minAmountOut: 0,
                direction: 1,
                deadline: getDeadline(),
            })
        ).to.be.revertedWith("INSUFFICIENT_OUTPUT_AMOUNT");
    });

    it("rejects initial reserves at or above the curve limit", async function () {
        const { curveLimit } = await this.WaifuFun.globalConfig();

        await expect(
            this.WaifuFun.connect(this.user_2).launch(
                this.totalSupply,
                curveLimit,
                this.decimals,
                "Exact Limit Token",
                "ELT"
            )
        ).to.be.revertedWith("INVALID_RESERVE_ETH_AMOUNT");

        await expect(
            this.WaifuFun.connect(this.user_2).launch(
                this.totalSupply,
                curveLimit.add(1),
                this.decimals,
                "Over Limit Token",
                "OLT"
            )
        ).to.be.revertedWith("INVALID_RESERVE_ETH_AMOUNT");
    });

    it("rejects swaps for tokens that were never launched", async function () {
        const unknownToken = ethers.Wallet.createRandom().address;

        await expect(
            this.WaifuFun.connect(this.user_1).swap(
                {
                    token: unknownToken,
                    amountIn: ethers.utils.parseEther("0.1"),
                    minAmountOut: 0,
                    direction: 0,
                    deadline: getDeadline(),
                },
                {
                    value: ethers.utils.parseEther("0.1"),
                }
            )
        ).to.be.revertedWith("TOKEN_NOT_LAUNCHED");
    });

    it("documents that the configured team wallet can dump its upfront allocation", async function () {
        const buyAmount = ethers.utils.parseEther("0.1");

        await this.WaifuFun.connect(this.user_1).swap(
            {
                token: this.tokenAddress,
                amountIn: buyAmount,
                minAmountOut: 0,
                direction: 0,
                deadline: getDeadline(),
            },
            {
                value: buyAmount,
            }
        );

        const teamToken = this.token.connect(this.teamWallet);
        const teamTokenBalance = await teamToken.balanceOf(
            this.teamWallet.address
        );
        const dumpAmount = teamTokenBalance.div(10);
        const beforeCurve = await this.WaifuFun.bondingCurvesByToken(
            this.tokenAddress
        );
        const beforeTeamEth = await ethers.provider.getBalance(
            this.teamWallet.address
        );

        await teamToken.approve(this.WaifuFun.address, dumpAmount);
        const sellTx = await this.WaifuFun.connect(this.teamWallet).swap({
            token: this.tokenAddress,
            amountIn: dumpAmount,
            minAmountOut: 0,
            direction: 1,
            deadline: getDeadline(),
        });
        const sellReceipt = await sellTx.wait();
        const gasCost = sellReceipt.gasUsed.mul(sellReceipt.effectiveGasPrice);

        const afterCurve = await this.WaifuFun.bondingCurvesByToken(
            this.tokenAddress
        );
        const afterTeamEth = await ethers.provider.getBalance(
            this.teamWallet.address
        );

        expect(teamTokenBalance).to.be.gt(0);
        expect(dumpAmount).to.be.gt(0);
        expect(beforeCurve.reserveETHAmount).to.be.gt(
            afterCurve.reserveETHAmount
        );
        expect(afterTeamEth.sub(beforeTeamEth).add(gasCost)).to.be.gt(0);
    });
});
