// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
contract MockWAIFU is ERC20 {
    constructor() ERC20("Waifu", "WAIFU") {
        _mint(msg.sender, 1_000_000_000 ether);
    }
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }
}
