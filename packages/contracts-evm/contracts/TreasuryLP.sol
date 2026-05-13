// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TreasuryLP
/// @notice wave H custodial treasury holder. receives the 10% bundle-slice
///         of the new token and holds it. a follow-up wave promotes this
///         to a real V3 CLAMM single-sided LP. for wave H the contract is
///         pure custody, owner-sweepable.
///
/// @dev PHASE 1 SCAFFOLD: storage + signatures + events + custom errors
///      are final; function bodies revert `WaveH:phase2`. phase 2 fills
///      in recordManagedToken + sweep. see
///      `WAVE_H_FLAP_NATIVE_SPEC.md` section 11 and
///      `WAVE_H_INTERFACES.md` section 6.
contract TreasuryLP {
	// ---------------------------------------------------------------------
	// immutables
	// ---------------------------------------------------------------------

	address public immutable owner; // platform fee wallet or treasury multisig
	address public immutable factory; // LaunchFactory (records which launch this is for)

	// ---------------------------------------------------------------------
	// storage
	// ---------------------------------------------------------------------

	address public managedToken; // set on first recordManagedToken() call

	// ---------------------------------------------------------------------
	// events
	// ---------------------------------------------------------------------

	event TokensReceived(address indexed token, uint256 amount);
	event TokensSwept(address indexed to, address indexed token, uint256 amount);
	event ManagedTokenSet(address indexed token);

	// ---------------------------------------------------------------------
	// errors
	// ---------------------------------------------------------------------

	error NotOwner();
	error MultipleTokens();
	error ZeroAddress();

	// ---------------------------------------------------------------------
	// constructor
	// ---------------------------------------------------------------------

	constructor(address _owner, address _factory) {
		if (_owner == address(0) || _factory == address(0)) revert ZeroAddress();
		owner = _owner;
		factory = _factory;
	}

	// ---------------------------------------------------------------------
	// external
	// ---------------------------------------------------------------------

	/// @notice idempotent token registration. anyone may call after first inflow.
	function recordManagedToken(address /* t */) external {
		revert("WaveH:phase2");
	}

	/// @notice owner-only sweep. forwards `amount` of token `t` to `to`.
	///         used to drain custody into a real LP-deployer contract once
	///         the V3 CLAMM follow-up wave ships.
	function sweep(address /* to */, address /* t */, uint256 /* amount */) external {
		revert("WaveH:phase2");
	}

	/// @notice reject raw BNB. TreasuryLP only holds tokens.
	receive() external payable {
		revert("WaveH:phase2");
	}
}
