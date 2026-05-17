// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {BundleRouter} from "./BundleRouter.sol";

/// @notice Stateless helper that deploys BundleRouter instances on behalf of
///         LaunchFactory. Exists to keep BundleRouter's creation bytecode out
///         of LaunchFactory's deployed bytecode (which is near the EIP-170
///         24576 byte cap due to embedded child init code).
///
///         Anyone can call this, but the BundleRouter's `factory` field in
///         its constructor args binds it to the calling LaunchFactory, so a
///         router deployed via this helper is only meaningfully callable from
///         that factory's call graph.
contract RouterDeployer {
    function deploy(BundleRouter.ConstructorArgs calldata args) external returns (address) {
        return address(new BundleRouter(args));
    }
}
