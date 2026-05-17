// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title TaxSplitter
/// @notice Immutable 3-way splitter for native BNB and arbitrary ERC20 tokens.
/// @dev Routes the FLAP marketing-bps stream from a launch to platform / patron / agent.
///      No owner, no upgradeability, no pausing. Idempotent; zero-balance calls are no-ops.
contract TaxSplitter {
	using SafeERC20 for IERC20;

	// ------------------------------------------------------------------
	// Constants
	// ------------------------------------------------------------------

	uint16 public constant BPS_DENOM = 10000;
	uint16 public constant MIN_PLATFORM_CUT = 1000; // 10%
	uint16 public constant MAX_PLATFORM_CUT = 5000; // 50%

	// ------------------------------------------------------------------
	// Immutable state
	// ------------------------------------------------------------------

	address public immutable platform;
	address public immutable patron;
	address public immutable agent;

	uint16 public immutable platformBps;
	uint16 public immutable patronBps;
	uint16 public immutable agentBps;

	// ------------------------------------------------------------------
	// Errors
	// ------------------------------------------------------------------

	error ZeroAddress();
	error InvalidBps();
	error NativeTransferFailed();

	// ------------------------------------------------------------------
	// Events
	// ------------------------------------------------------------------

	/// @dev token == address(0) for native BNB splits.
	event Split(address indexed token, uint256 platformAmt, uint256 patronAmt, uint256 agentAmt);

	// ------------------------------------------------------------------
	// Constructor
	// ------------------------------------------------------------------

	constructor(
		address _platform,
		address _patron,
		address _agent,
		uint16 _platformBps,
		uint16 _patronBps
	) {
		if (_platform == address(0) || _patron == address(0) || _agent == address(0)) {
			revert ZeroAddress();
		}
		if (_platformBps < MIN_PLATFORM_CUT || _platformBps > MAX_PLATFORM_CUT) {
			revert InvalidBps();
		}
		// patronBps has no explicit floor; it must just fit so agent gets a non-negative remainder.
		uint256 used = uint256(_platformBps) + uint256(_patronBps);
		if (used > BPS_DENOM) {
			revert InvalidBps();
		}

		platform = _platform;
		patron = _patron;
		agent = _agent;

		platformBps = _platformBps;
		patronBps = _patronBps;
		agentBps = uint16(BPS_DENOM - used);
	}

	// ------------------------------------------------------------------
	// Native (BNB)
	// ------------------------------------------------------------------

	/// @notice Accepts native BNB. No auto-split to avoid surprise gas on plain transfers.
	receive() external payable {}

	/// @notice Splits the contract's current native BNB balance per BPS.
	/// @dev Idempotent. No-op (no event) when balance is zero. Agent gets the remainder so
	///      no wei is ever stranded due to integer rounding.
	function split() external {
		uint256 bal = address(this).balance;
		if (bal == 0) {
			return;
		}

		uint256 platformAmt = (bal * platformBps) / BPS_DENOM;
		uint256 patronAmt = (bal * patronBps) / BPS_DENOM;
		uint256 agentAmt = bal - platformAmt - patronAmt;

		if (platformAmt > 0) _sendNative(platform, platformAmt);
		if (patronAmt > 0) _sendNative(patron, patronAmt);
		if (agentAmt > 0) _sendNative(agent, agentAmt);

		emit Split(address(0), platformAmt, patronAmt, agentAmt);
	}

	// ------------------------------------------------------------------
	// ERC20
	// ------------------------------------------------------------------

	/// @notice Splits the contract's current balance of `token` per BPS.
	/// @dev Idempotent. No-op (no event) when balance is zero. Works with fee-on-transfer
	///      tokens; residuals stay in the contract and can be swept by another call.
	function splitToken(address token) public {
		uint256 bal = IERC20(token).balanceOf(address(this));
		if (bal == 0) {
			return;
		}

		uint256 platformAmt = (bal * platformBps) / BPS_DENOM;
		uint256 patronAmt = (bal * patronBps) / BPS_DENOM;
		uint256 agentAmt = bal - platformAmt - patronAmt;

		if (platformAmt > 0) IERC20(token).safeTransfer(platform, platformAmt);
		if (patronAmt > 0) IERC20(token).safeTransfer(patron, patronAmt);
		if (agentAmt > 0) IERC20(token).safeTransfer(agent, agentAmt);

		emit Split(token, platformAmt, patronAmt, agentAmt);
	}

	/// @notice Convenience: split many ERC20 tokens in one tx.
	function splitMany(address[] calldata tokens) external {
		uint256 n = tokens.length;
		for (uint256 i = 0; i < n; ++i) {
			splitToken(tokens[i]);
		}
	}

	// ------------------------------------------------------------------
	// Internal
	// ------------------------------------------------------------------

	function _sendNative(address to, uint256 amount) internal {
		(bool ok, ) = payable(to).call{value: amount}("");
		if (!ok) revert NativeTransferFailed();
	}
}
