// SPDX-License-Identifier: MIT
//
//   ╭┈ waifu.fun ┈╮
//   │ ITreasuryLP │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈╯
//   minimal deps surface.
//
pragma solidity ^0.8.24;

// slither-disable-start naming-convention

interface IFlapV2Pair {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function price0CumulativeLast() external view returns (uint256);
    function price1CumulativeLast() external view returns (uint256);
}

interface IFlapV2Router {
    function WETH() external view returns (address);
    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts);
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
}

interface IChainlinkFeed {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface IV4PoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        address hooks;
        address poolManager;
        uint24 fee;
        int24 tickSpacing;
    }

    struct ModifyLiquidityParams {
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Max;
        uint256 amount1Max;
        address recipient;
        uint256 deadline;
    }

    function modifyLiquidity(PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata hookData)
        external
        returns (uint256 positionId, uint128 liquidity, uint256 amount0, uint256 amount1);

    function collect(uint256 positionId, address recipient) external returns (uint256 amount0, uint256 amount1);

    function claimable(uint256 positionId) external view returns (uint256 amount0, uint256 amount1);
}

// slither-disable-end naming-convention
