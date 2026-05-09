// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IFlapToken {
	function buy() external payable;
}

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

	address public owner;
	address public immutable WBNB;
	address public immutable pcsFactory;
	address public immutable pcsRouter;
	bytes32 public immutable initCodeHash;

	address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

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

	constructor(address _wbnb, address _pcsFactory, address _pcsRouter, bytes32 _initCodeHash) {
		owner = msg.sender;
		WBNB = _wbnb;
		pcsFactory = _pcsFactory;
		pcsRouter = _pcsRouter;
		initCodeHash = _initCodeHash;
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

		// Step 1: Fill bonding curve when the token exposes buy(). Factory-minted
		// AgentTokenV3 launches send LP inventory to this router instead, so the
		// fallback path creates the V2 LP directly with that token inventory.
		uint256 curveBalBefore = IERC20(params.flapToken).balanceOf(address(this));
		try IFlapToken(params.flapToken).buy{value: params.curveFillBnb}() {
			uint256 curveTokensReceived = IERC20(params.flapToken).balanceOf(address(this)) - curveBalBefore;
			if (curveTokensReceived > 0) {
				IERC20(params.flapToken).transfer(msg.sender, curveTokensReceived);
			}
		} catch {
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

		// Approximate tokens that were taxed (3% by default; deltas with `* 100 / 97`).
		uint256 tokensToTax = (params.v2BuyBnb > 0 && tokensReceived > 0)
			? ((tokensReceived * 100) / 97) - tokensReceived
			: 0;

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
