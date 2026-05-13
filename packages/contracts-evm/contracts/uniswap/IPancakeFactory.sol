// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IPancakeFactory
/// @notice minimal PancakeSwap V2 factory surface used by the wave H
///         BundleRouter to confirm the V2 pair created by Flap migration.
interface IPancakeFactory {
	function getPair(address tokenA, address tokenB) external view returns (address pair);
}
