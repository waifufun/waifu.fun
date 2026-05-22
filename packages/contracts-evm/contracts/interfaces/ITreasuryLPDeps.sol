// SPDX-License-Identifier: MIT
//
//   ╭┈ waifu.fun ┈╮
//   │ ITreasuryLP │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈╯
//   minimal deps surface.
//
//   Wave N: swapped the fictional IV4PoolManager for the real
//   PCS V3 NonfungiblePositionManager surface (canonical Uniswap V3 NPM
//   ABI). PCS V3 NPM on BSC mainnet:
//     0x46A15B0b27311cedF172AB29E4f4766fbE7F4364
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

/// @notice WBNB / WETH9 minimal surface. The PCS V3 NPM transfers ERC20
///         WBNB to TreasuryLP4 during `collect`; we then unwrap to native BNB
///         before forwarding to recipients.
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

/// @notice Subset of Pancake / Uniswap V3 NonfungiblePositionManager.
///         Trimmed to the methods TreasuryLP4 actually calls. The full NPM
///         additionally implements ERC721 + multicall + permit + selfPermit,
///         none of which we need to type here.
interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1);

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );

    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);
}

/// @notice Minimal pool view for sanity / debug. TreasuryLP4 does NOT call
///         into the pool directly; the NPM is the only mutating surface.
interface IUniswapV3Pool {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
    function liquidity() external view returns (uint128);
    function fee() external view returns (uint24);
    function tickSpacing() external view returns (int24);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

/// @notice V3 factory. We use `feeAmountTickSpacing` to cache tickSpacing for
///         the chosen fee tier and `getPool` for post-deploy sanity checks.
interface IV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
    function feeAmountTickSpacing(uint24 fee) external view returns (int24);
}

// slither-disable-end naming-convention
