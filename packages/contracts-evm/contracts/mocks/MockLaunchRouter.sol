// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal BNB sink used by LaunchVault tests. Records every
///         execute payment so suites can assert on the BNB that arrived from launch().
contract MockLaunchRouter {
	struct BundleParams {
		address flapToken;
		uint256 curveFillBnb;
		uint256 v2BuyBnb;
		uint256 minTokensFromV2;
		uint256 deadline;
	}

	uint256 public received;
	bool public rejectIncoming;
	BundleParams public lastParams;

	event Received(address indexed from, uint256 amount);

	function setRejectIncoming(bool v) external {
		rejectIncoming = v;
	}

	function execute(BundleParams calldata params) external payable {
		require(!rejectIncoming, "rejected");
		received += msg.value;
		lastParams = params;
		emit Received(msg.sender, msg.value);
	}

	receive() external payable {
		revert("use execute");
	}
}
