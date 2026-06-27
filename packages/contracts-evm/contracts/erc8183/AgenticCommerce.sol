// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import {IEvaluatorRouter} from "./interfaces/IEvaluatorRouter.sol";

/// @title AgenticCommerce
/// @notice ERC-8183-compatible job registry + escrow for agentic commerce.
/// @dev    A client opens a job naming a provider and an evaluator router, funds it with an
///         injected ERC20 payment token, the provider submits a deliverable hash, and an
///         authorized router settles the job (releasing escrow to the provider). If the job
///         expires unsettled the client can always reclaim the escrow via claimRefund.
///
///         Design notes:
///         - Payment token + all addresses are injected (constructor / call args). Nothing is
///           hardcoded; the code is vendor-neutral and any deployer wires its own addresses.
///         - Escrow custody lives in THIS contract. Funds are released ONLY by the job's own
///           router (settleJob) or returned to the client (claimRefund). There is no admin
///           withdraw and no path that strands funds: a funded job is always either settled to
///           the provider or refundable to the client after expiry.
///         - Strict status machine with check-effects-interactions + ReentrancyGuard on every
///           value-moving function.
contract AgenticCommerce is ReentrancyGuard {
	using SafeERC20 for IERC20;

	// ------------------------------------------------------------------
	// Types
	// ------------------------------------------------------------------

	/// @dev Status codes MUST match the @stwd/erc8183 client mapping:
	///      0 OPEN, 1 FUNDED, 2 SUBMITTED, 3 SETTLED, 4 REJECTED, 5 REFUNDED.
	enum JobStatus {
		OPEN, // 0 created, budget may be unset, no escrow held
		FUNDED, // 1 escrow received, awaiting deliverable
		SUBMITTED, // 2 provider submitted a deliverable hash
		SETTLED, // 3 router released escrow to provider (terminal)
		REJECTED, // 4 disputed; client may reclaim escrow (refundable)
		REFUNDED // 5 escrow returned to client (terminal)
	}

	/// @dev Field order MUST match the getJob tuple in the client ABI exactly.
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

	// ------------------------------------------------------------------
	// Immutable state
	// ------------------------------------------------------------------

	/// @notice The ERC20 token escrowed for every job. Injected, never hardcoded.
	IERC20 public immutable paymentToken;

	// ------------------------------------------------------------------
	// Mutable state
	// ------------------------------------------------------------------

	/// @dev Monotonic job id counter. First job is id 1 (0 is reserved as "none").
	uint256 public jobCount;

	mapping(uint256 => Job) private _jobs;

	// ------------------------------------------------------------------
	// Errors
	// ------------------------------------------------------------------

	error ZeroAddress();
	error ExpiryInPast();
	error UnknownJob();
	error NotClient();
	error NotProvider();
	error NotRouter();
	error BadStatus();
	error ZeroAmount();
	error BudgetAlreadySet();
	error BudgetNotSet();
	error BudgetMismatch();
	error NotExpired();

	// ------------------------------------------------------------------
	// Events
	// ------------------------------------------------------------------

	/// @dev The @stwd/erc8183 client decodes jobId from this event's first (indexed) topic.
	///      Signature + indexing MUST match the client ABI exactly.
	event JobCreated(
		uint256 indexed jobId,
		address indexed client,
		address indexed provider,
		address router,
		uint64 expiredAt,
		string description
	);
	event BudgetSet(uint256 indexed jobId, uint256 amount);
	event JobFunded(uint256 indexed jobId, address indexed funder, uint256 amount);
	event Submitted(uint256 indexed jobId, bytes32 deliverableHash);
	event Disputed(uint256 indexed jobId);
	event Settled(uint256 indexed jobId, address indexed provider, uint256 amount);
	event Refunded(uint256 indexed jobId, address indexed client, uint256 amount);

	// ------------------------------------------------------------------
	// Constructor
	// ------------------------------------------------------------------

	/// @param _paymentToken ERC20 used to fund every job's escrow. Injected by the deployer.
	constructor(address _paymentToken) {
		if (_paymentToken == address(0)) revert ZeroAddress();
		paymentToken = IERC20(_paymentToken);
	}

	// ------------------------------------------------------------------
	// Job lifecycle
	// ------------------------------------------------------------------

	/// @notice Open a new job. msg.sender becomes the client.
	/// @param provider    The address that will be paid on settlement.
	/// @param router      The evaluator router authorized to settle this job.
	/// @param expiredAt   Unix timestamp after which the client may claim a refund.
	/// @param description Free-form description (emitted in the event, not stored).
	/// @return jobId      The new monotonic job id.
	function createJob(
		address provider,
		address router,
		uint64 expiredAt,
		string calldata description
	) external returns (uint256 jobId) {
		if (provider == address(0) || router == address(0)) revert ZeroAddress();
		if (expiredAt <= block.timestamp) revert ExpiryInPast();

		jobId = ++jobCount;

		Job storage job = _jobs[jobId];
		job.id = jobId;
		job.status = JobStatus.OPEN;
		job.client = msg.sender;
		job.provider = provider;
		job.router = router;
		// policy is bound by the router via registerJob/settle; default stays address(0).
		job.expiredAt = expiredAt;

		emit JobCreated(jobId, msg.sender, provider, router, expiredAt, description);
	}

	/// @notice Set the escrow budget for a job. Client-only, before funding.
	/// @dev Budget is set once while OPEN and unfunded. fund() must match it exactly.
	function setBudget(uint256 jobId, uint256 amount) external {
		Job storage job = _load(jobId);
		if (msg.sender != job.client) revert NotClient();
		if (job.status != JobStatus.OPEN) revert BadStatus();
		if (amount == 0) revert ZeroAmount();
		if (job.budget != 0) revert BudgetAlreadySet();

		job.budget = amount;
		emit BudgetSet(jobId, amount);
	}

	/// @notice Fund the job escrow by pulling `amount` of the payment token from msg.sender.
	/// @dev Requires a prior setBudget; `amount` must equal the budget. Moves OPEN -> FUNDED.
	///      The pull happens last (check-effects-interactions); status is flipped before the
	///      external token call and the call is nonReentrant.
	function fund(uint256 jobId, uint256 amount) external nonReentrant {
		Job storage job = _load(jobId);
		if (job.status != JobStatus.OPEN) revert BadStatus();
		if (job.budget == 0) revert BudgetNotSet();
		if (amount != job.budget) revert BudgetMismatch();

		// Effects before interaction.
		job.status = JobStatus.FUNDED;

		// Interaction: pull escrow. We credit exactly `amount`; the contract's recorded
		// liability for this job is `budget`. Fee-on-transfer tokens that deliver less than
		// `amount` are unsupported as escrow tokens (the deployer injects a standard ERC20).
		paymentToken.safeTransferFrom(msg.sender, address(this), amount);

		emit JobFunded(jobId, msg.sender, amount);
	}

	/// @notice Provider submits the deliverable hash. Moves FUNDED -> SUBMITTED.
	function submit(uint256 jobId, bytes32 deliverableHash) external {
		Job storage job = _load(jobId);
		if (msg.sender != job.provider) revert NotProvider();
		if (job.status != JobStatus.FUNDED) revert BadStatus();

		job.status = JobStatus.SUBMITTED;
		job.deliverableHash = deliverableHash;

		emit Submitted(jobId, deliverableHash);
	}

	/// @notice Client disputes a submitted deliverable. Moves SUBMITTED -> REJECTED.
	/// @dev REJECTED is a refundable terminal-ish state: the client reclaims escrow via
	///      claimRefund (no expiry wait required once rejected).
	function dispute(uint256 jobId) external {
		Job storage job = _load(jobId);
		if (msg.sender != job.client) revert NotClient();
		if (job.status != JobStatus.SUBMITTED) revert BadStatus();

		job.status = JobStatus.REJECTED;
		emit Disputed(jobId);
	}

	/// @notice Settle a job, releasing escrow to the provider. Router-only.
	/// @dev Called by the job's bound router (typically via EvaluatorRouter.settle, which
	///      consults the OptimisticPolicy). Valid from FUNDED or SUBMITTED. Moves -> SETTLED.
	///      `policy` is recorded for transparency (the router passes the policy it evaluated).
	function settleJob(uint256 jobId, address policy) external nonReentrant {
		Job storage job = _load(jobId);
		if (msg.sender != job.router) revert NotRouter();
		if (job.status != JobStatus.FUNDED && job.status != JobStatus.SUBMITTED) {
			revert BadStatus();
		}

		uint256 amount = job.budget;
		address provider = job.provider;

		// Effects before interaction.
		job.status = JobStatus.SETTLED;
		job.policy = policy;

		if (amount > 0) {
			paymentToken.safeTransfer(provider, amount);
		}

		emit Settled(jobId, provider, amount);
	}

	/// @notice Client reclaims escrow after expiry, or immediately after a dispute (REJECTED).
	/// @dev Refund path is ALWAYS reachable for funded value:
	///        - FUNDED or SUBMITTED + block.timestamp >= expiredAt  -> refundable
	///        - REJECTED (disputed)                                 -> refundable immediately
	///      Moves the job to REFUNDED (terminal) and returns escrow to the client.
	function claimRefund(uint256 jobId) external nonReentrant {
		Job storage job = _load(jobId);
		if (msg.sender != job.client) revert NotClient();

		bool refundableByExpiry = (job.status == JobStatus.FUNDED ||
			job.status == JobStatus.SUBMITTED) && block.timestamp >= job.expiredAt;
		bool refundableByDispute = job.status == JobStatus.REJECTED;

		if (!refundableByExpiry && !refundableByDispute) {
			// Distinguish "wrong state" from "not yet expired" for better UX.
			if (job.status == JobStatus.FUNDED || job.status == JobStatus.SUBMITTED) {
				revert NotExpired();
			}
			revert BadStatus();
		}

		uint256 amount = job.budget;
		address client = job.client;

		// Effects before interaction.
		job.status = JobStatus.REFUNDED;

		if (amount > 0) {
			paymentToken.safeTransfer(client, amount);
		}

		emit Refunded(jobId, client, amount);
	}

	// ------------------------------------------------------------------
	// Views
	// ------------------------------------------------------------------

	/// @notice Returns the full job record.
	function getJob(uint256 jobId) external view returns (Job memory job) {
		job = _jobs[jobId];
		if (job.id == 0) revert UnknownJob();
	}

	/// @notice Returns just the job status code (uint8).
	function getJobStatus(uint256 jobId) external view returns (JobStatus) {
		Job storage job = _jobs[jobId];
		if (job.id == 0) revert UnknownJob();
		return job.status;
	}

	// ------------------------------------------------------------------
	// Internal
	// ------------------------------------------------------------------

	function _load(uint256 jobId) private view returns (Job storage job) {
		job = _jobs[jobId];
		if (job.id == 0) revert UnknownJob();
	}
}
