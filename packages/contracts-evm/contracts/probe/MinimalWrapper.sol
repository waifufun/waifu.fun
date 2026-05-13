// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFlapPortalMinimalProbe {
	struct NewTokenV6Params {
		string name;
		string symbol;
		string meta;
		uint8 dexThresh;
		bytes32 salt;
		uint16 tax;
		uint8 migratorType;
		address quoteToken;
		uint256 quoteAmt;
		address beneficiary;
		bytes permitData;
	}

	function newTokenV2(NewTokenV6Params calldata params) external payable returns (address token);
	function newTokenV6(NewTokenV6Params calldata params) external payable returns (address token);
}

contract MinimalWrapper {
	address public immutable portal;

	constructor(address _portal) {
		portal = _portal;
	}

	function callV2(IFlapPortalMinimalProbe.NewTokenV6Params calldata params) external payable returns (address) {
		return IFlapPortalMinimalProbe(portal).newTokenV2{value: msg.value}(params);
	}

	function callV6(IFlapPortalMinimalProbe.NewTokenV6Params calldata params) external payable returns (address) {
		return IFlapPortalMinimalProbe(portal).newTokenV6{value: msg.value}(params);
	}
}
