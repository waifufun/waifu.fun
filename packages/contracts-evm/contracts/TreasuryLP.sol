// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title TreasuryLP
/// @notice wave H custodial treasury holder. receives the 10% bundle-slice
///         of the new token and holds it. a follow-up wave promotes this
///         to a real V3 CLAMM single-sided LP. for wave H the contract is
///         pure custody, owner-sweepable.
contract TreasuryLP {
	address public immutable owner;
	address public immutable factory;

	address public managedToken;

	event TokensReceived(address indexed token, uint256 amount);
	event TokensSwept(address indexed to, address indexed token, uint256 amount);
	event ManagedTokenSet(address indexed token);

	error NotOwner();
	error MultipleTokens();
	error ZeroAddress();
	error NoBnbAccepted();

	constructor(address _owner, address _factory) {
		if (_owner == address(0) || _factory == address(0)) revert ZeroAddress();
		owner = _owner;
		factory = _factory;
	}

	/// @notice idempotent token registration. anyone may call after first inflow.
	///         locks to the first registered token. subsequent calls with a different
	///         token revert MultipleTokens.
	function recordManagedToken(address t) external {
		if (t == address(0)) revert ZeroAddress();
		if (managedToken == address(0)) {
			managedToken = t;
			emit ManagedTokenSet(t);
		} else if (managedToken != t) {
			revert MultipleTokens();
		}
	}

	/// @notice owner-only sweep. forwards `amount` of token `t` to `to`.
	///         used to drain custody into a real LP-deployer contract once
	///         the V3 CLAMM follow-up wave ships.
	function sweep(address to, address t, uint256 amount) external {
		if (msg.sender != owner) revert NotOwner();
		if (to == address(0) || t == address(0)) revert ZeroAddress();
		IERC20(t).transfer(to, amount);
		emit TokensSwept(to, t, amount);
	}

	/// @notice helper view: balance of managed token held by this contract.
	function balance() external view returns (uint256) {
		if (managedToken == address(0)) return 0;
		return IERC20(managedToken).balanceOf(address(this));
	}

	/// @notice reject raw BNB. TreasuryLP only holds tokens.
	receive() external payable {
		revert NoBnbAccepted();
	}
}
