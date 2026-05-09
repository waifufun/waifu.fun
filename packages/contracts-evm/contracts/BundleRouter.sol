// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IPancakeFactory {
	function getPair(address tokenA, address tokenB) external view returns (address);
}

interface IPancakeRouter {
	function addLiquidityETH(
		address token,
		uint256 amountTokenDesired,
		uint256 amountTokenMin,
		uint256 amountETHMin,
		address to,
		uint256 deadline
	) external payable returns (uint256 amountToken, uint256 amountETH, uint256 liquidity);

	function swapExactETHForTokensSupportingFeeOnTransferTokens(
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable;
}

interface IPancakePair {
	function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
	function token0() external view returns (address);
}

/// @title BundleRouter
/// @notice Atomic bundle launch: fills bonding curve, buys from V2 pair, burns proceeds.
/// @dev Single-tx, all-or-nothing. Owner-gated. No persistent token or BNB custody.
contract BundleRouter is ReentrancyGuard {
	struct BundleParams {
		address flapToken;
		uint256 curveFillBnb;
		uint256 v2BuyBnb;
		uint256 minTokensFromV2;
		uint256 deadline;
	}

	struct PortalExactInputParams {
		address inputToken;
		address outputToken;
		uint256 inputAmount;
		uint256 minOutputAmount;
		bytes permitData;
	}

	address public owner;
	address internal immutable WBNB;
	address internal immutable pcsFactory;
	address internal immutable pcsRouter;
	bytes32 internal immutable initCodeHash;
	address internal immutable flapPortal;

	address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
	bytes4 private constant FLAP_SWAP_EXACT_INPUT = 0xef7ec2e7;
	bytes4 private constant BUY_TAX_RATE = 0x691f224f;
	bytes4 private constant SELL_TAX_RATE = 0x24024efd;
	bytes4 private constant TAX_BPS = 0x68f4a786;

	event BundleExecuted(
		address indexed flapToken,
		address indexed v2Pair,
		uint256 curveFillBnb,
		uint256 v2BuyBnb,
		uint256 tokensFromV2,
		uint256 tokensBurned,
		uint256 tokensToTax,
		uint256 openMcBnb
	);

	error Unauthorized();
	error BnbMismatch();
	error Expired();
	error PairNotCreated();
	error SweepFailed();
	error InvalidOwner();
	error NoLiquidityTokens();

	modifier onlyOwner() {
		if (msg.sender != owner) revert Unauthorized();
		_;
	}

	modifier onlyVault() {
		if (msg.sender != owner) revert Unauthorized();
		_;
	}

	constructor(address _wbnb, address _pcsFactory, address _pcsRouter, bytes32 _initCodeHash, address _flapPortal) {
		owner = msg.sender;
		WBNB = _wbnb;
		pcsFactory = _pcsFactory;
		pcsRouter = _pcsRouter;
		initCodeHash = _initCodeHash;
		flapPortal = _flapPortal;
	}

	/// @notice Transfer launch execution authority to the vault.
	function transferOwnership(address newOwner) external onlyOwner {
		if (newOwner == address(0)) revert InvalidOwner();
		owner = newOwner;
	}

	/// @notice Execute the full bundle atomically.
	function execute(BundleParams calldata params) external payable onlyVault nonReentrant {
		if (msg.value != params.curveFillBnb + params.v2BuyBnb) revert BnbMismatch();
		if (block.timestamp > params.deadline) revert Expired();

		// Step 1: Fill the real Flap V3 bonding curve through the Portal. Real
		// TOKEN_TAXED_V3 contracts do not expose token.buy(); the curve state lives
		// in the Portal. Factory-minted AgentTokenV3 launches send LP inventory to
		// this router instead, so the fallback path creates the V2 LP directly.
		uint256 curveBalBefore = IERC20(params.flapToken).balanceOf(address(this));
		bool portalOk = false;
		if (flapPortal.code.length > 0) {
			(portalOk,) = flapPortal.call{value: params.curveFillBnb}(
				abi.encodeWithSelector(
					FLAP_SWAP_EXACT_INPUT,
					PortalExactInputParams({
						inputToken: address(0),
						outputToken: params.flapToken,
						inputAmount: params.curveFillBnb,
						minOutputAmount: 0,
						permitData: ""
					})
				)
			);
		}
		if (portalOk) {
			uint256 curveTokensReceived = IERC20(params.flapToken).balanceOf(address(this)) - curveBalBefore;
			if (curveTokensReceived > 0) {
				IERC20(params.flapToken).transfer(msg.sender, curveTokensReceived);
			}
		} else {
			uint256 lpTokens = IERC20(params.flapToken).balanceOf(address(this));
			if (lpTokens == 0) revert NoLiquidityTokens();
			IERC20(params.flapToken).approve(pcsRouter, lpTokens);
			IPancakeRouter(pcsRouter).addLiquidityETH{value: params.curveFillBnb}(
				params.flapToken,
				lpTokens,
				0,
				0,
				DEAD,
				params.deadline
			);
		}

		// Step 2: Verify V2 pair exists.
		address pair = IPancakeFactory(pcsFactory).getPair(params.flapToken, WBNB);
		if (pair == address(0)) revert PairNotCreated();

		uint256 tokensReceived = 0;

		// Step 3 + 4: V2 buy (FOT-safe) and burn. Skipped if v2BuyBnb == 0.
		if (params.v2BuyBnb > 0) {
			address[] memory path = new address[](2);
			path[0] = WBNB;
			path[1] = params.flapToken;

			uint256 balBefore = IERC20(params.flapToken).balanceOf(address(this));

			IPancakeRouter(pcsRouter).swapExactETHForTokensSupportingFeeOnTransferTokens{value: params.v2BuyBnb}(
				params.minTokensFromV2,
				path,
				address(this),
				params.deadline
			);

			tokensReceived = IERC20(params.flapToken).balanceOf(address(this)) - balBefore;

			// Burn all received tokens. Use raw transfer (FOT will tax burn too, but that's fine).
			if (tokensReceived > 0) {
				IERC20(params.flapToken).transfer(DEAD, tokensReceived);
			}
		}

		// Step 5: Compute open MC and emit.
		(uint112 r0, uint112 r1,) = IPancakePair(pair).getReserves();
		bool tokenIsToken0 = IPancakePair(pair).token0() == params.flapToken;
		uint256 tokenReserve = tokenIsToken0 ? uint256(r0) : uint256(r1);
		uint256 bnbReserve = tokenIsToken0 ? uint256(r1) : uint256(r0);
		uint256 openMcBnb = tokenReserve == 0
			? 0
			: (bnbReserve * IERC20(params.flapToken).totalSupply()) / tokenReserve;

		// Read the real buy-tax bps from TOKEN_TAXED_V3 when present. Flap V3 allows
		// asymmetric buy/sell tax, so do not assume the historical flat 3% rate.
		(uint256 buyTaxBps,) = _readTaxRates(params.flapToken);
		uint256 tokensToTax = _taxFromNet(tokensReceived, buyTaxBps);

		emit BundleExecuted(
			params.flapToken,
			pair,
			params.curveFillBnb,
			params.v2BuyBnb,
			tokensReceived + tokensToTax,
			tokensReceived,
			tokensToTax,
			openMcBnb
		);

		// Step 6: Burn unsolicited BNB dust. The vault intentionally rejects
		// raw receives, and pre-sent router dust must not be able to brick launch.
		uint256 dust = address(this).balance;
		if (dust > 0) {
			(bool ok,) = DEAD.call{value: dust}("");
			if (!ok) revert SweepFailed();
		}
	}

	function _readTaxRates(address token) internal view returns (uint256 buyTaxBps, uint256 sellTaxBps) {
		(bool buyOk, bytes memory buyData) = token.staticcall(abi.encodeWithSelector(BUY_TAX_RATE));
		if (buyOk && buyData.length >= 32) {
			buyTaxBps = abi.decode(buyData, (uint256));
		} else {
			(bool legacyOk, bytes memory legacyData) = token.staticcall(abi.encodeWithSelector(TAX_BPS));
			if (legacyOk && legacyData.length >= 32) buyTaxBps = abi.decode(legacyData, (uint256));
		}

		(bool sellOk, bytes memory sellData) = token.staticcall(abi.encodeWithSelector(SELL_TAX_RATE));
		if (sellOk && sellData.length >= 32) sellTaxBps = abi.decode(sellData, (uint256));
	}

	function _taxFromNet(uint256 netAmount, uint256 taxBps) internal pure returns (uint256) {
		if (netAmount == 0 || taxBps == 0) return 0;
		if (taxBps >= 10_000) return 0;
		uint256 grossAmount = (netAmount * 10_000) / (10_000 - taxBps);
		return grossAmount - netAmount;
	}

	/// @notice Predict the V2 pair address for a flap token via CREATE2.
	function previewPairAddress(address flapToken) external view returns (address) {
		(address token0, address token1) = flapToken < WBNB ? (flapToken, WBNB) : (WBNB, flapToken);
		return address(
			uint160(
				uint256(
					keccak256(
						abi.encodePacked(
							hex"ff",
							pcsFactory,
							keccak256(abi.encodePacked(token0, token1)),
							initCodeHash
						)
					)
				)
			)
		);
	}

	receive() external payable {}
}
