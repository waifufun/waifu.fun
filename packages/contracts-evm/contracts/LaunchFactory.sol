// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LaunchVault} from "./LaunchVault.sol";
import {BundleRouter} from "./BundleRouter.sol";
import {TreasuryLP} from "./TreasuryLP.sol";

/// @title LaunchFactory
/// @notice wave H factory. one createLaunch() tx deploys a per-launch
///         LaunchVault + BundleRouter + TreasuryLP. all tokens are minted
///         by Flap Portal V6 inside the bundle, not here.
///
/// @dev PHASE 1 SCAFFOLD: storage + signatures + events + custom errors
///      are final; function bodies revert `WaveH:phase2`. phase 2 fills
///      in createLaunch logic + fork integration tests. see
///      `WAVE_H_FLAP_NATIVE_SPEC.md` / `WAVE_H_INTERFACES.md`.
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

	/// @notice deploy a wave H launch (vault + router + treasury LP) atomically.
	/// @dev PHASE 1 STUB: reverts. phase 2 implements full deploy flow.
	function createLaunch(
		LaunchConfig calldata /* config */
	) external returns (LaunchAddresses memory) {
		revert("WaveH:phase2");
	}

	/// @notice tier -> (presaleCap, quoteAmt, v2BuyBnb, vestingEnabled).
	///   TIER_80: (16, 16,   0, false)
	///   TIER_90: (32, 16,  16, true)
	///   TIER_95: (64, 16,  48, true)
	///   TIER_98: (160,16, 144, true)
	function tierConfig(LaunchTier tier)
		public
		pure
		returns (uint256 presaleCapBnb, uint256 quoteAmt, uint256 v2BuyBnb, bool vestingEnabled)
	{
		if (tier == LaunchTier.TIER_80) return (16 ether, 16 ether, 0, false);
		if (tier == LaunchTier.TIER_90) return (32 ether, 16 ether, 16 ether, true);
		if (tier == LaunchTier.TIER_95) return (64 ether, 16 ether, 48 ether, true);
		// TIER_98
		return (160 ether, 16 ether, 144 ether, true);
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
