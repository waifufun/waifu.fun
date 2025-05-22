// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./AutoFunToken.sol";
import "./interfaces/IAutoFunTokenFactory.sol";

interface IOwnable {
    function transferOwnership(address _newOwner) external;
}

contract AutoFunTokenFactory is OwnableUpgradeable, IAutoFunTokenFactory {
    function initialize() public initializer {
        __Ownable_init();
    }

    function deployToken(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        uint8 decimal_
    ) external onlyOwner returns (address) {
        address deployedAddress = address(
            new AutoFunToken(name_, symbol_, totalSupply_, decimal_)
        );
        IOwnable(deployedAddress).transferOwnership(msg.sender);

        return deployedAddress;
    }
}
