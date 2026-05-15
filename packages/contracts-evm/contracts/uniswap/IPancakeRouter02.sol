// SPDX-License-Identifier: MIT
//
//   ╭┈ waifu.fun ┈╮
//   │ IPancakeR02 │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈╯
//   trimmed PCS V2 router.
//
pragma solidity ^0.8.24;

/// @title IPancakeRouter02
/// @notice trimmed PancakeSwap V2 router surface. only the methods we
///         actually call: V2 follow-up buy with FOT support,
///         addLiquidityETH for TreasuryLP wiring, and getAmountsOut for
///         indexer/preview use.
interface IPancakeRouter02 {
	function swapExactETHForTokensSupportingFeeOnTransferTokens(
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable;

	function addLiquidityETH(
		address token,
		uint256 amountTokenDesired,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline
	) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

	function getAmountsOut(uint256 amountIn, address[] calldata path)
		external
		view
		returns (uint256[] memory amounts);
}
