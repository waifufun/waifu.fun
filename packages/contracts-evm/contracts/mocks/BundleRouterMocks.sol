// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {FlapTypes} from "../flap/FlapTypes.sol";

interface IBundleRouterForReentry {
	struct BundleExecParams {
		bytes32 vanitySalt;
		string name;
		string symbol;
		string meta;
		uint16 buyTaxBps;
		uint16 sellTaxBps;
		uint64 taxDuration;
		uint64 antiFarmerDuration;
		address commissionReceiver;
		uint256 minV2TokensOut;
		uint256 tipBnb;
		uint256 deadline;
	}

	function executeBundle(BundleExecParams calldata p) external;
}

/// @title MockFlapTokenV6
/// @notice Plain ERC20 used as the "flap token" in unit tests. No tax surface — atomicity
///         tests don't depend on tax behavior; fork tests cover that.
contract MockFlapTokenV6 is ERC20 {
	uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;

	constructor(string memory n, string memory s) ERC20(n, s) {
		_mint(address(this), TOTAL_SUPPLY);
	}

	function adminMint(address to, uint256 amount) external {
		_mint(to, amount);
	}

	function adminTransferFromSelf(address to, uint256 amount) external {
		_transfer(address(this), to, amount);
	}
}

/// @title MockFlapTokenV6Reentrant
/// @notice ERC20 whose `transfer` attempts to re-enter `executeBundle` on the router.
contract MockFlapTokenV6Reentrant is ERC20 {
	address public router;
	bool public attackArmed;
	IBundleRouterForReentry.BundleExecParams private _attackParams;

	constructor() ERC20("Reentrant", "REENT") {
		_mint(msg.sender, 1_000_000_000 ether);
	}

	function setRouter(address r) external {
		router = r;
	}

	function armAttack(IBundleRouterForReentry.BundleExecParams memory p) external {
		_attackParams = p;
		attackArmed = true;
	}

	function _transfer(address from, address to, uint256 amount) internal override {
		// Try re-entering on every router-outbound transfer. The router's
		// `executed` one-shot flag should make this revert with AlreadyExecuted,
		// which bubbles up and aborts the whole bundle (atomic-or-bust).
		if (attackArmed && from == router) {
			attackArmed = false; // one-shot to avoid infinite recursion
			IBundleRouterForReentry(router).executeBundle(_attackParams);
		}
		super._transfer(from, to, amount);
	}

	function adminMint(address to, uint256 amount) external {
		_mint(to, amount);
	}
}

/// @title MockBundleVault
/// @notice Replaces LaunchVault for BundleRouter unit tests. Holds BNB, releases
///         on `pullBnbForLaunch`, records `distribute` calls.
contract MockBundleVault {
	address public router;
	uint256 public distributeCount;
	address public lastDistributeToken;
	uint256 public lastDistributeAmount;
	bool public pullShouldRevert;

	event PullBnb(address indexed to, uint256 amount);
	event Distribute(address indexed token, uint256 amount);

	function setRouter(address r) external {
		router = r;
	}

	function setPullShouldRevert(bool v) external {
		pullShouldRevert = v;
	}

	function pullBnbForLaunch(uint256 amount) external {
		require(msg.sender == router, "MockBundleVault: not router");
		require(!pullShouldRevert, "MockBundleVault: forced revert");
		(bool ok, ) = payable(router).call{value: amount}("");
		require(ok, "MockBundleVault: pull transfer failed");
		emit PullBnb(router, amount);
	}

	function distribute(address token, uint256 share) external {
		require(msg.sender == router, "MockBundleVault: not router");
		distributeCount++;
		lastDistributeToken = token;
		lastDistributeAmount = share;
		emit Distribute(token, share);
	}

	receive() external payable {}
}

/// @title MockBundlePair
/// @notice Minimal V2-pair stand-in for BundleRouter tests. Returns deterministic
///         reserves + token0 ordering. The mock router does its own swap math
///         against these reserves.
contract MockBundlePair {
	address public immutable token0;
	address public immutable token1;
	uint112 public reserve0;
	uint112 public reserve1;

	constructor(address t0, address t1, uint112 r0, uint112 r1) {
		token0 = t0;
		token1 = t1;
		reserve0 = r0;
		reserve1 = r1;
	}

	function getReserves() external view returns (uint112, uint112, uint32) {
		return (reserve0, reserve1, uint32(block.timestamp));
	}

	function setReserves(uint112 r0, uint112 r1) external {
		reserve0 = r0;
		reserve1 = r1;
	}
}

