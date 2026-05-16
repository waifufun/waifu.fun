// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IV4PoolManager} from "../interfaces/ITreasuryLPDeps.sol";

interface IMintableToken is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract MockFlapV2Pair {
    address public immutable token0;
    address public immutable token1;
    uint112 public reserve0;
    uint112 public reserve1;
    uint32 public blockTimestampLast;
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    constructor(address _token0, address _token1) {
        token0 = _token0;
        token1 = _token1;
    }

    function setReserves(uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast) external {
        reserve0 = _reserve0;
        reserve1 = _reserve1;
        blockTimestampLast = _blockTimestampLast;
    }

    function setPrice0CumulativeLast(uint256 value) external {
        price0CumulativeLast = value;
    }

    function setPrice1CumulativeLast(uint256 value) external {
        price1CumulativeLast = value;
    }

    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }
}

contract MockFlapV2Router {
    address public immutable WETH;
    uint256 public rate = 1000;

    constructor(address _wbnb) {
        WETH = _wbnb;
    }

    receive() external payable {}

    function setRate(uint256 _rate) external {
        rate = _rate;
    }

    function getAmountsOut(uint256 amountIn, address[] calldata path)
        external
        view
        returns (uint256[] memory amounts)
    {
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        amounts[path.length - 1] = amountIn * rate;
    }

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256
    ) external payable {
        uint256 amountOut = msg.value * rate;
        require(amountOut >= amountOutMin, "slippage");
        IMintableToken(path[path.length - 1]).mint(to, amountOut);
    }
}

contract MockBnbUsdFeed {
    int256 public answer;
    uint256 public updatedAt;
    uint8 public decimals = 8;

    constructor(int256 _answer) {
        answer = _answer;
        updatedAt = block.timestamp;
    }

    function setAnswer(int256 _answer) external {
        answer = _answer;
        updatedAt = block.timestamp;
    }

    function setUpdatedAt(uint256 _updatedAt) external {
        updatedAt = _updatedAt;
    }

    function setDecimals(uint8 _decimals) external {
        decimals = _decimals;
    }

    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 latestAnswer,
            uint256 startedAt,
            uint256 latestUpdatedAt,
            uint80 answeredInRound
        )
    {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}

contract MockV4PoolManager is IV4PoolManager {
    using SafeERC20 for IERC20;

    struct Position {
        address owner;
        address token;
        bool tokenIsCurrency0;
        uint256 tokenAmount;
        uint256 claimableBnb;
        uint256 claimableToken;
    }

    uint256 public nextPositionId = 1;
    mapping(uint256 => Position) public positions;
    bool public lieAboutSpent;

    receive() external payable {}

    function modifyLiquidity(PoolKey calldata key, ModifyLiquidityParams calldata params, bytes calldata)
        external
        returns (uint256 positionId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(block.timestamp <= params.deadline, "expired");
        bool tokenIsCurrency0 = params.amount0Desired > 0;
        address token = tokenIsCurrency0 ? key.currency0 : key.currency1;
        uint256 amount = tokenIsCurrency0 ? params.amount0Desired : params.amount1Desired;
        require(amount > 0, "zero amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        positionId = nextPositionId++;
        liquidity = uint128(amount / 1e12);
        if (liquidity == 0) liquidity = 1;
        amount0 = tokenIsCurrency0 ? amount : 0;
        amount1 = tokenIsCurrency0 ? 0 : amount;
        positions[positionId] = Position({
            owner: params.recipient,
            token: token,
            tokenIsCurrency0: tokenIsCurrency0,
            tokenAmount: amount,
            claimableBnb: 0,
            claimableToken: 0
        });
        if (lieAboutSpent) {
            if (tokenIsCurrency0) amount0 = amount - 1;
            else amount1 = amount - 1;
        }
    }

    function setLieAboutSpent(bool _lieAboutSpent) external {
        lieAboutSpent = _lieAboutSpent;
    }

    function setClaimable(uint256 positionId, uint256 amount) external payable {
        require(msg.value == amount, "bad value");
        positions[positionId].claimableBnb += amount;
    }

    function setClaimableToken(uint256 positionId, uint256 amount) external {
        Position storage position = positions[positionId];
        require(position.owner != address(0), "missing");
        position.claimableToken += amount;
        IMintableToken(position.token).mint(address(this), amount);
    }

    function collect(uint256 positionId, address recipient) external returns (uint256 amount0, uint256 amount1) {
        Position storage position = positions[positionId];
        require(position.owner != address(0), "missing");
        uint256 bnbAmount = position.claimableBnb;
        uint256 tokenAmount = position.claimableToken;
        position.claimableBnb = 0;
        position.claimableToken = 0;
        if (bnbAmount > 0) {
            (bool ok,) = payable(recipient).call{value: bnbAmount}("");
            require(ok, "send failed");
        }
        if (tokenAmount > 0) {
            IERC20(position.token).safeTransfer(recipient, tokenAmount);
        }
        if (position.tokenIsCurrency0) {
            amount0 = tokenAmount;
            amount1 = bnbAmount;
        } else {
            amount0 = bnbAmount;
            amount1 = tokenAmount;
        }
    }

    function claimable(uint256 positionId) external view returns (uint256 amount0, uint256 amount1) {
        Position storage position = positions[positionId];
        if (position.tokenIsCurrency0) {
            amount0 = position.claimableToken;
            amount1 = position.claimableBnb;
        } else {
            amount0 = position.claimableBnb;
            amount1 = position.claimableToken;
        }
    }
}
