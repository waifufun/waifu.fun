// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.20;

interface IAutoFun {
    struct SwapParameter {
        address token;
        uint256 amountIn;
        uint256 minAmountOut;
        uint8 direction;
        uint256 deadline;
    }

    struct BondingCurve {
        address token;
        address creator;
        uint256 initReserveETHAmount;
        uint256 reserveTokenAmount;
        uint256 reserveETHAmount;
        uint256 curveLimit;
        bool isCompleted;
    }

    struct ConfigParams {
        address teamWallet;
        uint256 buyFee;
        uint256 sellFee;
        uint256 curveLimit;
        uint256 initBondingCurveRate;
        uint256 minETHAmount;
        uint256 maxETHAmount;
        /// @notice min/max total supply amount. this is amount that divided by decimal.
        uint256 minTotalSupply;
        uint256 maxTotalSupply;
        uint8 minDecimal;
        uint8 maxDecimal;
    }

    event AutoFunTokenFactoryUpdated(address indexed factory);

    event BondingCurveCompleted(
        address indexed token,
        address indexed lastTrader
    );

    event TokenLaunched(
        uint256 totalSupply,
        uint256 virtualReserveETHAmount,
        uint8 decimals,
        string name,
        string symbol
    );

    event SwapExecuted(
        address indexed trader,
        address indexed token,
        uint256 amountIn,
        uint256 minAmountOut,
        uint8 direction
    );

    event Withdrawn(
        address indexed token,
        uint256 ethAmount,
        uint256 tokenAmount
    );
}
