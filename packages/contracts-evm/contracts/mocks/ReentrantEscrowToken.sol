// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IFundTarget {
	function fund(uint256 jobId, uint256 amount) external;
}

/// @title ReentrantEscrowToken
/// @notice Malicious ERC20 used only in tests: during transferFrom it re-enters the escrow's
///         fund() to prove the ReentrancyGuard holds. Not for any real deployment.
contract ReentrantEscrowToken is ERC20 {
	address public target;
	uint256 public reenterJobId;
	bool private _entered;

	constructor() ERC20("Evil Token", "EVIL") {}

	function mint(address to, uint256 amount) external {
		_mint(to, amount);
	}

	function setTarget(address t) external {
		target = t;
	}

	function setReenterJobId(uint256 jobId) external {
		reenterJobId = jobId;
	}

	/// @dev On the first transferFrom, attempt to re-enter fund() before completing the move.
	function transferFrom(
		address from,
		address to,
		uint256 amount
	) public override returns (bool) {
		if (!_entered && target != address(0)) {
			_entered = true;
			// Re-enter the escrow. The nonReentrant guard must make this revert.
			IFundTarget(target).fund(reenterJobId, amount);
		}
		return super.transferFrom(from, to, amount);
	}
}
