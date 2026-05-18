// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {TreasuryLP4} from "./TreasuryLP4.sol";

/// @notice Stateless helper that deploys TreasuryLP4 instances on behalf of
///         LaunchFactory. Exists to keep TreasuryLP4's creation bytecode out
///         of LaunchFactory's deployed bytecode (which is near the EIP-170
///         24576 byte cap with Wave M3 + Wave N additions).
///
///         Anyone can call this helper; LaunchFactory only records treasuries
///         it asks this helper to deploy and only those treasuries get the
///         setFlapV2Pair / ownership transfer treatment.
contract TreasuryLP4Deployer {
    function deploy(TreasuryLP4.ConstructorArgs memory args) external returns (address) {
        TreasuryLP4 treasury = new TreasuryLP4(args);
        // Ownership stays with the caller (LaunchFactory) so it can later
        // call setFlapV2Pair and transferOwnership inside finalizeLaunch.
        treasury.transferOwnership(msg.sender);
        return address(treasury);
    }
}
