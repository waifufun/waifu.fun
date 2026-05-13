// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

interface ILaunchFactoryOwner {
	function owner() external view returns (address);
}

/// @title LaunchVault
/// @notice wave H presale vault. one vault per launch. depositors put BNB
///         in during OPEN. on close + cap-met, the per-launch BundleRouter
///         pulls BNB, runs the atomic flap bundle, and calls distribute()
///         to set the token + presaler share. depositors then claim with
///         optional 50/50/24h vesting. under-subscribed / bundle-failed /
///         admin-stopped launches go to REFUND.
///
/// @dev    state machine:
///           OPEN -> CLOSED -> LAUNCHED   (happy path)
///           OPEN -> CLOSED -> REFUND     (failure path; cannot exit REFUND)
///         atomic-or-bust: pullBnbForLaunch + distribute happen inside a
///         single executeBundle tx. any revert rolls everything back via
///         EVM atomicity, leaving the vault in CLOSED with full BNB intact.
contract LaunchVault is ReentrancyGuard {
	using SafeERC20 for IERC20;

	enum State {
		OPEN,
		CLOSED,
		LAUNCHED,
		REFUND
	}

	// ---------------------------------------------------------------------
	// constants
	// ---------------------------------------------------------------------

	uint256 public constant BPS_DENOM = 10_000;
	uint256 public constant MAX_PENALTY_BPS = 1_000; // 10%
	uint256 public constant VESTING_WINDOW = 86_400; // 24h
	uint256 public constant VESTING_TGE_BPS = 5_000;
	uint256 public constant VESTING_LINEAR_BPS = 5_000;

	// ---------------------------------------------------------------------
	// immutables
	// ---------------------------------------------------------------------

	address public immutable factory; // LaunchFactory
	address public immutable creator; // SIWE launcher
	address public immutable bundleBot; // authorized executor
	uint256 public immutable presaleCap; // BNB cap (== totalBnb to spend)
	uint256 public immutable quoteAmt; // BNB sent to Portal.newTokenV6 (always 16 BNB)
	uint256 public immutable v2BuyBnb; // BNB for V2 follow-up (tier-dependent)
	uint256 public immutable closeTimestamp;
	uint256 public immutable penaltyBps; // capped at MAX_PENALTY_BPS
	bool public immutable vestingEnabled;

	// ---------------------------------------------------------------------
	// storage
	// ---------------------------------------------------------------------

	/// @dev set once post-construction by the factory in the same createLaunch tx.
	///      see `WAVE_H_INTERFACES.md` section 10 for the chicken-and-egg note.
	address payable public router;

	State public state;
	address public token; // set in distribute()
	uint256 public totalDeposited;
	uint256 public totalDepositedAtLaunch; // snapshot
	uint256 public presalerTokenBalance; // 40% of Y, set in distribute()
	uint256 public bonusPool;
	uint256 public launchTimestamp;
	uint256 public depositorCount;
	bool public distributed; // one-shot guard

	struct Depositor {
		uint256 deposited;
		uint256 claimed;
		bool seen;
	}

	mapping(address => Depositor) public depositors;

	// ---------------------------------------------------------------------
	// events
	// ---------------------------------------------------------------------

	event RouterSet(address indexed router);
	event Deposited(address indexed user, uint256 amount, uint256 newTotal);
	event Withdrawn(address indexed user, uint256 amount, uint256 penalty, uint256 refund);
	event Closed(address indexed by, uint256 totalDeposited, uint256 bonusPool);
	event LaunchExecuted(address indexed token, uint256 totalBnb, uint256 timestamp);
	event Distributed(address indexed token, uint256 presalerShare);
	event RefundEnabled(address indexed by, string reason);
	event Refunded(address indexed user, uint256 principal, uint256 bonus, uint256 refundAmount);
	event Claimed(address indexed user, uint256 amount, uint256 totalClaimed);

	// ---------------------------------------------------------------------
	// errors
	// ---------------------------------------------------------------------

	error NotFactory();
	error NotCreator();
	error NotBundleBot();
	error NotRouter();
	error NotAuthorizedToClose();
	error NotFactoryOwner();
	error InvalidState();
	error InvalidParams();
	error ZeroAmount();
	error InsufficientDeposit();
	error NoDeposit();
	error NothingToClaim();
	error WindowClosed();
	error CapExceeded();
	error UnderSubscribed();
	error TokenBalanceTooLow();
	error TransferFailed();
	error AlreadyDistributed();
	error RouterAlreadySet();
	error ZeroAddress();

	// ---------------------------------------------------------------------
	// constructor
	// ---------------------------------------------------------------------

	constructor(
		address _factory,
		address _creator,
		address _bundleBot,
		uint256 _presaleCap,
		uint256 _quoteAmt,
		uint256 _v2BuyBnb,
		uint256 _closeTimestamp,
		uint256 _penaltyBps,
		bool _vestingEnabled
	) {
		if (_factory == address(0) || _creator == address(0) || _bundleBot == address(0)) {
			revert ZeroAddress();
		}
		if (_presaleCap == 0) revert InvalidParams();
		if (_quoteAmt + _v2BuyBnb > _presaleCap) revert InvalidParams();
		if (_penaltyBps > MAX_PENALTY_BPS) revert InvalidParams();
		if (_closeTimestamp <= block.timestamp) revert InvalidParams();

		factory = _factory;
		creator = _creator;
		bundleBot = _bundleBot;
		presaleCap = _presaleCap;
		quoteAmt = _quoteAmt;
		v2BuyBnb = _v2BuyBnb;
		closeTimestamp = _closeTimestamp;
		penaltyBps = _penaltyBps;
		vestingEnabled = _vestingEnabled;
		state = State.OPEN;
	}

	// ---------------------------------------------------------------------
	// wiring (factory one-shot)
	// ---------------------------------------------------------------------

	/// @notice set the per-launch BundleRouter. callable once by the factory
	///         during createLaunch. see `WAVE_H_INTERFACES.md` section 10.
	function setRouter(address _router) external {
		if (msg.sender != factory) revert NotFactory();
		if (router != address(0)) revert RouterAlreadySet();
		if (_router == address(0)) revert ZeroAddress();
		router = payable(_router);
		emit RouterSet(_router);
	}

	// ---------------------------------------------------------------------
	// OPEN-only
	// ---------------------------------------------------------------------

	function deposit() external payable nonReentrant {
		if (state != State.OPEN) revert InvalidState();
		if (block.timestamp > closeTimestamp) revert WindowClosed();
		if (msg.value == 0) revert ZeroAmount();
		uint256 newTotal = totalDeposited + msg.value;
		if (newTotal > presaleCap) revert CapExceeded();
		Depositor storage d = depositors[msg.sender];
		if (!d.seen) { d.seen = true; depositorCount += 1; }
		d.deposited += msg.value;
		totalDeposited = newTotal;
		emit Deposited(msg.sender, msg.value, newTotal);
	}

	function withdraw(uint256 amount) external nonReentrant {
		if (state != State.OPEN) revert InvalidState();
		if (block.timestamp > closeTimestamp) revert WindowClosed();
		Depositor storage d = depositors[msg.sender];
		if (d.deposited == 0) revert NoDeposit();
		if (amount == 0 || amount > d.deposited) revert InvalidParams();
		uint256 penalty = (amount * penaltyBps) / BPS_DENOM;
		uint256 refundAmount = amount - penalty;
		d.deposited -= amount;
		totalDeposited -= amount;
		if (penalty > 0) { bonusPool += penalty; }
		(bool ok,) = payable(msg.sender).call{value: refundAmount}("");
		if (!ok) revert TransferFailed();
		emit Withdrawn(msg.sender, amount, penalty, refundAmount);
	}

	function withdrawAll() external nonReentrant {
		if (state != State.OPEN) revert InvalidState();
		if (block.timestamp > closeTimestamp) revert WindowClosed();
		Depositor storage d = depositors[msg.sender];
		uint256 amount = d.deposited;
		if (amount == 0) revert NoDeposit();
		uint256 penalty = (amount * penaltyBps) / BPS_DENOM;
		uint256 refundAmount = amount - penalty;
		d.deposited = 0;
		totalDeposited -= amount;
		if (penalty > 0) { bonusPool += penalty; }
		(bool ok,) = payable(msg.sender).call{value: refundAmount}("");
		if (!ok) revert TransferFailed();
		emit Withdrawn(msg.sender, amount, penalty, refundAmount);
	}

	// ---------------------------------------------------------------------
	// lifecycle
	// ---------------------------------------------------------------------

	function close() external {
		if (state != State.OPEN) revert InvalidState();
		if (block.timestamp < closeTimestamp && totalDeposited < presaleCap) revert WindowClosed();
		state = State.CLOSED;
		totalDepositedAtLaunch = totalDeposited;
		emit Closed(msg.sender, totalDeposited, bonusPool);
	}

	function requestLaunch() external view returns (bool ready) {
		return state == State.CLOSED && totalDeposited >= presaleCap;
	}

	/// @notice called by the BundleRouter inside executeBundle to pull the
	///         vault's BNB. transitions OPEN/CLOSED -> LAUNCHED.
	function pullBnbForLaunch(uint256 amount) external {
		if (msg.sender != router) revert NotRouter();
		if (state != State.OPEN && state != State.CLOSED) revert InvalidState();
		if (amount > address(this).balance) revert TokenBalanceTooLow();
		state = State.LAUNCHED;
		launchTimestamp = block.timestamp;
		if (totalDepositedAtLaunch == 0) totalDepositedAtLaunch = totalDeposited;
		(bool ok,) = payable(router).call{value: amount}("");
		if (!ok) revert TransferFailed();
		emit LaunchExecuted(address(0), amount, block.timestamp);
	}

	/// @notice called by the BundleRouter after the bundle succeeds, with the
	///         token address + the presaler share of token Y.
	function distribute(address _token, uint256 _presalerShare) external {
		if (msg.sender != router) revert NotRouter();
		if (state != State.LAUNCHED) revert InvalidState();
		if (distributed) revert AlreadyDistributed();
		if (_token == address(0)) revert ZeroAddress();
		if (_presalerShare == 0) revert ZeroAmount();
		token = _token;
		presalerTokenBalance = _presalerShare;
		distributed = true;
		emit Distributed(_token, _presalerShare);
	}

	// ---------------------------------------------------------------------
	// refund paths
	// ---------------------------------------------------------------------

	function enableRefundUnderSubscribed() external {
		if (state != State.OPEN && state != State.CLOSED) revert InvalidState();
		if (block.timestamp < closeTimestamp) revert WindowClosed();
		if (totalDeposited >= presaleCap) revert InvalidState();
		state = State.REFUND;
		emit RefundEnabled(msg.sender, "under-subscribed");
	}

	function enableRefundBundleFailed() external {
		if (msg.sender != bundleBot) revert NotBundleBot();
		if (state != State.CLOSED) revert InvalidState();
		state = State.REFUND;
		emit RefundEnabled(msg.sender, "bundle-failed");
	}

	function adminEnableRefund(string calldata reason) external {
		address factoryOwner = ILaunchFactoryOwner(factory).owner();
		if (msg.sender != factoryOwner) revert NotFactoryOwner();
		if (state == State.LAUNCHED) revert InvalidState();
		state = State.REFUND;
		emit RefundEnabled(msg.sender, reason);
	}

	/// @notice refund the caller's principal + pro-rata bonus share. idempotent
	///         per address: second call from same address reverts NoDeposit().
	///         post-refund the bookkeeping cleans up: depositors[user].deposited = 0,
	///         totalDeposited -= principal, bonusPool -= bonusShare.
	function refund() external nonReentrant {
		if (state != State.REFUND) revert InvalidState();
		Depositor storage d = depositors[msg.sender];
		uint256 principal = d.deposited;
		if (principal == 0) revert NoDeposit();
		uint256 bonus = (principal == totalDeposited)
			? bonusPool
			: (bonusPool * principal) / totalDeposited;
		uint256 refundAmount = principal + bonus;

		// CEI: clear state before sending BNB.
		d.deposited = 0;
		totalDeposited -= principal;
		bonusPool -= bonus;

		(bool ok,) = payable(msg.sender).call{value: refundAmount}("");
		if (!ok) revert TransferFailed();
		emit Refunded(msg.sender, principal, bonus, refundAmount);
	}

	// ---------------------------------------------------------------------
	// claim
	// ---------------------------------------------------------------------

	function claim() external nonReentrant {
		if (state != State.LAUNCHED) revert InvalidState();
		if (!distributed) revert InvalidState();
		Depositor storage d = depositors[msg.sender];
		if (d.deposited == 0) revert NoDeposit();
		uint256 claimable = _claimableOf(msg.sender);
		if (claimable == 0) revert NothingToClaim();
		d.claimed += claimable;
		IERC20(token).safeTransfer(msg.sender, claimable);
		emit Claimed(msg.sender, claimable, d.claimed);
	}

	// ---------------------------------------------------------------------
	// views
	// ---------------------------------------------------------------------

	function allocationOf(address user) external view returns (uint256) {
		return _allocationOfPure(user);
	}

	function vestedOf(address user) external view returns (uint256) {
		return _vestedOf(user);
	}

	function _vestedOf(address user) internal view returns (uint256) {
		uint256 alloc = _allocationOfPure(user);
		if (alloc == 0) return 0;
		if (!vestingEnabled) return alloc;
		uint256 tge = (alloc * VESTING_TGE_BPS) / BPS_DENOM;
		uint256 linear = alloc - tge;
		if (block.timestamp < launchTimestamp) return 0;
		uint256 elapsed = block.timestamp - launchTimestamp;
		if (elapsed >= VESTING_WINDOW) return alloc;
		return tge + (linear * elapsed) / VESTING_WINDOW;
	}

	function claimableOf(address user) external view returns (uint256) {
		return _claimableOf(user);
	}


	function _allocationOfPure(address user) internal view returns (uint256) {
		if (!distributed) return 0;
		uint256 dep = depositors[user].deposited;
		if (dep == 0 || totalDepositedAtLaunch == 0) return 0;
		return (presalerTokenBalance * dep) / totalDepositedAtLaunch;
	}

	function _claimableOf(address user) internal view returns (uint256) {
		uint256 v = _vestedOf(user);
		uint256 c = depositors[user].claimed;
		if (v <= c) return 0;
		return v - c;
	}
	// ---------------------------------------------------------------------
	// raw BNB
	// ---------------------------------------------------------------------

	receive() external payable {
		// vault never accepts unsolicited BNB. all inflows go through deposit().
		// router pulls funds via pullBnbForLaunch -> low-level call to router,
		// so this contract never receives BNB back from the bundle path.
		revert InvalidState();
	}
}
