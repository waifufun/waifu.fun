// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockLPToken is ERC20 {
    constructor() ERC20("LP", "LP") {}
    function mint(address to, uint256 amount) public { _mint(to, amount); }
}

contract MockPancakeFactory {
    mapping(address => mapping(address => address)) public getPair;
    function createPair(address tokenA, address tokenB) public returns (address) {
        MockLPToken lp = new MockLPToken();
        address pair = address(lp);
        getPair[tokenA][tokenB] = pair;
        getPair[tokenB][tokenA] = pair;
        return pair;
    }
}

contract MockPancakeRouter {
    address public factory;
    constructor(address f) { factory = f; }
    function addLiquidity(
        address tokenA, address tokenB,
        uint256 amountADesired, uint256 amountBDesired,
        uint256, uint256, address to, uint256
    ) public returns (uint256, uint256, uint256) {
        IERC20(tokenA).transferFrom(msg.sender, address(this), amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, address(this), amountBDesired);
        MockLPToken lp = new MockLPToken();
        lp.mint(to, 1000 ether);
        return (amountADesired, amountBDesired, 1000 ether);
    }
}
