// SPDX-License-Identifier: MIT
//
//   ╭┈┈┈ waifu.fun ┈┈┈╮
//   │   LaunchVault    │
//   │   the presale    │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯
//
//      ✿  bnb in. shares out.  ✿
//         refund if it doesn't pop.
//
pragma solidity ^0.8.24;

// slither-disable-start incorrect-equality,reentrancy-balance,reentrancy-events,timestamp,low-level-calls,missing-inheritance,naming-convention

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ILaunchVaultRouterCallbacks} from "./interfaces/ILaunchVaultRouterCallbacks.sol";
import {IVaultRouterSetter} from "./interfaces/IVaultRouterSetter.sol";

interface ILaunchFactoryOwner {
    function owner() external view returns (address);
}

/// @title LaunchVault
/// @notice presale vault. one vault per launch. depositors put BNB
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
/// #invariant totalDeposited <= presaleCap;
/// #invariant totalDepositedAtLaunch <= presaleCap;
/// #invariant !distributed || state == State.LAUNCHED;
contract LaunchVault is ReentrancyGuard, IVaultRouterSetter, ILaunchVaultRouterCallbacks {
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
    uint256 public constant BUNDLE_GRACE_PERIOD = 86_400; // 24h after close
    uint256 public constant ADMIN_REFUND_DELAY = 86_400; // 24h public notice before owner emergency refund
    uint256 internal constant MAX_WALLET_DEPOSIT_BPS = 6_000; // 60% max allocation per wallet
    uint256 internal constant MIN_OPEN_DURATION = 900; // 15m before cap-hit early close

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
    uint256 private immutable _openTimestamp;

    // ---------------------------------------------------------------------
    // storage
    // ---------------------------------------------------------------------

    /// @dev set once post-construction by the factory in the same createLaunch tx.
    ///      vault and router reference each other (chicken-and-egg), so the
    ///      factory deploys the vault first, then the router, then wires them
    ///      together with this one-shot setter.
    address payable public router;

    State public state;
    address public token; // set in distribute()
    uint256 public totalDeposited;
    uint256 public totalDepositedAtLaunch; // snapshot
    uint256 public presalerTokenBalance; // 40% of Y, set in distribute()
    uint256 public bonusPool;
    uint256 public launchTimestamp;
    uint256 public depositorCount;
    uint256 public adminRefundReadyAt;
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
    event AdminRefundScheduled(address indexed by, uint256 readyAt, string reason);
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
    error AdminRefundNotScheduled();
    error AdminRefundDelayNotElapsed();
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
        _openTimestamp = block.timestamp;
        closeTimestamp = _closeTimestamp;
        penaltyBps = _penaltyBps;
        vestingEnabled = _vestingEnabled;
        state = State.OPEN;
    }

    // ---------------------------------------------------------------------
    // wiring (factory one-shot)
    // ---------------------------------------------------------------------

    /// @notice set the per-launch BundleRouter. callable once by the factory
    ///         during createLaunch.
    function setRouter(address newRouter) external {
        if (msg.sender != factory) revert NotFactory();
        if (router != address(0)) revert RouterAlreadySet();
        if (newRouter == address(0)) revert ZeroAddress();
        router = payable(newRouter);
        emit RouterSet(newRouter);
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
        uint256 newUserDeposit = d.deposited + msg.value;
        if (newUserDeposit > (presaleCap * MAX_WALLET_DEPOSIT_BPS) / BPS_DENOM) revert CapExceeded();
        if (!d.seen) {
            d.seen = true;
            depositorCount += 1;
        }
        d.deposited = newUserDeposit;
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
        if (penalty > 0) bonusPool += penalty;
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
        if (penalty > 0) bonusPool += penalty;
        (bool ok,) = payable(msg.sender).call{value: refundAmount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount, penalty, refundAmount);
    }

    // ---------------------------------------------------------------------
    // lifecycle
    // ---------------------------------------------------------------------

    function close() external {
        if (state != State.OPEN) revert InvalidState();
        if (block.timestamp < closeTimestamp) {
            if (totalDeposited < presaleCap) revert WindowClosed();
            if (block.timestamp < _openTimestamp + MIN_OPEN_DURATION) revert WindowClosed();
        }
        state = State.CLOSED;
        totalDepositedAtLaunch = totalDeposited;
        emit Closed(msg.sender, totalDeposited, bonusPool);
    }

    function requestLaunch() external view returns (bool ready) {
        return state == State.CLOSED && totalDeposited >= presaleCap;
    }

    /// @notice called by the BundleRouter inside executeBundle to pull the
    ///         vault's BNB. transitions CLOSED -> LAUNCHED.
    function pullBnbForLaunch(uint256 amount) external {
        if (msg.sender != router) revert NotRouter();
        if (state != State.CLOSED) revert InvalidState();
        if (totalDeposited < presaleCap) revert UnderSubscribed();
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
    function distribute(address newToken, uint256 presalerShare) external {
        if (msg.sender != router) revert NotRouter();
        if (state != State.LAUNCHED) revert InvalidState();
        if (distributed) revert AlreadyDistributed();
        if (newToken == address(0)) revert ZeroAddress();
        if (presalerShare == 0) revert ZeroAmount();
        if (IERC20(newToken).balanceOf(address(this)) < presalerShare) revert TokenBalanceTooLow();
        token = newToken;
        presalerTokenBalance = presalerShare;
        distributed = true;
        emit Distributed(newToken, presalerShare);
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
        if (block.timestamp < closeTimestamp + BUNDLE_GRACE_PERIOD) revert WindowClosed();
        state = State.REFUND;
        emit RefundEnabled(msg.sender, "bundle-failed");
    }

    function enableRefundLaunchExpired() external {
        if (state != State.CLOSED) revert InvalidState();
        if (block.timestamp < closeTimestamp + BUNDLE_GRACE_PERIOD) revert WindowClosed();
        state = State.REFUND;
        emit RefundEnabled(msg.sender, "launch-expired");
    }

    /// @notice schedule a factory-owner emergency refund. This is deliberately
    ///         delayed so the global owner cannot instantly flip live vaults
    ///         into REFUND without an observable on-chain warning period.
    function scheduleAdminRefund(string calldata reason) external {
        address factoryOwner = ILaunchFactoryOwner(factory).owner();
        if (msg.sender != factoryOwner) revert NotFactoryOwner();
        if (state == State.LAUNCHED) revert InvalidState();
        uint256 readyAt = block.timestamp + ADMIN_REFUND_DELAY;
        adminRefundReadyAt = readyAt;
        emit AdminRefundScheduled(msg.sender, readyAt, reason);
    }

    function adminEnableRefund(string calldata reason) external {
        address factoryOwner = ILaunchFactoryOwner(factory).owner();
        if (msg.sender != factoryOwner) revert NotFactoryOwner();
        if (state == State.LAUNCHED) revert InvalidState();
        uint256 readyAt = adminRefundReadyAt;
        if (readyAt == 0) revert AdminRefundNotScheduled();
        if (block.timestamp < readyAt) revert AdminRefundDelayNotElapsed();
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
        uint256 bonus = (principal == totalDeposited) ? bonusPool : (bonusPool * principal) / totalDeposited;
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

// slither-disable-end incorrect-equality,reentrancy-balance,reentrancy-events,timestamp,low-level-calls,missing-inheritance,naming-convention
