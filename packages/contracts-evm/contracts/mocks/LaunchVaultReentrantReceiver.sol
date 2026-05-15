// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ILaunchVaultLike {
	function deposit() external payable;
	function withdraw(uint256 amount) external;
	function refund() external;
}

/// @notice Receiver that tries to reenter LaunchVault payout paths.
contract LaunchVaultReentrantReceiver {
	enum Mode {
		NONE,
		WITHDRAW,
		REFUND
	}

	ILaunchVaultLike public immutable vault;
	Mode public mode;
	uint256 public reentered;

	constructor(address _vault) {
		vault = ILaunchVaultLike(_vault);
	}

	function deposit() external payable {
		vault.deposit{value: msg.value}();
	}

	function attackWithdraw(uint256 amount) external {
		mode = Mode.WITHDRAW;
		vault.withdraw(amount);
		mode = Mode.NONE;
	}

	function attackRefund() external {
		mode = Mode.REFUND;
		vault.refund();
		mode = Mode.NONE;
	}

	receive() external payable {
		if (reentered != 0) return;
		reentered = 1;
		if (mode == Mode.WITHDRAW) {
			vault.withdraw(1);
		} else if (mode == Mode.REFUND) {
			vault.refund();
		}
	}
}
