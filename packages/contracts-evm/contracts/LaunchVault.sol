// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LaunchVault
/// @notice wave H presale vault. one vault per launch. depositors put BNB
///         in during OPEN. on close + cap-met, the per-launch BundleRouter
///         pulls BNB, runs the atomic flap bundle, and calls distribute()
///         to set the token + presaler share. depositors then claim with
///         optional vesting. under-subscribed / failed launches go to REFUND.
///
/// @dev PHASE 1 SCAFFOLD: storage + signatures + events + custom errors
///      are final; function bodies revert `WaveH:phase2`. phase 2 fills
///      in deposit/withdraw/lifecycle/claim math. see
///      `WAVE_H_FLAP_NATIVE_SPEC.md` / `WAVE_H_INTERFACES.md`.
contract LaunchVault {
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

	function deposit() external payable {
		revert("WaveH:phase2");
	}

	function withdraw(uint256 /* amount */) external {
		revert("WaveH:phase2");
	}

	function withdrawAll() external {
		revert("WaveH:phase2");
	}

	// ---------------------------------------------------------------------
	// lifecycle
	// ---------------------------------------------------------------------

	function close() external {
		revert("WaveH:phase2");
	}

	function requestLaunch() external view returns (bool /* ready */) {
		revert("WaveH:phase2");
	}

	/// @notice called by the BundleRouter inside executeBundle to pull the
	///         vault's BNB. transitions OPEN/CLOSED -> LAUNCHED.
	function pullBnbForLaunch(uint256 /* amount */) external {
		revert("WaveH:phase2");
	}

	/// @notice called by the BundleRouter after the bundle succeeds, with the
	///         token address + the presaler share of token Y.
	function distribute(address /* _token */, uint256 /* _presalerShare */) external {
		revert("WaveH:phase2");
	}

	// ---------------------------------------------------------------------
	// refund paths
	// ---------------------------------------------------------------------

	function enableRefundUnderSubscribed() external {
		revert("WaveH:phase2");
	}

	function enableRefundBundleFailed() external {
		revert("WaveH:phase2");
	}

	function adminEnableRefund(string calldata /* reason */) external {
		revert("WaveH:phase2");
	}

	function refund() external {
		revert("WaveH:phase2");
	}

	// ---------------------------------------------------------------------
	// claim
	// ---------------------------------------------------------------------

	function claim() external {
		revert("WaveH:phase2");
	}

	// ---------------------------------------------------------------------
	// views
	// ---------------------------------------------------------------------

	function allocationOf(address /* user */) external view returns (uint256) {
		revert("WaveH:phase2");
	}

	function vestedOf(address /* user */) external view returns (uint256) {
		revert("WaveH:phase2");
	}

	function claimableOf(address /* user */) external view returns (uint256) {
		revert("WaveH:phase2");
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
