// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.20;

interface IAutoFunToken {
    function mintToken(address _recipient, uint256 _amount) external;
}
