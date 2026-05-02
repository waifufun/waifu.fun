// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TaxSplitter} from "./TaxSplitter.sol";

contract TaxSplitterFactory {
	event SplitterDeployed(address splitter, address[] recipients, uint16[] bpsRates);

	function deploy(address[] memory recipients, uint16[] memory bpsRates, bytes32 salt)
		external
		returns (address splitter)
	{
		splitter = address(new TaxSplitter{salt: salt}(recipients, bpsRates));
		emit SplitterDeployed(splitter, recipients, bpsRates);
	}

	function predict(address[] memory recipients, uint16[] memory bpsRates, bytes32 salt)
		external
		view
		returns (address)
	{
		bytes memory code = abi.encodePacked(type(TaxSplitter).creationCode, abi.encode(recipients, bpsRates));
		bytes32 hash = keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(code)));
		return address(uint160(uint256(hash)));
	}
}
