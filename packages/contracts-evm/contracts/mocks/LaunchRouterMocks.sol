// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IUniswapV2Router {
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
}

/// @title MockFlapToken
/// @notice ERC20 with bonding curve buy() + 3% transfer tax + graduation to V2 LP.
contract MockFlapToken is ERC20 {
    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
    uint256 public constant GRADUATION_THRESHOLD = 16 ether; // 16 BNB to graduate
    uint256 public constant TAX_BPS = 300; // 3%
    uint256 public constant LP_TOKENS = 200_000_000 ether; // 20% to LP

    address public immutable router;
    address public immutable factory;
    address public immutable wbnb;

    uint256 public totalRaised;
    bool public graduated;
    address public v2Pair;

    // Exempt from tax: this contract, router, pair, dead
    mapping(address => bool) public taxExempt;

    event Graduated(address pair, uint256 bnb, uint256 tokens);

    constructor(address _router, address _factory, address _wbnb) ERC20("MockFlap", "MFLAP") {
        router = _router;
        factory = _factory;
        wbnb = _wbnb;
        _mint(address(this), TOTAL_SUPPLY);
        taxExempt[address(this)] = true;
        taxExempt[_router] = true;
    }

    /// @notice Buy tokens from the bonding curve. Triggers graduation at threshold.
    function buy() external payable {
        require(!graduated, "Already graduated");
        require(msg.value > 0, "No BNB");

        totalRaised += msg.value;

        // Give buyer tokens proportional to their BNB (simplified linear curve)
        uint256 curveTokens = TOTAL_SUPPLY - LP_TOKENS; // 800M available on curve
        uint256 tokensOut = (msg.value * curveTokens) / GRADUATION_THRESHOLD;
        if (tokensOut > balanceOf(address(this)) - LP_TOKENS) {
            tokensOut = balanceOf(address(this)) - LP_TOKENS;
        }

        // Transfer from contract to buyer (no tax on curve buys)
        taxExempt[msg.sender] = true; // temp exempt for this transfer
        _transfer(address(this), msg.sender, tokensOut);

        // Check graduation
        if (totalRaised >= GRADUATION_THRESHOLD) {
            _graduate();
        }
    }

    function _graduate() internal {
        graduated = true;

        // Create V2 pair and add liquidity
        uint256 lpBnb = address(this).balance;
        uint256 lpTokens = LP_TOKENS;

        // Approve router
        _approve(address(this), router, lpTokens);

        // Exempt the pair from tax during add liquidity
        address predictedPair = IUniswapV2Factory(factory).createPair(address(this), wbnb);
        v2Pair = predictedPair;
        taxExempt[predictedPair] = true;

        IUniswapV2Router(router).addLiquidityETH{value: lpBnb}(
            address(this),
            lpTokens,
            0,
            0,
            address(this), // LP tokens held by this contract (locked)
            block.timestamp + 300
        );

        emit Graduated(v2Pair, lpBnb, lpTokens);
    }

    /// @notice 3% transfer tax on non-exempt transfers.
    function _transfer(address from, address to, uint256 amount) internal override {
        if (taxExempt[from] || taxExempt[to] || from == address(this) || to == address(this)) {
            super._transfer(from, to, amount);
            return;
        }

        uint256 tax = (amount * TAX_BPS) / 10000;
        uint256 net = amount - tax;

        // Tax goes to this contract (simulating TaxSplitter)
        super._transfer(from, address(this), tax);
        super._transfer(from, to, net);
    }

    receive() external payable {}
}
