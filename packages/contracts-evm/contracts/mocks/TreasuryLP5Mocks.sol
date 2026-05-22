// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {INonfungiblePositionManager} from "../interfaces/ITreasuryLPDeps.sol";

interface ITreasuryLP5Claimable {
    function claim() external;
}

interface IMintableTokenLP5 is IERC20 {
    function mint(address to, uint256 amount) external;
}

/// @notice Malicious "agent safe" that reenters claim() during BNB receive.
///         Used to verify TreasuryLP5 nonReentrant guard fires.
contract MaliciousReentrantSafe {
    address public treasury;
    bool public attackArmed;
    uint256 public reenterAttempts;
    bool public lastReenterReverted;

    function setTreasury(address _treasury) external {
        treasury = _treasury;
    }

    function armAttack() external {
        attackArmed = true;
    }

    function disarmAttack() external {
        attackArmed = false;
    }

    function triggerClaim() external {
        ITreasuryLP5Claimable(treasury).claim();
    }

    receive() external payable {
        if (attackArmed && msg.value > 0) {
            reenterAttempts += 1;
            try ITreasuryLP5Claimable(treasury).claim() {
                lastReenterReverted = false;
            } catch {
                lastReenterReverted = true;
            }
        }
    }
}

/// @notice Mock V3 NPM whose createAndInitializePoolIfNecessary returns a
///         pre-existing pool address regardless of sqrtPrice. Mirrors PCS V3
///         NPM behavior for an already-initialized pool: no revert, just
///         returns the existing pool address.
contract PreInitializedPoolNPMMock {
    using SafeERC20 for IERC20;

    struct Position {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint128 tokensOwed0;
        uint128 tokensOwed1;
        address recipient;
    }

    address public immutable wbnb;
    address public preInitPool;
    uint160 public storedSqrtPriceX96;
    bool public initCalled;

    uint256 public nextTokenId = 1;
    mapping(uint256 => Position) internal _positions;

    constructor(address _wbnb, address _preInitPool, uint160 _storedSqrtPriceX96) {
        wbnb = _wbnb;
        preInitPool = _preInitPool;
        storedSqrtPriceX96 = _storedSqrtPriceX96;
    }

    receive() external payable {}

    function createAndInitializePoolIfNecessary(address, address, uint24, uint160)
        external
        payable
        returns (address pool)
    {
        initCalled = true;
        return preInitPool;
    }

    function mint(INonfungiblePositionManager.MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(block.timestamp <= params.deadline, "expired");
        bool side0 = params.amount0Desired > 0;
        address tokenIn = side0 ? params.token0 : params.token1;
        uint256 amount = side0 ? params.amount0Desired : params.amount1Desired;
        require(amount > 0, "zero amount");
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amount);
        tokenId = nextTokenId++;
        liquidity = uint128(amount / 1e12);
        if (liquidity == 0) liquidity = 1;
        amount0 = side0 ? amount : 0;
        amount1 = side0 ? 0 : amount;
        _positions[tokenId] = Position({
            token0: params.token0,
            token1: params.token1,
            fee: params.fee,
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidity: liquidity,
            tokensOwed0: 0,
            tokensOwed1: 0,
            recipient: params.recipient
        });
    }

    function collect(INonfungiblePositionManager.CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        Position storage p = _positions[params.tokenId];
        require(p.recipient != address(0), "missing");
        amount0 = p.tokensOwed0 > params.amount0Max ? params.amount0Max : p.tokensOwed0;
        amount1 = p.tokensOwed1 > params.amount1Max ? params.amount1Max : p.tokensOwed1;
        p.tokensOwed0 -= uint128(amount0);
        p.tokensOwed1 -= uint128(amount1);
        if (amount0 > 0) IERC20(p.token0).safeTransfer(params.recipient, amount0);
        if (amount1 > 0) IERC20(p.token1).safeTransfer(params.recipient, amount1);
    }

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96,
            address,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256,
            uint256,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        )
    {
        Position storage p = _positions[tokenId];
        return (
            0,
            p.recipient,
            p.token0,
            p.token1,
            p.fee,
            p.tickLower,
            p.tickUpper,
            p.liquidity,
            0,
            0,
            p.tokensOwed0,
            p.tokensOwed1
        );
    }
}
