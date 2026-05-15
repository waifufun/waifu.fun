// SPDX-License-Identifier: MIT
//
//   ╭┈ waifu.fun ┈╮
//   │ IPancakeFct │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈╯
//
pragma solidity ^0.8.24;

/// @title IPancakeFactory
/// @notice minimal PancakeSwap V2 factory surface. BundleRouter calls
///         getPair() to confirm the V2 pair created by Flap graduation;
///         test mocks call createPair() to wire up local fixtures.
interface IPancakeFactory {
	function getPair(address tokenA, address tokenB) external view returns (address pair);

	function createPair(address tokenA, address tokenB) external returns (address pair);
}
