// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract PresaleVault is ReentrancyGuard {
	using SafeERC20 for IERC20;

	uint256 public constant BPS = 10_000;
	uint256 public constant MIN_DEPOSIT = 0.001 ether;
	uint256 public constant MIN_REFUND_TIMEOUT = 7 days;
	uint256 public constant MAX_REFUND_TIMEOUT = 90 days;
	uint256 public constant MIN_PRESALE_DURATION = 1 hours;
	uint256 public constant MAX_PRESALE_DURATION = 30 days;

	enum State {
		OPEN,
		LOCKED,
		GRADUATED,
		REFUNDING,
		FINALIZED
	}

	string public agentName;
	uint64 public immutable presaleOpenTimestamp;
	uint64 public immutable presaleCloseTimestamp;
	uint64 public immutable refundTimeout;
	uint128 public immutable perWalletCap;
	uint128 public immutable minRaise;
	uint128 public immutable maxRaise;
	uint128 public immutable expectedTokenAllocation;
	address public immutable graduator;
	address public immutable factory;

	State public state;
	uint128 public totalDeposits;
	uint128 public tokenAllocation;
	address public tokenAddress;
	uint128 public claimedTokens;
	uint128 public claimedDeposits;
	mapping(address => uint128) public deposits;
	mapping(address => bool) public claimed;

	event VaultDeployed(
		address indexed factory,
		address indexed graduator,
		string agentName,
		uint64 presaleOpenTimestamp,
		uint64 presaleCloseTimestamp,
		uint64 refundTimeout,
		uint128 perWalletCap,
		uint128 minRaise,
		uint128 maxRaise,
		uint256 expectedTokenAllocation
	);
	event Deposited(address indexed depositor, uint256 amount, uint256 newDepositorTotal, uint256 newGrandTotal);
	event Withdrew(address indexed depositor, uint256 amount, uint256 newDepositorTotal, uint256 newGrandTotal);
	event PresaleClosed(uint256 totalDeposits);
	event Graduated(address indexed tokenAddress, uint256 tokenAllocation, uint256 totalDeposits);
	event RaisedFundsReleased(address indexed recipient, uint256 amount);
	event Claimed(address indexed depositor, uint256 depositAmount, uint256 tokensReceived);
	event Refunded(address indexed depositor, uint256 amount);
	event RefundingActivated(uint256 timestamp, uint256 outstandingDeposits);
	event LaunchCancelled(string reason);
	event StateTransition(uint8 indexed oldState, uint8 indexed newState);

	error InvalidState();
	error InvalidTimestamp();
	error InvalidConfig();
	error ZeroAddress();
	error InsufficientDeposit();
	error WalletCapExceeded();
	error MaxRaiseExceeded();
	error InvalidAmount();
	error ResidualDepositTooSmall();
	error TransferFailed();
	error Unauthorized();
	error InvalidToken();
	error InvalidTokenAllocation();
	error MinRaiseNotMet();
	error MinRaiseMet();
	error NoDeposits();
	error NotGraduated();
	error AlreadyClaimed();
	error NoDeposit();
	error RefundNotAvailable();
	error ZeroOwed();
	error DirectBnbRejected();
	
	constructor(
		string memory _agentName,
		uint64 _presaleOpenTimestamp,
		uint64 _presaleCloseTimestamp,
		uint64 _refundTimeout,
		uint128 _perWalletCap,
		uint128 _minRaise,
		uint128 _maxRaise,
		uint128 _expectedTokenAllocation,
		address _graduator,
		address _factory
	) {
		if (_presaleCloseTimestamp <= _presaleOpenTimestamp) revert InvalidTimestamp();
		uint256 duration = uint256(_presaleCloseTimestamp) - uint256(_presaleOpenTimestamp);
		if (duration < MIN_PRESALE_DURATION || duration > MAX_PRESALE_DURATION) revert InvalidTimestamp();
		if (_refundTimeout < _presaleCloseTimestamp + MIN_REFUND_TIMEOUT) revert InvalidTimestamp();
		if (_refundTimeout > _presaleCloseTimestamp + MAX_REFUND_TIMEOUT) revert InvalidTimestamp();
		if (_graduator == address(0)) revert ZeroAddress();
		if (_expectedTokenAllocation == 0) revert InvalidConfig();
		if (_maxRaise != 0 && (_maxRaise < _minRaise || _maxRaise < MIN_DEPOSIT)) revert InvalidConfig();
		if (_perWalletCap != 0 && _perWalletCap < MIN_DEPOSIT) revert InvalidConfig();

		agentName = _agentName;
		presaleOpenTimestamp = _presaleOpenTimestamp;
		presaleCloseTimestamp = _presaleCloseTimestamp;
		refundTimeout = _refundTimeout;
		perWalletCap = _perWalletCap;
		minRaise = _minRaise;
		maxRaise = _maxRaise;
		expectedTokenAllocation = _expectedTokenAllocation;
		graduator = _graduator;
		factory = _factory;
		state = State.OPEN;

		emit VaultDeployed(
			_factory,
			_graduator,
			_agentName,
			_presaleOpenTimestamp,
			_presaleCloseTimestamp,
			_refundTimeout,
			_perWalletCap,
			_minRaise,
			_maxRaise,
			_expectedTokenAllocation
		);
	}

	function deposit() external payable nonReentrant {
		if (state != State.OPEN) revert InvalidState();
		if (block.timestamp < presaleOpenTimestamp || block.timestamp >= presaleCloseTimestamp) revert InvalidTimestamp();
		if (msg.sender == address(this)) revert InvalidConfig();
		if (msg.value < MIN_DEPOSIT) revert InsufficientDeposit();
		if (msg.value > type(uint128).max) revert InvalidAmount();

		uint256 newDepositorTotal = uint256(deposits[msg.sender]) + msg.value;
		uint256 newGrandTotal = uint256(totalDeposits) + msg.value;
		if (newDepositorTotal > type(uint128).max || newGrandTotal > type(uint128).max) revert InvalidAmount();
		if (perWalletCap != 0 && newDepositorTotal > perWalletCap) revert WalletCapExceeded();
		if (maxRaise != 0 && newGrandTotal > maxRaise) revert MaxRaiseExceeded();

		deposits[msg.sender] = uint128(newDepositorTotal);
		totalDeposits = uint128(newGrandTotal);
		emit Deposited(msg.sender, msg.value, newDepositorTotal, newGrandTotal);

		if (maxRaise != 0 && newGrandTotal == maxRaise) {
			_setState(State.LOCKED);
			emit PresaleClosed(newGrandTotal);
		}
	}

	function withdraw(uint256 amount) external nonReentrant {
		if (state != State.OPEN) revert InvalidState();
		if (block.timestamp >= presaleCloseTimestamp) revert InvalidTimestamp();
		if (amount == 0) revert InvalidAmount();
		uint128 deposited = deposits[msg.sender];
		if (amount > deposited) revert InvalidAmount();
		uint256 remaining = uint256(deposited) - amount;
		if (remaining != 0 && remaining < MIN_DEPOSIT) revert ResidualDepositTooSmall();

		deposits[msg.sender] = uint128(remaining);
		totalDeposits -= uint128(amount);
		emit Withdrew(msg.sender, amount, remaining, totalDeposits);
		(bool ok,) = payable(msg.sender).call{value: amount}("");
		if (!ok) revert TransferFailed();
	}

	function closePresale() external nonReentrant {
		if (state != State.OPEN) revert InvalidState();
		if (block.timestamp < presaleCloseTimestamp && (maxRaise == 0 || totalDeposits < maxRaise)) revert InvalidTimestamp();
		_setState(State.LOCKED);
		emit PresaleClosed(totalDeposits);
	}

	function graduate(address _tokenAddress, uint256 _tokenAllocation) external nonReentrant {
		if (msg.sender != graduator) revert Unauthorized();
		if (state != State.LOCKED) revert InvalidState();
		if (totalDeposits == 0) revert NoDeposits();
		if (minRaise != 0 && totalDeposits < minRaise) revert MinRaiseNotMet();
		if (_tokenAddress == address(0) || _tokenAddress.code.length == 0) revert InvalidToken();
		if (_tokenAllocation != expectedTokenAllocation) revert InvalidTokenAllocation();
		if (_tokenAllocation > type(uint128).max) revert InvalidTokenAllocation();
		if (IERC20(_tokenAddress).balanceOf(address(this)) < _tokenAllocation) revert InvalidTokenAllocation();

		tokenAddress = _tokenAddress;
		tokenAllocation = uint128(_tokenAllocation);
		_setState(State.GRADUATED);
		uint256 raisedAmount = totalDeposits;
		Address.sendValue(payable(graduator), raisedAmount);
		emit RaisedFundsReleased(graduator, raisedAmount);
		emit Graduated(_tokenAddress, _tokenAllocation, totalDeposits);
	}

	function claim() external nonReentrant {
		if (state != State.GRADUATED) {
			if (claimed[msg.sender]) revert AlreadyClaimed();
			revert NotGraduated();
		}
		uint128 share = deposits[msg.sender];
		if (claimed[msg.sender]) revert AlreadyClaimed();
		if (share == 0) revert NoDeposit();

		uint256 owed = (uint256(share) * uint256(tokenAllocation)) / uint256(totalDeposits);
		if (owed == 0) revert ZeroOwed();
		claimed[msg.sender] = true;
		claimedTokens += uint128(owed);
		claimedDeposits += share;
		deposits[msg.sender] = 0;
		emit Claimed(msg.sender, share, owed);
		IERC20(tokenAddress).safeTransfer(msg.sender, owed);

		if (claimedDeposits == totalDeposits) {
			_setState(State.FINALIZED);
		}
	}

	function refund() external nonReentrant {
		if (state == State.GRADUATED) revert InvalidState();
		if (state == State.FINALIZED && claimed[msg.sender]) revert AlreadyClaimed();
		if (!refundAvailable()) revert RefundNotAvailable();
		uint128 amount = deposits[msg.sender];
		if (claimed[msg.sender]) revert AlreadyClaimed();
		if (amount == 0) revert NoDeposit();

		if (state == State.OPEN || state == State.LOCKED) {
			_setState(State.REFUNDING);
			emit RefundingActivated(block.timestamp, totalDeposits);
		}

		deposits[msg.sender] = 0;
		claimed[msg.sender] = true;
		totalDeposits -= amount;
		emit Refunded(msg.sender, amount);
		(bool ok,) = payable(msg.sender).call{value: amount}("");
		if (!ok) revert TransferFailed();

		if (totalDeposits == 0) {
			_setState(State.FINALIZED);
		}
	}

	function cancelLaunch() external nonReentrant {
		if (state != State.LOCKED) revert InvalidState();
		if (minRaise == 0 || totalDeposits >= minRaise) revert MinRaiseMet();
		_setState(State.REFUNDING);
		emit LaunchCancelled("min raise not met");
		emit RefundingActivated(block.timestamp, totalDeposits);
	}

	function getDepositorShare(address depositor) external view returns (uint256 depositAmount, uint256 projectedTokens) {
		depositAmount = deposits[depositor];
		if (depositAmount == 0 || totalDeposits == 0) return (depositAmount, 0);
		uint256 allocation = state == State.GRADUATED || state == State.FINALIZED ? tokenAllocation : expectedTokenAllocation;
		projectedTokens = (depositAmount * allocation) / totalDeposits;
	}

	function presaleOpen() external view returns (bool) {
		return state == State.OPEN && block.timestamp >= presaleOpenTimestamp && block.timestamp < presaleCloseTimestamp;
	}

	function presaleClosed() external view returns (bool) {
		return state == State.LOCKED || state == State.GRADUATED || state == State.REFUNDING || state == State.FINALIZED;
	}

	function graduated() external view returns (bool) {
		return state == State.GRADUATED || state == State.FINALIZED;
	}

	function refundAvailable() public view returns (bool) {
		if (state == State.REFUNDING) return true;
		if (state == State.OPEN || state == State.LOCKED) return block.timestamp >= refundTimeout;
		return false;
	}

	function timeUntilClose() external view returns (uint256) {
		return block.timestamp >= presaleCloseTimestamp ? 0 : presaleCloseTimestamp - block.timestamp;
	}

	function timeUntilRefund() external view returns (uint256) {
		return block.timestamp >= refundTimeout ? 0 : refundTimeout - block.timestamp;
	}

	function getConfig()
		external
		view
		returns (
			string memory name,
			uint64 openTimestamp,
			uint64 closeTimestamp,
			uint64 refundTimeoutTimestamp,
			uint128 walletCap,
			uint128 minimumRaise,
			uint128 maximumRaise,
			uint128 expectedAllocation,
			address vaultGraduator,
			address vaultFactory
		)
	{
		return (
			agentName,
			presaleOpenTimestamp,
			presaleCloseTimestamp,
			refundTimeout,
			perWalletCap,
			minRaise,
			maxRaise,
			expectedTokenAllocation,
			graduator,
			factory
		);
	}

	receive() external payable {
		revert DirectBnbRejected();
	}

	fallback() external payable {
		revert DirectBnbRejected();
	}

	function _setState(State newState) private {
		if (uint8(newState) <= uint8(state)) revert InvalidState();
		State oldState = state;
		state = newState;
		emit StateTransition(uint8(oldState), uint8(newState));
	}
}
