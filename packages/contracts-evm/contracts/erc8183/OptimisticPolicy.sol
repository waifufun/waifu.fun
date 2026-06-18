// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgenticCommerce} from "./interfaces/IAgenticCommerce.sol";
import {ISettlementPolicy} from "./interfaces/ISettlementPolicy.sol";

/// @title OptimisticPolicy
/// @notice Optimistic settlement: a submitted deliverable is automatically accepted once a
///         fixed challenge window has elapsed, UNLESS the client disputed it.
/// @dev    The policy is a pure decision function over the on-chain Job record:
///           - SUBMITTED + challenge window elapsed -> settleable (provider wins by default)
///           - REJECTED (client disputed)           -> NOT settleable (escrow refunds to client)
///           - FUNDED / OPEN / SETTLED / REFUNDED    -> NOT settleable
///
///         The challenge window is measured from when the router observed the submission, which
///         the router records via noteSubmission(). This keeps AgenticCommerce's Job ABI fixed
///         (no extra timestamp field) while still giving the optimistic clock a defined start.
///
///         The policy holds no funds and moves no value. It is immutable and parameter-free
///         beyond its challenge window, injected at deploy time.
contract OptimisticPolicy is ISettlementPolicy {
	// ------------------------------------------------------------------
	// Immutable config
	// ------------------------------------------------------------------

	/// @notice Seconds a submitted deliverable must sit un-disputed before it can settle.
	uint64 public immutable challengeWindow;

	/// @notice The router authorized to record submission timestamps for this policy.
	address public immutable router;

	// ------------------------------------------------------------------
	// State
	// ------------------------------------------------------------------

	/// @notice jobId => unix timestamp at which the router observed the deliverable submission.
	///         0 means "not yet observed".
	mapping(uint256 => uint64) public submittedAt;

	// ------------------------------------------------------------------
	// Errors
	// ------------------------------------------------------------------

	error ZeroAddress();
	error ZeroWindow();
	error NotRouter();
	error AlreadyNoted();

	// ------------------------------------------------------------------
	// Events
	// ------------------------------------------------------------------

	event SubmissionNoted(uint256 indexed jobId, uint64 timestamp);

	// ------------------------------------------------------------------
	// Constructor
	// ------------------------------------------------------------------

	/// @param _router          The EvaluatorRouter that drives this policy. Injected.
	/// @param _challengeWindow Challenge window in seconds (must be > 0).
	constructor(address _router, uint64 _challengeWindow) {
		if (_router == address(0)) revert ZeroAddress();
		if (_challengeWindow == 0) revert ZeroWindow();
		router = _router;
		challengeWindow = _challengeWindow;
	}

	// ------------------------------------------------------------------
	// Router hook
	// ------------------------------------------------------------------

	/// @notice Record the moment the router observed a deliverable submission for `jobId`.
	/// @dev Router-only. Starts the optimistic challenge clock. Idempotent-guarded: the first
	///      observation wins so the provider cannot reset the clock by re-submitting.
	function noteSubmission(uint256 jobId) external {
		if (msg.sender != router) revert NotRouter();
		if (submittedAt[jobId] != 0) revert AlreadyNoted();

		uint64 ts = uint64(block.timestamp);
		submittedAt[jobId] = ts;
		emit SubmissionNoted(jobId, ts);
	}

	// ------------------------------------------------------------------
	// Decision
	// ------------------------------------------------------------------

	/// @inheritdoc ISettlementPolicy
	/// @dev Settleable only when the deliverable was submitted, the challenge window has fully
	///      elapsed since the router observed it, and the client has not disputed.
	function canSettle(IAgenticCommerce.Job calldata job)
		external
		view
		returns (bool)
	{
		// A disputed (REJECTED) job is never optimistically settleable; escrow refunds.
		if (job.status != IAgenticCommerce.JobStatus.SUBMITTED) {
			return false;
		}

		uint64 ts = submittedAt[job.id];
		if (ts == 0) {
			// Router never recorded the submission; the optimistic clock never started.
			return false;
		}

		// Strictly after the window so a settle in the same block as the deadline is rejected.
		return block.timestamp > uint256(ts) + uint256(challengeWindow);
	}
}