/// @title MockBundlePCSFactory
/// @notice Minimal IUniswapV2Factory shim — pair registration only.
contract MockBundlePCSFactory {
	mapping(address => mapping(address => address)) private _pairs;

	function getPair(address a, address b) external view returns (address) {
		return _pairs[a][b];
	}

	function setPair(address a, address b, address pair) external {
		_pairs[a][b] = pair;
		_pairs[b][a] = pair;
	}
}

/// @title MockBundlePCSRouter
/// @notice Mock IUniswapV2Router02 implementing only what BundleRouter calls:
///         `swapExactETHForTokensSupportingFeeOnTransferTokens`. Pulls tokens
///         from a pre-funded token holder (`bagSource`) at a configurable rate
///         (`tokensPerBnb` scaled 1e18).
contract MockBundlePCSRouter {
	address public bagSource;
	uint256 public tokensPerBnb; // tokens out per 1 BNB in, 1e18 scale
	bool public shouldRevert;

	function setBag(address source, uint256 rate) external {
		bagSource = source;
		tokensPerBnb = rate;
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
		require(!shouldRevert, "MockBundlePCSRouter: forced revert");
		require(block.timestamp <= deadline, "MockBundlePCSRouter: expired");
		require(path.length == 2, "MockBundlePCSRouter: bad path");
		require(msg.value > 0, "MockBundlePCSRouter: zero ETH");
		address token = path[1];
		uint256 out = (msg.value * tokensPerBnb) / 1 ether;
		require(out >= amountOutMin, "MockBundlePCSRouter: slippage");
		// Pull tokens from the seeded bag (test scaffolding pre-approves).
		bool ok = IERC20(token).transferFrom(bagSource, to, out);
		require(ok, "MockBundlePCSRouter: pull failed");
	}
}

/// @title MockFlapPortalV6
/// @notice Implements IFlapPortal.newTokenV6 for BundleRouter unit tests.
///         Deploys MockFlapTokenV6 (or a pre-seeded "wrong-addr" token for the
///         vanity-mismatch negative test), mints curve tokens to msg.sender,
///         registers a pair in the factory, and routes the quoteAmt BNB to
///         a configurable sink (default: keep it; doesn't matter for the
///         atomicity tests).
contract MockFlapPortalV6 {
	MockBundlePCSFactory public immutable factory;
	address public immutable wbnb;
	address public preDeployedToken; // if set, returned by newTokenV6
	uint256 public curveTokens = 800_000_000 ether;
	uint112 public lpTokens = 200_000_000 ether;
	uint112 public lpBnb = 16 ether;
	bool public shouldRevert;
	bool public returnWrongAddress;
	address public wrongAddressReturn;

	event NewTokenV6Called(address indexed token, uint256 quoteAmt);

	constructor(MockBundlePCSFactory f, address _wbnb) {
		factory = f;
		wbnb = _wbnb;
	}

	function setPreDeployedToken(address t) external {
		preDeployedToken = t;
	}

	function setCurveTokens(uint256 v) external {
		curveTokens = v;
	}

	function setLpReserves(uint112 t, uint112 b) external {
		lpTokens = t;
		lpBnb = b;
	}

	function setShouldRevert(bool v) external {
		shouldRevert = v;
	}

	function setReturnWrongAddress(bool enabled, address wrong) external {
		returnWrongAddress = enabled;
		wrongAddressReturn = wrong;
	}

	function newTokenV6(FlapTypes.NewTokenV6Params calldata params)
		external
		payable
		returns (address token)
	{
		require(!shouldRevert, "MockFlapPortalV6: forced revert");
		require(msg.value == params.quoteAmt, "MockFlapPortalV6: value mismatch");

		if (returnWrongAddress) {
			// Decoy path: actually mint to msg.sender from the wrong-addr token so the
			// test sees the address mismatch even before any balance work happens.
			MockFlapTokenV6(wrongAddressReturn).adminMint(msg.sender, curveTokens);
			emit NewTokenV6Called(wrongAddressReturn, msg.value);
			return wrongAddressReturn;
		}

		require(preDeployedToken != address(0), "MockFlapPortalV6: token not set");
		token = preDeployedToken;

		// mint curve tokens to msg.sender (the bundle router)
		MockFlapTokenV6(token).adminMint(msg.sender, curveTokens);

		// create + seed pair so getPair() succeeds
		address existing = factory.getPair(token, wbnb);
		if (existing == address(0)) {
			// deploy via salt-less new for simplicity; address goes to factory map
			MockBundlePair pair = new MockBundlePair(token, wbnb, lpTokens, lpBnb);
			factory.setPair(token, wbnb, address(pair));
		}

		emit NewTokenV6Called(token, msg.value);
	}
}
