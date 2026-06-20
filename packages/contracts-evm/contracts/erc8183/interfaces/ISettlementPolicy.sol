// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgenticCommerce} from "./IAgenticCommerce.sol";

/// @title ISettlementPolicy
/// @notice A settlement policy decides whether a job is eligible to settle.
/// @dev    The router calls canSettle() and only releases escrow when it returns true.
///         Policies are pure decision functions; they hold no escrow and move no value.
interface ISettlementPolicy {
	/// @notice Returns true if `job` may be settled to its provider right now.
	/// @param job The full job record as read from AgenticCommerce.
	function canSettle(IAgenticCommerce.Job calldata job) external view returns (bool);
}
