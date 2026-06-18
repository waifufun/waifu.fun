// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEvaluatorRouter
/// @notice Minimal interface the @stwd/erc8183 client drives on an evaluator router.
interface IEvaluatorRouter {
	/// @notice Bind a job to an evaluation policy.
	function registerJob(uint256 jobId, address policy) external;

	/// @notice Settle a job (consults the bound policy, then releases escrow).
	function settle(uint256 jobId) external;
}
