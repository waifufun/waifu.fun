// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice ERC20 that burns 10% on every transfer (fee-on-transfer model).
contract FeeOnTransferToken is ERC20 {
	uint256 public constant FEE_BPS = 1000; // 10%

	constructor() ERC20("Fee Token", "FEE") {}

	function mint(address to, uint256 amount) public {
		_mint(to, amount);
	}

	function _transfer(address from, address to, uint256 value) internal virtual override {
		uint256 fee = (value * FEE_BPS) / 10000;
		uint256 net = value - fee;
		super._transfer(from, to, net);
		if (fee > 0) {
			_burn(from, fee);
		}
	}
}

/// @notice Receiver that tries to recursively call split() on its sender.
///         Used to verify TaxSplitter is reentrancy-safe (no funds drainable).
contract ReentrantReceiver {
	address public target;
	uint256 public hits;

	function setTarget(address t) public {
		target = t;
	}

	receive() external payable {
		hits += 1;
		if (target != address(0) && address(target).balance > 0) {
			(bool ok, ) = target.call(abi.encodeWithSignature("split()"));
			ok;
		}
	}
}
