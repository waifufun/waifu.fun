// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";

contract TaxSplitter {
	using SafeERC20 for IERC20;

	address[] public recipients;
	uint16[] public bpsRates; // sum must = 10000

	event Released(address indexed token, uint256 total);

	error InvalidRates();
	error EmptyRecipients();

	constructor(address[] memory _recipients, uint16[] memory _bpsRates) {
		if (_recipients.length == 0 || _recipients.length != _bpsRates.length) revert EmptyRecipients();

		uint256 total;
		for (uint256 i = 0; i < _bpsRates.length; i++) {
			total += _bpsRates[i];
		}
		if (total != 10000) revert InvalidRates();

		recipients = _recipients;
		bpsRates = _bpsRates;
	}

	receive() external payable {
		uint256 bal = address(this).balance;
		if (bal == 0) return;

		for (uint256 i = 0; i < recipients.length; i++) {
			uint256 cut = (bal * bpsRates[i]) / 10000;
			if (cut > 0) Address.sendValue(payable(recipients[i]), cut);
		}
	}

	function release(address token) external {
		IERC20 t = IERC20(token);
		uint256 bal = t.balanceOf(address(this));
		if (bal == 0) return;

		for (uint256 i = 0; i < recipients.length; i++) {
			uint256 cut = (bal * bpsRates[i]) / 10000;
			if (cut > 0) t.safeTransfer(recipients[i], cut);
		}
		emit Released(token, bal);
	}

	function recipientsLength() external view returns (uint256) {
		return recipients.length;
	}
}
