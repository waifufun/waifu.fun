// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlapTypes} from "../flap/FlapTypes.sol";
import {MockBundlePair, MockBundlePCSFactory} from "./BundleRouterMocks.sol";

/// @title BundleFlowToken
/// @notice plain ERC20 deployed by the CREATE2 portal mock. constructor only
///         takes name/symbol so the JS side can compute init-code-hash via
///         `keccak256(type(BundleFlowToken).creationCode ++ abi.encode(name,symbol))`.
///         the portal then deploys the token deterministically via CREATE2,
///         landing it at the address LaunchFactory predicted.
contract BundleFlowToken is ERC20 {
	address public minter;

	constructor(string memory n, string memory s) ERC20(n, s) {
		minter = msg.sender;
	}

	function adminMint(address to, uint256 amount) external {
		require(msg.sender == minter, "BundleFlowToken: not minter");
		_mint(to, amount);
	}
}

/// @title BundleFlowTokenReentrant
/// @notice variant of BundleFlowToken whose transfer hook attempts to re-enter
///         the LaunchVault.claim() function. used to verify the vault's
///         nonReentrant guard during distribution-time transfers.
contract BundleFlowTokenReentrant is ERC20 {
	address public minter;
	address public reentryTarget;
	bytes public reentryCallData;
	bool public armed;

	constructor(string memory n, string memory s) ERC20(n, s) {
		minter = msg.sender;
	}

	function adminMint(address to, uint256 amount) external {
		require(msg.sender == minter, "BundleFlowTokenReentrant: not minter");
		_mint(to, amount);
	}

	function armReentry(address target, bytes calldata data) external {
		reentryTarget = target;
		reentryCallData = data;
		armed = true;
	}

	function _afterTokenTransfer(address, address to, uint256) internal override {
		if (armed && reentryTarget != address(0)) {
			armed = false; // one-shot
			(bool ok, ) = reentryTarget.call(reentryCallData);
			require(ok, "reentry attempt: call failed (target reverted)");
			// silence unused
			to;
		}
	}
}

/// @title MockSimplePCSRouter
/// @notice simpler PCS router stand-in: holds its own token balance, releases
///         on swap. avoids the transferFrom + pre-approval dance.
contract MockSimplePCSRouter {
	uint256 public tokensPerBnb; // 1e18 scale
	bool public shouldRevert;

	function setRate(uint256 r) external {
		tokensPerBnb = r;
	}

	function setShouldRevert(bool v) external {
		shouldRevert = v;
	}

	function swapExactETHForTokensSupportingFeeOnTransferTokens(
		uint256 amountOutMin,
		address[] calldata path,
		address to,
		uint256 deadline
	) external payable {
		require(!shouldRevert, "MockSimplePCSRouter: forced revert");
		require(block.timestamp <= deadline, "MockSimplePCSRouter: expired");
		require(path.length == 2, "MockSimplePCSRouter: bad path");
		require(msg.value > 0, "MockSimplePCSRouter: zero ETH");
		address token = path[1];
		uint256 out = (msg.value * tokensPerBnb) / 1 ether;
		require(out >= amountOutMin, "MockSimplePCSRouter: slippage");
		bool ok = IERC20(token).transfer(to, out);
		require(ok, "MockSimplePCSRouter: transfer failed");
	}
}

/// @title MockFlapPortalCREATE2
/// @notice deploys BundleFlowToken via CREATE2(portal, salt, init-code-hash).
///         portal address + salt + init-code-hash determines the new token's
///         address. LaunchFactory uses the same formula in createLaunch to
///         compute predictedTokenAddress, so we just match.
contract MockFlapPortalCREATE2 {
	MockBundlePCSFactory public immutable pcsFactory;
	address public immutable wbnb;
	MockSimplePCSRouter public pcsRouter;

	uint256 public curveTokens = 800_000_000 ether;
	uint112 public lpTokenReserve = 200_000_000 ether;
	uint112 public lpBnbReserve = 16 ether;
	uint256 public bagTokensForV2 = 200_000_000 ether;
	bool public shouldRevert;
	bool public useReentrantToken;
	uint256 public lastQuoteAmt;
	address public lastDeployed;

	event PortalDeployed(address indexed token, uint256 quoteAmt);

	constructor(MockBundlePCSFactory f, address _wbnb) {
		pcsFactory = f;
		wbnb = _wbnb;
	}

	function setPCSRouter(MockSimplePCSRouter r) external {
		pcsRouter = r;
	}

	function setShouldRevert(bool v) external {
		shouldRevert = v;
	}

	function setUseReentrantToken(bool v) external {
		useReentrantToken = v;
	}

	function setReserves(uint112 t, uint112 b) external {
		lpTokenReserve = t;
		lpBnbReserve = b;
	}

	function setCurveTokens(uint256 v) external {
		curveTokens = v;
	}

	function setBagTokensForV2(uint256 v) external {
		bagTokensForV2 = v;
	}

	function newTokenV6(FlapTypes.NewTokenV6Params calldata params)
		external
		payable
		returns (address token)
	{
		require(!shouldRevert, "MockFlapPortalCREATE2: forced revert");
		require(msg.value == params.quoteAmt, "MockFlapPortalCREATE2: value mismatch");
		lastQuoteAmt = msg.value;

		// CREATE2 deploy.
		bytes memory bytecode;
		if (useReentrantToken) {
			bytecode = abi.encodePacked(
				type(BundleFlowTokenReentrant).creationCode,
				abi.encode(params.name, params.symbol)
			);
		} else {
			bytecode = abi.encodePacked(
				type(BundleFlowToken).creationCode,
				abi.encode(params.name, params.symbol)
			);
		}
		bytes32 salt = params.salt;
		assembly {
			token := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
		}
		require(token != address(0), "MockFlapPortalCREATE2: deploy failed");
		lastDeployed = token;

		// mint curve tokens to the router (msg.sender on this hop).
		if (useReentrantToken) {
			BundleFlowTokenReentrant(token).adminMint(msg.sender, curveTokens);
		} else {
			BundleFlowToken(token).adminMint(msg.sender, curveTokens);
		}

		// seed V2 pair.
		MockBundlePair pair = new MockBundlePair(token, wbnb, lpTokenReserve, lpBnbReserve);
		pcsFactory.setPair(token, wbnb, address(pair));

		// seed simple PCS router with a bag.
		if (address(pcsRouter) != address(0) && bagTokensForV2 > 0) {
			if (useReentrantToken) {
				BundleFlowTokenReentrant(token).adminMint(address(pcsRouter), bagTokensForV2);
			} else {
				BundleFlowToken(token).adminMint(address(pcsRouter), bagTokensForV2);
			}
		}

		emit PortalDeployed(token, msg.value);
	}
}
