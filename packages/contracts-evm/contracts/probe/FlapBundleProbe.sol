// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFlapPortalV6Probe {
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
}

interface IPancakeV2FactoryProbe {
	function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IPancakeV2RouterProbe {
	function swapExactETHForTokensSupportingFeeOnTransferTokens(
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable;
}

interface IERC20Probe {
	function balanceOf(address account) external view returns (uint256);
}

contract FlapBundleProbe {
	error PairMissing(address token);
	error NativeRefundFailed();

	IFlapPortalV6Probe public immutable portal;
	IPancakeV2FactoryProbe public immutable factory;
	IPancakeV2RouterProbe public immutable router;
	address public immutable wbnb;

	event ProbeCompleted(address indexed token, address indexed pair, uint256 tokenBalance, uint256 remainingNative);

	constructor(address _portal, address _factory, address _router, address _wbnb) {
		portal = IFlapPortalV6Probe(_portal);
		factory = IPancakeV2FactoryProbe(_factory);
		router = IPancakeV2RouterProbe(_router);
		wbnb = _wbnb;
	}

	receive() external payable {}

	function probe(
		IFlapPortalV6Probe.NewTokenV6Params calldata params,
		uint256 v2BuyAmount,
		uint256 minV2Out,
		uint256 deadline
	) external payable returns (address token, uint256 v2Balance) {
		require(msg.value == params.quoteAmt + v2BuyAmount, "bad msg.value");

		token = portal.newTokenV2{value: params.quoteAmt}(params);

		address pair = factory.getPair(token, wbnb);
		if (pair == address(0)) revert PairMissing(token);

		address[] memory path = new address[](2);
		path[0] = wbnb;
		path[1] = token;

		router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: v2BuyAmount}(
			minV2Out,
			path,
			address(this),
			deadline
		);

		v2Balance = IERC20Probe(token).balanceOf(address(this));
		emit ProbeCompleted(token, pair, v2Balance, address(this).balance);
	}

	function sweepNative(address payable to) external {
		(bool ok,) = to.call{value: address(this).balance}("");
		if (!ok) revert NativeRefundFailed();
	}
}
