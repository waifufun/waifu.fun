// SPDX-License-Identifier: MIT
//
//   ╭┈┈┈┈┈┈┈ waifu.fun ┈┈┈┈┈┈┈╮
//   │      BundleRouter         │
//   │   one tx. all or nothing. │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯
//
//          ✿  presale → buy → LP  ✿
//             atomic or revert
//
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FlapTypes} from "./flap/FlapTypes.sol";
import {IFlapPortal} from "./flap/IFlapPortal.sol";
import {IPancakeFactory} from "./uniswap/IPancakeFactory.sol";
import {IPancakePair} from "./uniswap/IPancakePair.sol";
import {IPancakeRouter02} from "./uniswap/IPancakeRouter02.sol";

interface ILaunchVaultRouterCallbacks {
	function pullBnbForLaunch(uint256 amount) external;
	function distribute(address token, uint256 presalerShare) external;
}

/// @title BundleRouter
/// @notice per-launch atomic executor. one BundleRouter per launch,
///         deployed by LaunchFactory. only the bundleBot EOA can call
///         executeBundle(), and only once.
///
///         executeBundle flow (atomic-or-bust):
///           1. pull `quoteAmt + v2BuyBnb + tipBnb` BNB from vault
///           2. call Portal.newTokenV6{value: quoteAmt} (mints token, fills
///              curve, migrates to PCS V2 at the FOUR_FIFTHS thresh)
///           3. assert returned token addr matches predictedToken
///           4. confirm V2 pair exists (Flap auto-graduates inside newTokenV6)
///           5. optional V2 follow-up buy of v2BuyBnb against the new pair
///           6. dynamic split of router's token balance: 50/10/40
///              burn / treasuryLp / vault
///           7. vault.distribute(token, vaultAmt) so vault transitions to
///              LAUNCHED + records presaler share
///           8. tip payout to 48 Club builder EOA
///           9. sweep any BNB dust to DEAD (never refunds router state)
///          10. emit BundleExecuted
///
/// @dev splits are computed dynamically from `IERC20(token).balanceOf(address(this))`
///      because TOKEN_TAXED_V3 is fee-on-transfer (the V2 buy returns post-tax
///      tokens). hardcoding tier-specific numbers would drift from chain truth.
contract BundleRouter {
	using SafeERC20 for IERC20;

	struct BundleExecParams {
		bytes32 vanitySalt;
		string name;
		string symbol;
		string meta; // IPFS CID
		uint16 buyTaxBps;
		uint16 sellTaxBps;
		uint64 taxDuration;
		uint64 antiFarmerDuration;
		address commissionReceiver;
		uint256 minV2TokensOut; // slippage guard for V2 follow-up
		uint256 tipBnb; // 48 Club puissant tip
		uint256 deadline;
	}

	// ---------------------------------------------------------------------
	// immutables (set in constructor by factory)
	// ---------------------------------------------------------------------

	address public immutable factory;
	address public immutable WBNB;
	address public immutable PCS_FACTORY;
	address public immutable PCS_ROUTER;
	address public immutable FLAP_PORTAL;
	address public immutable TIP_RECEIVER;
	address payable public immutable vault;
	address public immutable treasuryLp;
	address public immutable bundleBot;
	address public immutable predictedToken; // 0x..7777, must match CREATE2
	address public immutable creator;
	uint256 public immutable presaleCap;
	uint256 public immutable quoteAmt; // BNB to Portal (16e18 for Tier 80 curve-only, 20e18 for graduating tiers)
	uint256 public immutable v2BuyBnb; // BNB for V2 follow-up
	uint256 public immutable closeTimestamp;

	address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

	// ---------------------------------------------------------------------
	// storage
	// ---------------------------------------------------------------------

	bool public executed; // one-shot guard (doubles as reentrancy guard, see _checkReentry)

	// ---------------------------------------------------------------------
	// events
	// ---------------------------------------------------------------------

	event BundleExecuted(
		address indexed token,
		address indexed pool,
		uint256 quoteAmt,
		uint256 v2BuyBnb,
		uint256 tokensReceived,
		uint256 tokensBurned,
		uint256 tokensToTreasury,
		uint256 tokensToVault,
		uint256 tipPaid,
		uint256 openMcBnb
	);

	event BundleFailed(string reason);

	// ---------------------------------------------------------------------
	// errors
	// ---------------------------------------------------------------------

	error NotBundleBot();
	error AlreadyExecuted();
	error VaultBalanceMismatch();
	error PortalCallFailed();
	error PredictedAddressMismatch();
	error PairNotCreated();
	error V2BuySlippage();
	error TipTransferFailed();
	error VaultDistributeFailed();
	error TreasuryTransferFailed();
	error Expired();
	error InsufficientFunding();
	error ZeroAddress();

	struct ConstructorArgs {
		address factory;
		address wbnb;
		address pcsFactory;
		address pcsRouter;
		address flapPortal;
		address tipReceiver;
		address payable vault;
		address treasuryLp;
		address bundleBot;
		address predictedToken;
		address creator;
		uint256 presaleCap;
		uint256 quoteAmt;
		uint256 v2BuyBnb;
		uint256 closeTimestamp;
	}

	// ---------------------------------------------------------------------
	// constructor
	// ---------------------------------------------------------------------

	constructor(ConstructorArgs memory a) {
		if (
			a.factory == address(0) ||
			a.wbnb == address(0) ||
			a.pcsFactory == address(0) ||
			a.pcsRouter == address(0) ||
			a.flapPortal == address(0) ||
			a.tipReceiver == address(0) ||
			a.vault == address(0) ||
			a.treasuryLp == address(0) ||
			a.bundleBot == address(0) ||
			a.predictedToken == address(0) ||
			a.creator == address(0)
		) revert ZeroAddress();

		factory = a.factory;
		WBNB = a.wbnb;
		PCS_FACTORY = a.pcsFactory;
		PCS_ROUTER = a.pcsRouter;
		FLAP_PORTAL = a.flapPortal;
		TIP_RECEIVER = a.tipReceiver;
		vault = a.vault;
		treasuryLp = a.treasuryLp;
		bundleBot = a.bundleBot;
		predictedToken = a.predictedToken;
		creator = a.creator;
		presaleCap = a.presaleCap;
		quoteAmt = a.quoteAmt;
		v2BuyBnb = a.v2BuyBnb;
		closeTimestamp = a.closeTimestamp;
	}

	// ---------------------------------------------------------------------
	// external
	// ---------------------------------------------------------------------

	/// @notice atomic flap bundle. caller must be bundleBot. one-shot.
	/// @dev    reentrancy is prevented by the `executed` one-shot flag flipped
	///         to true before any external calls (CEI). a re-entry through a
	///         malicious token transfer reverts with AlreadyExecuted.
	function executeBundle(BundleExecParams calldata p) external {
		// 0. guards
		if (msg.sender != bundleBot) revert NotBundleBot();
		if (executed) revert AlreadyExecuted();
		if (block.timestamp > p.deadline) revert Expired();

		// CEI: flip flag before any external call so any re-entry through
		// the malicious-token surface lands on AlreadyExecuted.
		executed = true;

		uint256 needed = quoteAmt + v2BuyBnb + p.tipBnb;

		// 1. pull funds from vault
		ILaunchVaultRouterCallbacks(vault).pullBnbForLaunch(needed);
		if (address(this).balance < needed) revert InsufficientFunding();

		// 2. Portal.newTokenV6 (curve fill, optional auto-graduation to PCS V2)
		address token = _callPortal(p);
		if (token != predictedToken) revert PredictedAddressMismatch();

		// 3. V2 pair check is conditional on v2BuyBnb. Tier 80 sends exactly
		//    16 BNB to Portal which fills the curve to progress=0.96 but does
		//    NOT trigger Portal's auto-graduate-to-V2. The token is in status
		//    Tradable on Flap's curve, no PCS V2 pair yet. That is the intended
		//    Tier 80 outcome: token is curve-only until organic buyers push it
		//    past graduation. For Tiers 90/95/98 (v2BuyBnb > 0), Portal MUST
		//    have auto-graduated since `quoteAmt + v2BuyBnb >= 32 ether > 20 ether`,
		//    which is the empirical graduation threshold.
		address pair = address(0);
		if (v2BuyBnb > 0) {
			pair = IPancakeFactory(PCS_FACTORY).getPair(token, WBNB);
			if (pair == address(0)) revert PairNotCreated();
			_v2FollowUpBuy(token, p.minV2TokensOut, p.deadline);
		}

		// 5. token splits, read router's current balance (curve + V2)
		uint256 totalY = IERC20(token).balanceOf(address(this));
		uint256 burnAmt = totalY / 2; // 50%
		uint256 treasuryAmt = totalY / 10; // 10%
		uint256 vaultAmt = totalY - burnAmt - treasuryAmt; // ~40% (rounding crumbs included)

		// 6. burn
		// safeTransfer; tax tokens may apply tax even on burn path, that's fine
		// because we only care that burnAmt LEAVES the router state.
		IERC20(token).safeTransfer(DEAD, burnAmt);

		// 7. treasury
		IERC20(token).safeTransfer(treasuryLp, treasuryAmt);

		// 8. vault distribution
		IERC20(token).safeTransfer(vault, vaultAmt);
		ILaunchVaultRouterCallbacks(vault).distribute(token, vaultAmt);

		// 9. tip
		if (p.tipBnb > 0) {
			(bool ok, ) = payable(TIP_RECEIVER).call{value: p.tipBnb}("");
			if (!ok) revert TipTransferFailed();
		}

		// 10. compute open MC for event emission (only when V2 pair exists)
		uint256 openMcBnb = pair == address(0) ? 0 : _computeOpenMcBnb(token, pair);

		// 11. sweep any BNB dust to DEAD, never refunds router state.
		//     soft-fail on sweep: we got this far, don't unwind a successful bundle.
		uint256 dust = address(this).balance;
		if (dust > 0) {
			(bool sweepOk, ) = payable(DEAD).call{value: dust}("");
			sweepOk; // silence unused-var; intentional ignore
		}

		emit BundleExecuted(
			token,
			pair,
			quoteAmt,
			v2BuyBnb,
			totalY,
			burnAmt,
			treasuryAmt,
			vaultAmt,
			p.tipBnb,
			openMcBnb
		);
	}

	/// @notice indexer helper: returns the V2 pair address for `token` once it's been created.
	/// @dev    passthrough to `IPancakeFactory.getPair`. returns `address(0)` for
	///         not-yet-graduated tokens; post-graduation pair lookup is the only
	///         path this contract needs.
	function previewPairAddress(address token) external view returns (address pair) {
		pair = IPancakeFactory(PCS_FACTORY).getPair(token, WBNB);
	}

	receive() external payable {
		// accepts BNB from vault during executeBundle pull. router holds nothing
		// post-bundle (dust sweeps to DEAD), so leaving this open is safe.
	}

	// ---------------------------------------------------------------------
	// internal
	// ---------------------------------------------------------------------

	function _callPortal(BundleExecParams calldata p) internal returns (address token) {
		FlapTypes.NewTokenV6Params memory params = FlapTypes.NewTokenV6Params({
			name: p.name,
			symbol: p.symbol,
			meta: p.meta,
			dexThresh: FlapTypes.DexThreshType.FOUR_FIFTHS,
			salt: p.vanitySalt,
			migratorType: FlapTypes.MigratorType.V2_MIGRATOR,
			quoteToken: address(0), // native BNB
			quoteAmt: quoteAmt,
			beneficiary: address(this),
			permitData: "",
			extensionID: bytes32(0),
			extensionData: "",
			dexId: FlapTypes.DEXId.DEX0,
			lpFeeProfile: FlapTypes.V3LPFeeProfile.LP_FEE_PROFILE_STANDARD,
			buyTaxRate: p.buyTaxBps,
			sellTaxRate: p.sellTaxBps,
			taxDuration: p.taxDuration,
			antiFarmerDuration: p.antiFarmerDuration,
			mktBps: 10_000, // all tax to beneficiary (TaxSplitter)
			deflationBps: 0,
			dividendBps: 0,
			lpBps: 0,
			minimumShareBalance: 0,
			dividendToken: address(0),
			commissionReceiver: p.commissionReceiver,
			tokenVersion: FlapTypes.TokenVersion.TOKEN_TAXED_V3
		});
		token = IFlapPortal(FLAP_PORTAL).newTokenV6{value: quoteAmt}(params);
	}

	function _v2FollowUpBuy(address token, uint256 minOut, uint256 deadline) internal {
		address[] memory path = new address[](2);
		path[0] = WBNB;
		path[1] = token;
		uint256 balBefore = IERC20(token).balanceOf(address(this));
		IPancakeRouter02(PCS_ROUTER).swapExactETHForTokensSupportingFeeOnTransferTokens{
			value: v2BuyBnb
		}(minOut, path, address(this), deadline);
		uint256 received = IERC20(token).balanceOf(address(this)) - balBefore;
		if (received < minOut) revert V2BuySlippage();
	}

	function _computeOpenMcBnb(address token, address pair) internal view returns (uint256) {
		(uint112 r0, uint112 r1, ) = IPancakePair(pair).getReserves();
		bool isToken0 = IPancakePair(pair).token0() == token;
		uint256 tokenReserve = isToken0 ? uint256(r0) : uint256(r1);
		uint256 bnbReserve = isToken0 ? uint256(r1) : uint256(r0);
		if (tokenReserve == 0) return 0;
		return (bnbReserve * IERC20(token).totalSupply()) / tokenReserve;
	}
}
