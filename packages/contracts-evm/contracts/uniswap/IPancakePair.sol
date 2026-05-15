// SPDX-License-Identifier: MIT
//
//   ╭┈ waifu.fun ┈╮
//   │ IPancakePr  │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈╯
//
pragma solidity ^0.8.24;

/// @title IPancakePair
/// @notice minimal PancakeSwap V2 pair surface. only getReserves +
///         token0/token1 for open mc math after migration.
interface IPancakePair {
	function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
	function token0() external view returns (address);
	function token1() external view returns (address);
}
