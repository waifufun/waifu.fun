// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.20;

interface IAutoFunTokenFactory {
    function deployToken(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        uint8 decimal_
    ) external returns (address);
}
