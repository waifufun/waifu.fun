// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BundleRouter} from "./BundleRouter.sol";

/// @notice Stateless helper that deploys BundleRouter instances on behalf of
///         LaunchFactory. Exists to keep BundleRouter's creation bytecode out
///         of LaunchFactory's deployed bytecode (which is near the EIP-170
///         24576 byte cap due to embedded child init code).
///
///         Anyone can call this helper, but LaunchFactory only records routers
///         it asks this helper to deploy and only those routers are wired into
///         their launch vaults.
contract RouterDeployer {
    function deploy(BundleRouter.ConstructorArgs calldata args) external returns (address) {
        return address(new BundleRouter(args));
    }
}
