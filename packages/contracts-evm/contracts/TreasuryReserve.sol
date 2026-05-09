// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Tax-exempt holder for the launch treasury reserve until TreasuryLP4 exists.
contract TreasuryReserve {
	address public immutable owner;

	error Unauthorized();
	error InvalidRecipient();

	constructor(address _owner) {
		if (_owner == address(0)) revert InvalidRecipient();
		owner = _owner;
	}

	function transferToken(address token, address to, uint256 amount) external {
		if (msg.sender != owner) revert Unauthorized();
		if (to == address(0)) revert InvalidRecipient();
		IERC20(token).transfer(to, amount);
	}
}
