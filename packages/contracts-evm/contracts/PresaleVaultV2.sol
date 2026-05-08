// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

/// @title PresaleVaultV2
/// @notice Presalers deposit BNB during OPEN window, may withdraw with 5% penalty
///         (penalty pooled and forwarded into the launch bundle), then claim
///         vested tokens pro-rata after the BundleRouter executes the launch.
/// @dev    State machine: OPEN -> CLOSED -> LAUNCHED.
///         - deposit/withdraw allowed only in OPEN.
///         - close() flips OPEN -> CLOSED (no further deposit/withdraw).
///         - launch(token) flips CLOSED -> LAUNCHED and forwards
///           (totalDeposited + bonusPool) BNB to the immutable bundleRouter.
///         - After launch, vested tokens unlock 10% TGE + 90% linear over
///           vestingDuration (cliff optional). Pro-rata = deposited /
///           totalDeposited at LAUNCHED.
contract PresaleVaultV2 is ReentrancyGuard {
	using SafeERC20 for IERC20;

	// -------------------------------------------------------------------------
	// Constants
	// -------------------------------------------------------------------------

	uint256 public constant BPS_DENOM = 10_000;
	uint256 public constant TGE_BPS = 1_000; // 10% unlocked at launch
	uint256 public constant VESTING_BPS = 9_000; // 90% linear after cliff

	// -------------------------------------------------------------------------
	// Immutables
	// -------------------------------------------------------------------------

	address public immutable owner;
	address payable public immutable bundleRouter;
	uint256 public immutable presaleTokens; // total tokens to distribute pro-rata
	uint256 public immutable penaltyBps; // capped <= 5000 in constructor
	uint256 public immutable vestingCliff; // seconds after launch
	uint256 public immutable vestingDuration; // linear period in seconds (must be > 0)

	// -------------------------------------------------------------------------
	// State
	// -------------------------------------------------------------------------

	enum State {
		OPEN,
		CLOSED,
		LAUNCHED
	}

	State public state;

	address public token; // set at launch
	uint256 public totalDeposited; // sum of active deposits
	uint256 public totalDepositedAtLaunch; // snapshot for pro-rata math
	uint256 public bonusPool; // accumulated penalty BNB
	uint256 public launchTimestamp; // block.timestamp at launch
	uint256 public depositorCount; // unique addresses that ever held a deposit

	struct Depositor {
		uint256 deposited;
		uint256 claimed;
		bool seen;
	}

	mapping(address => Depositor) public depositors;

	// -------------------------------------------------------------------------
	// Events
	// -------------------------------------------------------------------------

	event Deposited(address indexed user, uint256 amount, uint256 newTotal);
	event Withdrawn(address indexed user, uint256 amount, uint256 penalty, uint256 refund);
	event Closed(uint256 totalDeposited, uint256 bonusPool);
	event Launched(address indexed token, uint256 totalBnb, uint256 launchTimestamp);
	event Claimed(address indexed user, uint256 amount, uint256 totalClaimed);

	// -------------------------------------------------------------------------
	// Errors
	// -------------------------------------------------------------------------

	error NotOwner();
	error InvalidState();
	error InvalidParams();
	error ZeroAmount();
	error InsufficientDeposit();
	error NoDeposit();
	error NothingToClaim();
	error LaunchTransferFailed();
	error TokenBalanceTooLow();

	modifier onlyOwner() {
		if (msg.sender != owner) revert NotOwner();
		_;
	}

	modifier inState(State expected) {
		if (state != expected) revert InvalidState();
		_;
	}

	// -------------------------------------------------------------------------
	// Constructor
	// -------------------------------------------------------------------------

	constructor(
		address _owner,
		address payable _bundleRouter,
		uint256 _presaleTokens,
		uint256 _penaltyBps,
		uint256 _vestingCliff,
		uint256 _vestingDuration
	) {
		if (_owner == address(0) || _bundleRouter == address(0)) revert InvalidParams();
		if (_presaleTokens == 0) revert InvalidParams();
		// Cap penalty at 50% so this can't be weaponized as a bricked window.
		if (_penaltyBps > 5_000) revert InvalidParams();
		if (_vestingDuration == 0) revert InvalidParams();

		owner = _owner;
		bundleRouter = _bundleRouter;
		presaleTokens = _presaleTokens;
		penaltyBps = _penaltyBps;
		vestingCliff = _vestingCliff;
		vestingDuration = _vestingDuration;
		state = State.OPEN;
	}

	// -------------------------------------------------------------------------
	// Deposit / withdraw (OPEN only)
	// -------------------------------------------------------------------------

	/// @notice Deposit BNB during the OPEN window.
	function deposit() external payable inState(State.OPEN) {
		if (msg.value == 0) revert ZeroAmount();

		Depositor storage d = depositors[msg.sender];
		if (!d.seen) {
			d.seen = true;
			depositorCount += 1;
		}
		d.deposited += msg.value;
		totalDeposited += msg.value;

		emit Deposited(msg.sender, msg.value, totalDeposited);
	}

	/// @notice Withdraw `amount` BNB during OPEN, paying `penaltyBps` to the
	///         bonus pool. Refund = amount * (BPS_DENOM - penaltyBps) / BPS_DENOM.
	function withdraw(uint256 amount) public nonReentrant inState(State.OPEN) {
		if (amount == 0) revert ZeroAmount();
		Depositor storage d = depositors[msg.sender];
		if (d.deposited < amount) revert InsufficientDeposit();

		uint256 penalty = (amount * penaltyBps) / BPS_DENOM;
		uint256 refund = amount - penalty;

		d.deposited -= amount;
		totalDeposited -= amount;
		bonusPool += penalty;

		Address.sendValue(payable(msg.sender), refund);

		emit Withdrawn(msg.sender, amount, penalty, refund);
	}

	/// @notice Convenience helper: withdraw the full active deposit.
	function withdrawAll() external {
		uint256 amount = depositors[msg.sender].deposited;
		if (amount == 0) revert NoDeposit();
		withdraw(amount);
	}

	// -------------------------------------------------------------------------
	// Lifecycle (owner)
	// -------------------------------------------------------------------------

	/// @notice Close the deposit window. No further deposits or withdrawals.
	function close() external onlyOwner inState(State.OPEN) {
		state = State.CLOSED;
		emit Closed(totalDeposited, bonusPool);
	}

	/// @notice Forward all BNB (deposits + bonus pool) to the BundleRouter and
	///         enter LAUNCHED. Tokens must be transferred to this vault before
	///         the first claim, but verifying balance here would force the
	///         caller to fund tokens upfront; we enforce it lazily in claim().
	/// @param _token The launched ERC-20 token address.
	function launch(address _token) external onlyOwner nonReentrant inState(State.CLOSED) {
		if (_token == address(0)) revert InvalidParams();

		state = State.LAUNCHED;
		token = _token;
		launchTimestamp = block.timestamp;
		totalDepositedAtLaunch = totalDeposited;

		uint256 totalBnb = totalDeposited + bonusPool;
		// Forward the whole pot to the BundleRouter. The router is expected
		// to have a payable entrypoint (receive() or fallback).
		(bool ok, ) = bundleRouter.call{value: totalBnb}("");
		if (!ok) revert LaunchTransferFailed();

		emit Launched(_token, totalBnb, launchTimestamp);
	}

	// -------------------------------------------------------------------------
	// Claim (LAUNCHED)
	// -------------------------------------------------------------------------

	/// @notice Claim vested tokens. Reverts if nothing is currently claimable.
	function claim() external nonReentrant inState(State.LAUNCHED) {
		Depositor storage d = depositors[msg.sender];
		if (d.deposited == 0) revert NoDeposit();

		uint256 totalAlloc = _allocationOf(msg.sender);
		uint256 vested = _vestedFromAlloc(totalAlloc, block.timestamp);
		uint256 alreadyClaimed = d.claimed;
		if (vested <= alreadyClaimed) revert NothingToClaim();

		uint256 claimable = vested - alreadyClaimed;
		d.claimed = alreadyClaimed + claimable;

		IERC20 t = IERC20(token);
		// Defensive balance check: the orchestrator funds this vault with
		// tokens after the launch bundle executes. If they haven't, fail loudly.
		if (t.balanceOf(address(this)) < claimable) revert TokenBalanceTooLow();
		t.safeTransfer(msg.sender, claimable);

		emit Claimed(msg.sender, claimable, d.claimed);
	}

	// -------------------------------------------------------------------------
	// Views
	// -------------------------------------------------------------------------

	/// @notice Token allocation for `user` based on the snapshot at launch.
	function allocationOf(address user) external view returns (uint256) {
		return _allocationOf(user);
	}

	/// @notice Vested tokens for `user` at the current block timestamp.
	function vestedOf(address user) external view returns (uint256) {
		return _vestedFromAlloc(_allocationOf(user), block.timestamp);
	}

	/// @notice Tokens currently claimable by `user`.
	function claimableOf(address user) external view returns (uint256) {
		uint256 vested = _vestedFromAlloc(_allocationOf(user), block.timestamp);
		uint256 claimed = depositors[user].claimed;
		if (vested <= claimed) return 0;
		return vested - claimed;
	}

	function getDepositorInfo(
		address user
	)
		external
		view
		returns (
			uint256 deposited,
			uint256 totalTokens,
			uint256 vested,
			uint256 claimed,
			uint256 claimable
		)
	{
		Depositor storage d = depositors[user];
		deposited = d.deposited;
		totalTokens = _allocationOf(user);
		vested = _vestedFromAlloc(totalTokens, block.timestamp);
		claimed = d.claimed;
		claimable = vested > claimed ? vested - claimed : 0;
	}

	function getPresaleInfo()
		external
		view
		returns (
			State currentState,
			uint256 totalDeposited_,
			uint256 bonusPool_,
			uint256 depositorCount_,
			uint256 launchTimestamp_
		)
	{
		currentState = state;
		totalDeposited_ = totalDeposited;
		bonusPool_ = bonusPool;
		depositorCount_ = depositorCount;
		launchTimestamp_ = launchTimestamp;
	}

	// -------------------------------------------------------------------------
	// Internal math
	// -------------------------------------------------------------------------

	function _allocationOf(address user) internal view returns (uint256) {
		// Pre-launch: pro-rata based on the live totalDeposited (informational).
		// Post-launch: pro-rata based on the snapshot taken at launch.
		uint256 denom = state == State.LAUNCHED ? totalDepositedAtLaunch : totalDeposited;
		if (denom == 0) return 0;
		return (depositors[user].deposited * presaleTokens) / denom;
	}

	function _vestedFromAlloc(uint256 totalAlloc, uint256 nowTs) internal view returns (uint256) {
		if (totalAlloc == 0) return 0;
		if (state != State.LAUNCHED) return 0;

		uint256 elapsed = nowTs - launchTimestamp;
		if (elapsed < vestingCliff) return 0;

		uint256 afterCliff = elapsed - vestingCliff;
		uint256 vestedPct;
		if (afterCliff >= vestingDuration) {
			vestedPct = BPS_DENOM;
		} else {
			vestedPct = TGE_BPS + (afterCliff * VESTING_BPS) / vestingDuration;
			if (vestedPct > BPS_DENOM) vestedPct = BPS_DENOM;
		}
		return (totalAlloc * vestedPct) / BPS_DENOM;
	}

	// Reject stray BNB so users can't accidentally bypass deposit().
	// All BNB must enter via deposit() during OPEN.
	receive() external payable {
		revert InvalidState();
	}
}
