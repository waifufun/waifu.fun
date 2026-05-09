// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

interface IBundleRouter {
	struct BundleParams {
		address flapToken;
		uint256 curveFillBnb;
		uint256 v2BuyBnb;
		uint256 minTokensFromV2;
		uint256 deadline;
	}

	function execute(BundleParams calldata params) external payable;
}

/// @title LaunchVault
/// @notice Presalers deposit BNB during the OPEN window, may withdraw with a
///         configurable penalty (capped at 10%, pooled and forwarded into the
///         launch bundle), then claim vested tokens pro-rata after the launch
///         router executes the launch.
/// @dev    State machine: OPEN -> CLOSED -> LAUNCHED.
///         - deposit/withdraw allowed only in OPEN.
///         - close() flips OPEN -> CLOSED. Owner may call any time. Anyone may
///           call after `closeTimestamp` is reached (auto-close window).
///         - launch(token) flips CLOSED -> LAUNCHED and forwards
///           (totalDeposited + bonusPool) BNB to the immutable launchRouter.
///         - After launch, vesting depends on `vestingEnabled`:
///             * false: 100% unlocked at TGE
///             * true:  50% TGE + 50% linear over 24h
contract LaunchVault is ReentrancyGuard {
	using SafeERC20 for IERC20;

	// -------------------------------------------------------------------------
	// Constants
	// -------------------------------------------------------------------------

	uint256 public constant BPS_DENOM = 10_000;
	uint256 public constant MAX_PENALTY_BPS = 1_000; // 10% max
	uint256 public constant VESTING_WINDOW = 86_400; // 24h linear period when enabled
	uint256 public constant VESTING_TGE_BPS = 5_000; // 50% TGE when enabled
	uint256 public constant VESTING_LINEAR_BPS = 5_000; // 50% linear when enabled

	// -------------------------------------------------------------------------
	// Immutables
	// -------------------------------------------------------------------------

	address public immutable owner;
	address payable public immutable launchRouter;
	uint256 public immutable presaleTokens; // total tokens to distribute pro-rata
	uint256 public immutable presaleCap; // max active BNB deposits and successful-launch threshold
	uint256 public immutable bnbForBuy; // BNB reserved for the V2 buy leg
	uint256 public immutable penaltyBps; // capped <= MAX_PENALTY_BPS in constructor
	bool public immutable vestingEnabled; // false = 100% TGE, true = 50/50/24h
	uint256 public immutable closeTimestamp; // anyone can close() after this

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
	bool public refundsEnabled; // owner-marked failed-launch refund path

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
	event Closed(address indexed by, uint256 totalDeposited, uint256 bonusPool);
	event Launched(address indexed token, uint256 totalBnb, uint256 launchTimestamp);
	event RefundsEnabled();
	event Refunded(address indexed user, uint256 principal, uint256 bonus, uint256 refundAmount, uint256 newTotal);
	event Claimed(address indexed user, uint256 amount, uint256 totalClaimed);

	// -------------------------------------------------------------------------
	// Errors
	// -------------------------------------------------------------------------

	error NotOwner();
	error NotAuthorizedToClose();
	error InvalidState();
	error InvalidParams();
	error ZeroAmount();
	error InsufficientDeposit();
	error NoDeposit();
	error NothingToClaim();
	error LaunchTransferFailed();
	error TokenBalanceTooLow();
	error PresaleClosed();
	error PresaleCapExceeded();
	error UnderSubscribed();

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
		address payable _launchRouter,
		uint256 _presaleTokens,
		uint256 _presaleCap,
		uint256 _bnbForBuy,
		uint256 _penaltyBps,
		bool _vestingEnabled,
		uint256 _closeTimestamp
	) {
		if (_owner == address(0) || _launchRouter == address(0)) revert InvalidParams();
		if (_presaleTokens == 0 || _presaleCap == 0 || _bnbForBuy > _presaleCap) revert InvalidParams();
		// Cap penalty at 10% so this can't be weaponized as a bricked window.
		if (_penaltyBps > MAX_PENALTY_BPS) revert InvalidParams();
		// closeTimestamp must be in the future at deploy time.
		if (_closeTimestamp <= block.timestamp) revert InvalidParams();

		owner = _owner;
		launchRouter = _launchRouter;
		presaleTokens = _presaleTokens;
		presaleCap = _presaleCap;
		bnbForBuy = _bnbForBuy;
		penaltyBps = _penaltyBps;
		vestingEnabled = _vestingEnabled;
		closeTimestamp = _closeTimestamp;
		state = State.OPEN;
	}

	// -------------------------------------------------------------------------
	// Deposit / withdraw (OPEN only)
	// -------------------------------------------------------------------------

	/// @notice Deposit BNB during the OPEN window.
	function deposit() external payable inState(State.OPEN) {
		if (msg.value == 0) revert ZeroAmount();
		if (block.timestamp >= closeTimestamp) revert PresaleClosed();
		if (totalDeposited + msg.value > presaleCap) revert PresaleCapExceeded();

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
		uint256 refundAmount = amount - penalty;

		d.deposited -= amount;
		totalDeposited -= amount;
		bonusPool += penalty;

		Address.sendValue(payable(msg.sender), refundAmount);

		emit Withdrawn(msg.sender, amount, penalty, refundAmount);
	}

	/// @notice Convenience helper: withdraw the full active deposit.
	function withdrawAll() external {
		uint256 amount = depositors[msg.sender].deposited;
		if (amount == 0) revert NoDeposit();
		withdraw(amount);
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	/// @notice Close the deposit window. No further deposits or withdrawals.
	/// @dev    Owner may call at any time. Anyone may call once the
	///         `closeTimestamp` deadline has passed (auto-close).
	function close() external inState(State.OPEN) {
		if (msg.sender != owner && block.timestamp < closeTimestamp) {
			revert NotAuthorizedToClose();
		}
		state = State.CLOSED;
		emit Closed(msg.sender, totalDeposited, bonusPool);
	}

	/// @notice Execute the launch bundle and enter LAUNCHED only after the router succeeds.
	/// @param _token The launched ERC-20 token address.
	/// @param minTokensFromV2 Slippage guard for the V2 buy leg.
	/// @param deadline Router deadline for curve/V2 execution.
	function launch(
		address _token,
		uint256 minTokensFromV2,
		uint256 deadline
	) external onlyOwner nonReentrant inState(State.CLOSED) {
		if (_token == address(0)) revert InvalidParams();
		if (refundsEnabled || totalDeposited < presaleCap) revert UnderSubscribed();

		uint256 totalBnb = totalDeposited + bonusPool;
		uint256 baseCurveBnb = presaleCap - bnbForBuy;
		uint256 curveFillBnb = bnbForBuy == 0 ? totalBnb : (totalBnb < baseCurveBnb ? totalBnb : baseCurveBnb);
		uint256 v2BuyBnb = totalBnb - curveFillBnb;

		// Factory-created AgentTokenV3 launches pre-fund the vault with both
		// presale inventory and LP inventory. Keep the presale inventory here for
		// claims and hand only the extra inventory to the router.
		if (IERC20(_token).balanceOf(address(this)) >= presaleTokens * 2) {
			IERC20(_token).transfer(launchRouter, presaleTokens);
		}

		IBundleRouter(launchRouter).execute{value: totalBnb}(
			IBundleRouter.BundleParams({
				flapToken: _token,
				curveFillBnb: curveFillBnb,
				v2BuyBnb: v2BuyBnb,
				minTokensFromV2: minTokensFromV2,
				deadline: deadline
			})
		);

		state = State.LAUNCHED;
		token = _token;
		launchTimestamp = block.timestamp;
		totalDepositedAtLaunch = totalDeposited;

		emit Launched(_token, totalBnb, launchTimestamp);
	}

	/// @notice Enable the failed-launch refund path after an under-subscribed close.
	function enableRefunds() public inState(State.CLOSED) {
		if (totalDeposited >= presaleCap) revert InvalidState();
		if (!refundsEnabled) {
			refundsEnabled = true;
			emit RefundsEnabled();
		}
	}

	/// @notice Refund active depositors after the owner marks a closed launch failed.
	function refund() external nonReentrant inState(State.CLOSED) {
		if (!refundsEnabled) enableRefunds();
		Depositor storage d = depositors[msg.sender];
		uint256 amount = d.deposited;
		if (amount == 0) revert NoDeposit();

		uint256 bonusShare = (amount == totalDeposited) ? bonusPool : (bonusPool * amount) / totalDeposited;
		uint256 refundAmount = amount + bonusShare;

		d.deposited = 0;
		totalDeposited -= amount;
		bonusPool -= bonusShare;
		Address.sendValue(payable(msg.sender), refundAmount);

		emit Refunded(msg.sender, amount, bonusShare, refundAmount, totalDeposited);
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

	function _vestedPct(uint256 nowTs) internal view returns (uint256) {
		if (state != State.LAUNCHED) return 0;
		if (!vestingEnabled) return BPS_DENOM; // 100% at TGE
		uint256 elapsed = nowTs - launchTimestamp;
		if (elapsed >= VESTING_WINDOW) return BPS_DENOM;
		return VESTING_TGE_BPS + (elapsed * VESTING_LINEAR_BPS) / VESTING_WINDOW;
	}

	function _vestedFromAlloc(uint256 totalAlloc, uint256 nowTs) internal view returns (uint256) {
		if (totalAlloc == 0) return 0;
		uint256 pct = _vestedPct(nowTs);
		if (pct == 0) return 0;
		return (totalAlloc * pct) / BPS_DENOM;
	}

	// Reject stray BNB so users can't accidentally bypass deposit().
	// All BNB must enter via deposit() during OPEN.
	receive() external payable {
		revert InvalidState();
	}
}
