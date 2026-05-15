// SPDX-License-Identifier: MIT
//
//             ╭───────────────────────────────────╮
//             │   w a i f u . f u n               │
//             │   agent token launchpad           │
//             │   ─────────────────────────       │
//             │   LaunchFactory                   │
//             │   bsc · 0x18BF...0983             │
//             ╰───────────────────────────────────╯
//
//          .・゜゜・   ・゜゜・．
//             ✿  she launches herself  ✿
//          .・゜゜・   ・゜゜・．
//
pragma solidity ^0.8.24;

import {LaunchVault} from "./LaunchVault.sol";
import {BundleRouter} from "./BundleRouter.sol";
import {TreasuryLP} from "./TreasuryLP.sol";

/// @title LaunchFactory
/// @notice per-launch deployer. one createLaunch() tx deploys a per-launch
///         LaunchVault + BundleRouter + TreasuryLP. all tokens are minted
///         by Flap Portal V6 inside the bundle, not here.

interface IVaultRouterSetter {
	function setRouter(address _router) external;
}

contract LaunchFactory {
	enum LaunchTier {
		TIER_80,
		TIER_90,
		TIER_95,
		TIER_98
	}

	struct LaunchConfig {
		string name;
		string symbol;
		string metaCid; // IPFS CID from funcs.flap.sh
		address creator; // SIWE-authenticated launcher
		address bundleBot; // hot-wallet EOA authorized to call BundleRouter.executeBundle
		address commissionReceiver; // platform fee wallet on BSC
		LaunchTier tier;
		uint16 buyTaxBps; // 300 default for waifu.fun
		uint16 sellTaxBps; // 300 default
		uint64 taxDuration; // 365 days default
		uint64 antiFarmerDuration; // 1 hour default
		uint256 closeTimestamp; // presale end
		bytes32 vanitySalt; // mined off-chain
		address predictedTokenAddress; // must match CREATE2 derivation; on-chain reconciliation check
	}

	struct LaunchAddresses {
		address vault;
		address router;
		address treasuryLp;
		address predictedTokenAddress;
	}

	// ---------------------------------------------------------------------
	// immutables
	// ---------------------------------------------------------------------

	address public immutable WBNB;
	address public immutable PCS_FACTORY;
	address public immutable PCS_ROUTER;
	bytes32 public immutable INIT_CODE_HASH;
	address public immutable FLAP_PORTAL;
	address public immutable TOKEN_IMPL_TAXED_V3;
	address public immutable TIP_RECEIVER;

	// ---------------------------------------------------------------------
	// storage
	// ---------------------------------------------------------------------

	address public owner; // admin emergency stop
	mapping(bytes32 => bool) public usedSalts; // dedupe across launches
	mapping(address => LaunchAddresses) public launches; // keyed by predictedToken
	address[] public allLaunches;

	// ---------------------------------------------------------------------
	// events
	// ---------------------------------------------------------------------

	event LaunchCreated(
		bytes32 indexed launchId, // keccak256(creator, salt)
		address indexed creator,
		address indexed predictedToken,
		address vault,
		address router,
		address treasuryLp,
		LaunchTier tier,
		uint256 presaleCap,
		uint256 v2BuyBnb,
		uint256 closeTimestamp
	);

	event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

	// ---------------------------------------------------------------------
	// errors
	// ---------------------------------------------------------------------

	error InvalidCreator();
	error InvalidBundleBot();
	error InvalidCommissionReceiver();
	error InvalidPredictedAddress();
	error InvalidCloseTimestamp();
	error InvalidTaxBps();
	error EmptyName();
	error EmptySymbol();
	error EmptyMetaCid();
	error SaltAlreadyUsed();
	error NotOwner();
	error ZeroAddress();

	// ---------------------------------------------------------------------
	// constructor
	// ---------------------------------------------------------------------

	constructor(
		address _wbnb,
		address _pcsFactory,
		address _pcsRouter,
		bytes32 _initCodeHash,
		address _flapPortal,
		address _tokenImplTaxedV3,
		address _tipReceiver
	) {
		if (
			_wbnb == address(0) ||
			_pcsFactory == address(0) ||
			_pcsRouter == address(0) ||
			_flapPortal == address(0) ||
			_tokenImplTaxedV3 == address(0) ||
			_tipReceiver == address(0)
		) revert ZeroAddress();

		WBNB = _wbnb;
		PCS_FACTORY = _pcsFactory;
		PCS_ROUTER = _pcsRouter;
		INIT_CODE_HASH = _initCodeHash;
		FLAP_PORTAL = _flapPortal;
		TOKEN_IMPL_TAXED_V3 = _tokenImplTaxedV3;
		TIP_RECEIVER = _tipReceiver;

		owner = msg.sender;
		emit OwnershipTransferred(address(0), msg.sender);
	}

	// ---------------------------------------------------------------------
	// external
	// ---------------------------------------------------------------------

	/// @notice deploy a launch (vault + router + treasury LP) atomically.
	function createLaunch(
		LaunchConfig calldata config
	) external returns (LaunchAddresses memory addrs) {
		// 1. validate config
		if (config.creator == address(0)) revert InvalidCreator();
		if (config.bundleBot == address(0)) revert InvalidBundleBot();
		if (config.commissionReceiver == address(0)) revert InvalidCommissionReceiver();
		if (config.predictedTokenAddress == address(0)) revert InvalidPredictedAddress();
		if (config.closeTimestamp <= block.timestamp) revert InvalidCloseTimestamp();
		if (config.buyTaxBps > 10000 || config.sellTaxBps > 10000) revert InvalidTaxBps();
		if (bytes(config.name).length == 0) revert EmptyName();
		if (bytes(config.symbol).length == 0) revert EmptySymbol();
		if (bytes(config.metaCid).length == 0) revert EmptyMetaCid();

		// 2. salt collision
		if (usedSalts[config.vanitySalt]) revert SaltAlreadyUsed();

		// 3. CREATE2 prediction reconciliation
		address predicted = address(uint160(uint256(keccak256(abi.encodePacked(
			bytes1(0xff), FLAP_PORTAL, config.vanitySalt, INIT_CODE_HASH
		)))));
		if (predicted != config.predictedTokenAddress) revert InvalidPredictedAddress();

		// 4. get tier config
		(uint256 presaleCap, uint256 quoteAmt, uint256 v2BuyBnb, bool vestingEnabled) = tierConfig(config.tier);

		// 5. deploy LaunchVault
		LaunchVault vault = new LaunchVault(
			address(this),
			config.creator,
			config.bundleBot,
			presaleCap,
			quoteAmt,
			v2BuyBnb,
			config.closeTimestamp,
			0, // penaltyBps default 0
			vestingEnabled
		);

		// 6. deploy TreasuryLP
		TreasuryLP treasuryLp = new TreasuryLP(config.creator, address(this));

		// 7. deploy BundleRouter
		BundleRouter.ConstructorArgs memory routerArgs = BundleRouter.ConstructorArgs({
			factory: address(this),
			wbnb: WBNB,
			pcsFactory: PCS_FACTORY,
			pcsRouter: PCS_ROUTER,
			flapPortal: FLAP_PORTAL,
			tipReceiver: TIP_RECEIVER,
			vault: payable(address(vault)),
			treasuryLp: address(treasuryLp),
			bundleBot: config.bundleBot,
			predictedToken: predicted,
			creator: config.creator,
			presaleCap: presaleCap,
			quoteAmt: quoteAmt,
			v2BuyBnb: v2BuyBnb,
			closeTimestamp: config.closeTimestamp
		});
		BundleRouter router = new BundleRouter(routerArgs);

		// 8. mark salt + store BEFORE any third-party call (defensive CEI).
		//     setRouter targets a vault we just deployed (trusted), but we keep
		//     state-writes-before-third-party-call as a static-analysis-clean baseline.
		usedSalts[config.vanitySalt] = true;
		addrs = LaunchAddresses({
			vault: address(vault),
			router: address(router),
			treasuryLp: address(treasuryLp),
			predictedTokenAddress: predicted
		});
		launches[predicted] = addrs;
		allLaunches.push(predicted);

		// 9. one-shot wire vault -> router (last third-party call before emit)
		IVaultRouterSetter(address(vault)).setRouter(address(router));

		emit LaunchCreated(
			keccak256(abi.encode(config.creator, config.vanitySalt)),
			config.creator,
			predicted,
			address(vault),
			address(router),
			address(treasuryLp),
			config.tier,
			presaleCap,
			v2BuyBnb,
			config.closeTimestamp
		);
	}

	/// @notice tier -> (presaleCap, quoteAmt, v2BuyBnb, vestingEnabled).
	///
	/// Empirical (FLAP_BUNDLE_PROBE_FINDINGS): Portal's bonding curve fills with
	/// 16 BNB to give 800M tokens (status=Tradable, progress=0.96, NO V2 pair).
	/// To trigger atomic graduation (status=DEX, V2 pair created, tokens deposited
	/// to the V2 LP), `quoteAmt` MUST be at least 20 BNB.
	///
	/// Tier 80% is curve-only: no graduation, no V2 follow-up buy. Presalers receive
	/// 40% of the 800M curve allocation. The token starts tradable on Flap's curve.
	///
	/// Tiers 90/95/98% set quoteAmt=20 BNB to trigger Portal graduation, then do a
	/// V2 follow-up buy from the freshly-created PCS V2 pair. v2BuyBnb covers the
	/// rest of the tier budget. Math (gas + token math) is calibrated against the
	/// V6/V7 probe + 20-BNB-graduation observation.
	///
	///   TIER_80:  (16,  16,   0, false)  curve only, no graduation
	///   TIER_90:  (32,  20,  12, true)   20 BNB graduates, 12 BNB V2 buy
	///   TIER_95:  (64,  20,  44, true)   20 BNB graduates, 44 BNB V2 buy
	///   TIER_98:  (160, 20, 140, true)   20 BNB graduates, 140 BNB V2 buy
	function tierConfig(LaunchTier tier)
		public
		pure
		returns (uint256 presaleCapBnb, uint256 quoteAmt, uint256 v2BuyBnb, bool vestingEnabled)
	{
		if (tier == LaunchTier.TIER_80) return (16 ether, 16 ether, 0, false);
		if (tier == LaunchTier.TIER_90) return (32 ether, 20 ether, 12 ether, true);
		if (tier == LaunchTier.TIER_95) return (64 ether, 20 ether, 44 ether, true);
		// TIER_98
		return (160 ether, 20 ether, 140 ether, true);
	}

	function launchCount() external view returns (uint256) {
		return allLaunches.length;
	}

	function transferOwnership(address newOwner) external {
		if (msg.sender != owner) revert NotOwner();
		if (newOwner == address(0)) revert ZeroAddress();
		address prev = owner;
		owner = newOwner;
		emit OwnershipTransferred(prev, newOwner);
	}
}
