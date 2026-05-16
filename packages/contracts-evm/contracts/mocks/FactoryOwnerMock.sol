// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract FactoryOwnerMock {
    address public owner;

    constructor(address _owner) {
        owner = _owner;
    }

    function setOwner(address newOwner) external {
        owner = newOwner;
    }
}
