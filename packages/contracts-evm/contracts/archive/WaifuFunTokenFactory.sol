// SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "./WaifuFunToken.sol";
import "./interfaces/IWaifuFunTokenFactory.sol";

interface IOwnable {
    function transferOwnership(address _newOwner) external;
}

contract WaifuFunTokenFactory is OwnableUpgradeable, IWaifuFunTokenFactory {
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
            new WaifuFunToken(name_, symbol_, totalSupply_, decimal_)
        );
        IOwnable(deployedAddress).transferOwnership(msg.sender);

        return deployedAddress;
    }
}
