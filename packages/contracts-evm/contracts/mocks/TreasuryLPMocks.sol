// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {INonfungiblePositionManager} from "../interfaces/ITreasuryLPDeps.sol";

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

/// @notice Minimal WBNB-like ERC20 with deposit/withdraw. TreasuryLP4 unwraps
///         the WBNB it receives from NPM.collect via `IWETH(wbnb).withdraw`.
contract MockWBNB {
    string public constant name = "Wrapped BNB";
    string public constant symbol = "WBNB";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    receive() external payable {
        deposit();
    }

    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Transfer(address(0), msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "WBNB: insufficient");
        balanceOf[msg.sender] -= amount;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "WBNB: send failed");
        emit Transfer(msg.sender, address(0), amount);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            require(a >= value, "WBNB: allowance");
            allowance[from][msg.sender] = a - value;
        }
        _transfer(from, to, value);
        return true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(balanceOf[from] >= value, "WBNB: balance");
        balanceOf[from] -= value;
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    function totalSupply() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Test-only: mint WBNB without ETH (used by mock NPM to credit
    ///         TreasuryLP4 with WBNB fees without round-tripping native value).
    function mintForTest(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}

/// @notice Mock PCS V3 factory: only the surface TreasuryLP4 reads.
contract MockV3Factory {
    mapping(uint24 => int24) public feeAmountTickSpacing;
    mapping(bytes32 => address) public poolFor;

    constructor() {
        feeAmountTickSpacing[100] = 1;
        feeAmountTickSpacing[500] = 10;
        feeAmountTickSpacing[2500] = 50;
        feeAmountTickSpacing[10000] = 200;
    }

    function setFeeAmountTickSpacing(uint24 fee, int24 spacing) external {
        feeAmountTickSpacing[fee] = spacing;
    }

    function setPool(address tokenA, address tokenB, uint24 fee, address pool) external {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        poolFor[keccak256(abi.encode(t0, t1, fee))] = pool;
    }

    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address) {
        (address t0, address t1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return poolFor[keccak256(abi.encode(t0, t1, fee))];
    }
}

/// @notice Mock PCS V3 NonfungiblePositionManager. Emulates the surface
///         TreasuryLP4 uses: createAndInitializePoolIfNecessary + mint +
///         collect + positions. Stores per-position owed amounts that
///         tests can set via helpers.
contract MockNonfungiblePositionManager {
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
    address public mockFactory; // address returned by createAndInitializePoolIfNecessary

    uint256 public nextTokenId = 1;
    mapping(uint256 => Position) internal _positions;
    mapping(bytes32 => address) public initialisedPool;

    // Test knobs.
    bool public lieAboutSpent;
    bool public lieAboutWbnbSide;

    event Minted(uint256 indexed tokenId, address indexed recipient, uint128 liquidity);
    event Collected(uint256 indexed tokenId, address indexed recipient, uint256 amount0, uint256 amount1);

    constructor(address _wbnb) {
        wbnb = _wbnb;
    }

    receive() external payable {}

    function setLieAboutSpent(bool v) external {
        lieAboutSpent = v;
    }

    function setLieAboutWbnbSide(bool v) external {
        lieAboutWbnbSide = v;
    }

    function setTokensOwed(uint256 tokenId, uint128 owed0, uint128 owed1) external {
        Position storage p = _positions[tokenId];
        require(p.recipient != address(0), "missing");
        p.tokensOwed0 = owed0;
        p.tokensOwed1 = owed1;
    }

    /// @notice Push WBNB owed to a position. Mints WBNB into the NPM so
    ///         collect can transfer it onward. The token side stays virtual
    ///         until `creditTokenOwed` is called.
    function creditWbnbOwed(uint256 tokenId, uint128 amount) external payable {
        Position storage p = _positions[tokenId];
        require(p.recipient != address(0), "missing");
        require(msg.value == amount, "fund WBNB");
        (bool ok,) = payable(wbnb).call{value: amount}("");
        require(ok, "wbnb deposit");
        if (p.token0 == wbnb) p.tokensOwed0 += amount;
        else p.tokensOwed1 += amount;
    }

    /// @notice Push token-side owed (price re-entered the range from above).
    ///         The caller must transfer the token amount in before claim.
    function creditTokenOwed(uint256 tokenId, address token, uint128 amount) external {
        Position storage p = _positions[tokenId];
        require(p.recipient != address(0), "missing");
        IMintableToken(token).mint(address(this), amount);
        if (p.token0 == token) p.tokensOwed0 += amount;
        else p.tokensOwed1 += amount;
    }

    function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160)
        external
        payable
        returns (address pool)
    {
        bytes32 key = keccak256(abi.encode(token0, token1, fee));
        pool = initialisedPool[key];
        if (pool == address(0)) {
            pool = address(uint160(uint256(key)));
            initialisedPool[key] = pool;
        }
    }

    function mint(INonfungiblePositionManager.MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        require(block.timestamp <= params.deadline, "expired");

        // single-sided: exactly one of (amount0Desired, amount1Desired) is nonzero
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

        if (lieAboutSpent) {
            if (side0) amount0 = amount - 1;
            else amount1 = amount - 1;
        }
        if (lieAboutWbnbSide) {
            if (side0) amount1 = 1;
            else amount0 = 1;
        }

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

        emit Minted(tokenId, params.recipient, liquidity);
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

        emit Collected(params.tokenId, params.recipient, amount0, amount1);
    }

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

/// @notice Test recipient that rejects native BNB. Used to surface
///         `bnb_transfer_failed` in claim() unit tests.
contract BnbRejecter {
    receive() external payable {
        revert("nope");
    }
}
