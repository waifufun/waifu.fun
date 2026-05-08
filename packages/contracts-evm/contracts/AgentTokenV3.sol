// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AgentTokenV3
/// @notice ERC20 with 3% transfer tax for waifu.fun v3 agent launches.
/// @dev Tax routes to TaxSplitter (90% agent / 10% platform).
///      Total supply minted to factory at deploy; factory does allocation.
///      Tax-exempt addresses bypass the 3% (factory, router, vault, pair, dead).
contract AgentTokenV3 is ERC20 {
	uint256 public constant TAX_BPS = 300; // 3%
	address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

	address public immutable taxSplitter;
	string public metadataURI;

	mapping(address => bool) public taxExempt;
	address public immutable factory;
	bool public bootstrapped;

	error NotFactory();
	error AlreadyBootstrapped();

	event TaxExemptSet(address indexed account, bool exempt);

	modifier onlyFactory() {
		if (msg.sender != factory) revert NotFactory();
		_;
	}

	constructor(
		string memory name_,
		string memory symbol_,
		string memory metadataURI_,
		address factory_,
		address taxSplitter_,
		uint256 totalSupply_
	) ERC20(name_, symbol_) {
		factory = factory_;
		taxSplitter = taxSplitter_;
		metadataURI = metadataURI_;

		// Mint full supply to factory; factory does allocation in same tx
		_mint(factory_, totalSupply_);

		// Bootstrap exemptions
		taxExempt[factory_] = true;
		taxExempt[address(this)] = true;
		taxExempt[DEAD] = true;
		taxExempt[taxSplitter_] = true;
	}

	/// @notice Set additional tax-exempt addresses (factory only, before bootstrap).
	/// @dev Called by factory after deploying vault/router/treasury to exempt them.
	function setTaxExempt(address account, bool exempt) external onlyFactory {
		taxExempt[account] = exempt;
		emit TaxExemptSet(account, exempt);
	}

	/// @notice Mark setup complete; locks setTaxExempt() permanently.
	function finalizeBootstrap() external onlyFactory {
		bootstrapped = true;
	}

	/// @notice 3% tax on transfers between non-exempt addresses.
	function _transfer(address from, address to, uint256 amount) internal override {
		if (taxExempt[from] || taxExempt[to]) {
			super._transfer(from, to, amount);
			return;
		}

		uint256 tax = (amount * TAX_BPS) / 10000;
		uint256 net = amount - tax;
		if (tax > 0) super._transfer(from, taxSplitter, tax);
		super._transfer(from, to, net);
	}
}
