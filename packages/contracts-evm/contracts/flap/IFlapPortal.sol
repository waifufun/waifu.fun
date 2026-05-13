// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FlapTypes} from "./FlapTypes.sol";

/// @title IFlapPortal
/// @notice Flap Portal V6 entry point. wave H bundle router calls this
///         exactly once per launch to atomically mint a TOKEN_TAXED_V3,
///         fill the curve at the dex-thresh, and migrate to PancakeSwap V2.
interface IFlapPortal {
	/// @notice Unified entry point for all token versions.
	/// @param params Token + curve config; quoteAmt BNB must be sent as value.
	/// @return token Deployed token address.
	function newTokenV6(FlapTypes.NewTokenV6Params calldata params)
		external
		payable
		returns (address token);
}
