// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAgenticCommerce
/// @notice The subset of AgenticCommerce that the EvaluatorRouter depends on to
///         read a job and release its escrow. Kept narrow on purpose.
interface IAgenticCommerce {
	enum JobStatus {
		OPEN,
		FUNDED,
		SUBMITTED,
		SETTLED,
		REJECTED,
		REFUNDED
	}

	struct Job {
		uint256 id;
		JobStatus status;
		address client;
		address provider;
		address router;
		address policy;
		uint256 budget;
		uint64 expiredAt;
		bytes32 deliverableHash;
	}

	function getJob(uint256 jobId) external view returns (Job memory);

	/// @notice Release escrow to the provider. Callable only by the job's bound router.
	function settleJob(uint256 jobId, address policy) external;
}
