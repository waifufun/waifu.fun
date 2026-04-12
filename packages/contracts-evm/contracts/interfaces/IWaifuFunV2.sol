// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IWaifuFunV2
/// @notice Interface for the WaifuFun V2 bonding curve engine.
/// @dev V2 uses WAIFU (ERC-20) as the base token instead of native ETH,
///      and auto-graduates to PancakeSwap V2 when the curve fills.
interface IWaifuFunV2 {
    // --- Structs ---

    /// @notice Parameters for a buy or sell swap.
    struct SwapParameter {
        address token;
        uint256 amountIn;
        uint256 minAmountOut;
        uint8 direction;    // 0 = buy (WAIFU -> token), 1 = sell (token -> WAIFU)
        uint256 deadline;
    }

    /// @notice State of a single bonding curve.
    struct BondingCurve {
        address token;
        address creator;
        uint256 initReserveWAIFU;
        uint256 reserveTokenAmount;
        uint256 reserveWAIFU;
        uint256 curveLimit;
        bool isCompleted;
    }

    /// @notice Parameters for launching a new agent token.
    struct LaunchParams {
        uint256 totalSupply;
        uint256 virtualReserveWAIFU;
        uint8 decimals;
        string name;
        string symbol;
        address agentTreasury;  // receives 10% of supply
        address creator;        // receives 10% of supply
    }

    /// @notice Global configuration for the bonding curve engine.
    struct ConfigParams {
        uint256 buyFee;
        uint256 sellFee;
        uint256 curveLimit;
        uint256 minWAIFUAmount;
        uint256 maxWAIFUAmount;
        uint256 minTotalSupply;
        uint256 maxTotalSupply;
        uint8 minDecimal;
        uint8 maxDecimal;
    }

    // --- Events ---

    event TokenFactoryUpdated(address indexed factory);

    event TokenLaunched(
        address indexed token,
        address indexed creator,
        uint256 totalSupply,
        uint256 virtualReserveWAIFU,
        uint8 decimals,
        string name,
        string symbol,
        address agentTreasury
    );

    event SwapExecuted(
        address indexed trader,
        address indexed token,
        uint256 amountIn,
        uint256 amountOut,
        uint256 feeAmount,
        uint8 direction
    );

    event CurveGraduated(
        address indexed token,
        address pair,
        uint256 waifuAmount,
        uint256 tokenAmount
    );

    event LPLocked(
        address indexed token,
        address pair,
        uint256 lpAmount
    );

    event BondingCurveCompleted(
        address indexed token,
        address indexed lastTrader
    );
}
