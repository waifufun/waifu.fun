// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TreasuryLP5} from "./TreasuryLP5.sol";

/// @notice Stateless helper that deploys TreasuryLP5 instances on behalf of
///         LaunchFactory. Mirrors the TreasuryLP4Deployer pattern: keeps
///         TreasuryLP5's creation bytecode out of LaunchFactory's deployed
///         bytecode (near EIP-170 cap).
contract TreasuryLP5Deployer {
    function deploy(TreasuryLP5.ConstructorArgs memory args) external returns (address) {
        TreasuryLP5 treasury = new TreasuryLP5(args);
        treasury.transferOwnership(msg.sender);
        return address(treasury);
    }
}
