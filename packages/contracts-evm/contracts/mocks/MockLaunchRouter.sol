// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal BNB sink used by LaunchVault tests. Records every
///         payment so suites can assert on the BNB that arrived from launch().
contract MockLaunchRouter {
	uint256 public received;
	bool public rejectIncoming;

	event Received(address indexed from, uint256 amount);

	function setRejectIncoming(bool v) external {
		rejectIncoming = v;
	}

	receive() external payable {
		require(!rejectIncoming, "rejected");
		received += msg.value;
		emit Received(msg.sender, msg.value);
	}
}
