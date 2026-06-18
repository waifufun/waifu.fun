// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {IAgenticCommerce} from "./interfaces/IAgenticCommerce.sol";
import {IEvaluatorRouter} from "./interfaces/IEvaluatorRouter.sol";
import {ISettlementPolicy} from "./interfaces/ISettlementPolicy.sol";
import {OptimisticPolicy} from "./OptimisticPolicy.sol";

/// @title EvaluatorRouter
/// @notice Coordinates settlement for ERC-8183 jobs: binds a policy to a job, starts the
///         optimistic clock when a deliverable is observed, and (when the policy says yes)
///         tells AgenticCommerce to release the escrow to the provider.
/// @dev    The router is the ONLY address AgenticCommerce trusts to release a given job's
///         escrow (AgenticCommerce checks msg.sender == job.router). The router itself never
///         custodies funds and never moves value directly; it only authorizes a release that
///         AgenticCommerce performs. All addresses are injected; nothing is hardcoded.
contract EvaluatorRouter is IEvaluatorRouter, ReentrancyGuard {
	// ------------------------------------------------------------------
	// Immutable state
	// ------------------------------------------------------------------

	/// @notice The escrow/registry contract this router settles against. Injected.
	IAgenticCommerce public immutable commerce;

	/// @notice The default policy used when a job is settled without an explicit registration.
	address public immutable defaultPolicy;

	// ------------------------------------------------------------------
	// State
	// ------------------------------------------------------------------

	/// @notice jobId => bound settlement policy. address(0) means "use defaultPolicy".
	mapping(uint256 => address) public policyOf;

	// ------------------------------------------------------------------
	// Errors
	// ------------------------------------------------------------------

	error ZeroAddress();
	error UnknownJob();
	error WrongRouter();
	error AlreadyRegistered();
	error NotRegistrant();
	error NotSettleable();
	error NotSubmitted();

	// ------------------------------------------------------------------
	// Events
	// ------------------------------------------------------------------

	event JobRegistered(uint256 indexed jobId, address indexed policy);
	event SubmissionObserved(uint256 indexed jobId, address indexed policy);
	event JobSettled(uint256 indexed jobId, address indexed policy);

	// ------------------------------------------------------------------
	// Constructor
	// ------------------------------------------------------------------

	/// @param _commerce      AgenticCommerce escrow/registry. Injected.
	/// @param _defaultPolicy Fallback policy if a job is never explicitly registered. Injected.
	constructor(address _commerce, address _defaultPolicy) {
		if (_commerce == address(0) || _defaultPolicy == address(0)) revert ZeroAddress();
		commerce = IAgenticCommerce(_commerce);
		defaultPolicy = _defaultPolicy;
	}

	// ------------------------------------------------------------------
	// Registration
	// ------------------------------------------------------------------

	/// @inheritdoc IEvaluatorRouter
	/// @dev Binds a settlement policy to a job. Anyone may register (the policy is what governs
	///      settlement, not who registered), but a job's policy can only be set ONCE so it
	///      cannot be swapped out from under the client. The job must name THIS router.
	function registerJob(uint256 jobId, address policy) external {
		if (policy == address(0)) revert ZeroAddress();

		IAgenticCommerce.Job memory job = commerce.getJob(jobId);
		if (job.id == 0) revert UnknownJob();
		if (job.router != address(this)) revert WrongRouter();
		if (policyOf[jobId] != address(0)) revert AlreadyRegistered();

		policyOf[jobId] = policy;
		emit JobRegistered(jobId, policy);
	}

	// ------------------------------------------------------------------
	// Optimistic clock
	// ------------------------------------------------------------------

	/// @notice Observe a deliverable submission and start the optimistic challenge clock.
	/// @dev Permissionless: anyone can trigger the observation once the job is SUBMITTED. The
	///      policy itself guards against the clock being restarted. If the bound policy does not
	///      track submissions (no noteSubmission), this is a no-op-friendly best effort.
	function noteSubmission(uint256 jobId) external {
		IAgenticCommerce.Job memory job = commerce.getJob(jobId);
		if (job.id == 0) revert UnknownJob();
		if (job.status != IAgenticCommerce.JobStatus.SUBMITTED) revert NotSubmitted();

		address policy = _policyFor(jobId);
		OptimisticPolicy(policy).noteSubmission(jobId);
		emit SubmissionObserved(jobId, policy);
	}

	// ------------------------------------------------------------------
	// Settlement
	// ------------------------------------------------------------------

	/// @inheritdoc IEvaluatorRouter
	/// @dev Consults the bound policy and, only if it returns true, instructs AgenticCommerce to
	///      release the escrow to the provider. nonReentrant guards the cross-contract release.
	function settle(uint256 jobId) external nonReentrant {
		IAgenticCommerce.Job memory job = commerce.getJob(jobId);
		if (job.id == 0) revert UnknownJob();
		if (job.router != address(this)) revert WrongRouter();

		address policy = _policyFor(jobId);

		if (!ISettlementPolicy(policy).canSettle(job)) revert NotSettleable();

		// AgenticCommerce verifies msg.sender == job.router (this contract) before releasing.
		commerce.settleJob(jobId, policy);
		emit JobSettled(jobId, policy);
	}

	// ------------------------------------------------------------------
	// Views / internal
	// ------------------------------------------------------------------

	/// @notice The effective policy for a job (bound policy, else the default).
	function effectivePolicy(uint256 jobId) external view returns (address) {
		return _policyFor(jobId);
	}

	function _policyFor(uint256 jobId) private view returns (address) {
		address policy = policyOf[jobId];
		return policy == address(0) ? defaultPolicy : policy;
	}
}
