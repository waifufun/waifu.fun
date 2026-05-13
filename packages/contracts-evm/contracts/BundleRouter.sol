// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title BundleRouter
/// @notice wave H per-launch atomic executor. one BundleRouter per launch,
///         deployed by LaunchFactory. only the bundleBot EOA can call
///         executeBundle(), and only once.
///
///         executeBundle flow (atomic-or-bust):
///           1. pull presaleCap BNB from vault
///           2. call Portal.newTokenV6{value: quoteAmt} (mints token, fills
///              curve, migrates to PCS V2 at the FOUR_FIFTHS thresh)
///           3. optional V2 follow-up buy of v2BuyBnb against the new pair
///           4. 50/10/40 split of token Y: burn / treasuryLp / vault.distribute()
///           5. tip payout to 48 Club builder EOA
///
/// @dev PHASE 1 SCAFFOLD: storage + signatures + events + custom errors
///      are final; function bodies revert `WaveH:phase2`. phase 2 wires
///      Portal.newTokenV6 + PCS V2 + tip. see
///      `WAVE_H_FLAP_NATIVE_SPEC.md` / `WAVE_H_INTERFACES.md` section 5.
contract BundleRouter {
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
	uint256 public immutable quoteAmt; // BNB to Portal (always 16e18)
	uint256 public immutable v2BuyBnb; // BNB for V2 follow-up
	uint256 public immutable closeTimestamp;

	address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

	// ---------------------------------------------------------------------
	// storage
	// ---------------------------------------------------------------------

	bool public executed; // one-shot guard

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
	function executeBundle(BundleExecParams calldata /* p */) external {
		revert("WaveH:phase2");
	}

	/// @notice indexer helper: predict the V2 pair address for a token via CREATE2.
	function previewPairAddress(address /* token */) external view returns (address /* pair */) {
		revert("WaveH:phase2");
	}

	receive() external payable {
		// accepts BNB from vault during executeBundle pull. always ok in phase 1
		// because no code path here exposes a withdraw surface.
	}
}
