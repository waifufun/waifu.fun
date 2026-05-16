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

// slither-disable-start cyclomatic-complexity,reentrancy-events,timestamp,naming-convention

import {LaunchVault} from "./LaunchVault.sol";
import {BundleRouter} from "./BundleRouter.sol";
import {TreasuryLP} from "./TreasuryLP.sol";
import {IVaultRouterSetter} from "./interfaces/IVaultRouterSetter.sol";
import {TierMath} from "./TierMath.sol";

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
        bytes32 vanitySalt; // raw salt mined off-chain; scoped by creator before CREATE2
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
    address private platformCommissionReceiver;

    // ---------------------------------------------------------------------
    // events
    // ---------------------------------------------------------------------

    event LaunchCreated( // indexed by creator-scoped effective salt
        bytes32 indexed launchId,
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
    error NotCreator();
    error PredictedAddressAlreadyDeployed();

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
        address _tipReceiver,
        address _platformCommissionReceiver
    ) {
        if (
            _wbnb == address(0) || _pcsFactory == address(0) || _pcsRouter == address(0) || _flapPortal == address(0)
                || _tokenImplTaxedV3 == address(0) || _tipReceiver == address(0)
                || _platformCommissionReceiver == address(0)
        ) revert ZeroAddress();

        WBNB = _wbnb;
        PCS_FACTORY = _pcsFactory;
        PCS_ROUTER = _pcsRouter;
        INIT_CODE_HASH = _initCodeHash;
        FLAP_PORTAL = _flapPortal;
        TOKEN_IMPL_TAXED_V3 = _tokenImplTaxedV3;
        TIP_RECEIVER = _tipReceiver;
        platformCommissionReceiver = _platformCommissionReceiver;

        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ---------------------------------------------------------------------
    // external
    // ---------------------------------------------------------------------

    /// @notice deploy a launch (vault + router + treasury LP) atomically.
    function createLaunch(LaunchConfig calldata config) external returns (LaunchAddresses memory addrs) {
        // 1. validate config
        if (config.creator == address(0)) revert InvalidCreator();
        if (msg.sender != config.creator) revert NotCreator();
        if (config.bundleBot == address(0)) revert InvalidBundleBot();
        if (config.commissionReceiver == address(0)) revert InvalidCommissionReceiver();
        if (config.predictedTokenAddress == address(0)) revert InvalidPredictedAddress();
        if (config.closeTimestamp <= block.timestamp) revert InvalidCloseTimestamp();
        if (config.buyTaxBps > 10000 || config.sellTaxBps > 10000) revert InvalidTaxBps();
        if (config.commissionReceiver != platformCommissionReceiver) revert InvalidCommissionReceiver();
        if (config.buyTaxBps > 1000 || config.sellTaxBps > 1000 || config.taxDuration > 365 days) {
            revert InvalidTaxBps();
        }
        if (bytes(config.name).length == 0) revert EmptyName();
        if (bytes(config.symbol).length == 0) revert EmptySymbol();
        if (bytes(config.metaCid).length == 0) revert EmptyMetaCid();

        bytes32 salt = effectiveSalt(config.creator, config.vanitySalt);

        // 2. salt collision
        if (usedSalts[salt]) revert SaltAlreadyUsed();

        // 3. CREATE2 prediction reconciliation
        address predicted =
            address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), FLAP_PORTAL, salt, INIT_CODE_HASH)))));
        if (predicted != config.predictedTokenAddress) revert InvalidPredictedAddress();
        if (predicted.code.length != 0) revert PredictedAddressAlreadyDeployed();

        // 4. get tier budget (tax-calibrated quoteAmt based on config.buyTaxBps)
        (uint256 presaleCap, uint256 quoteAmt, uint256 v2BuyBnb, bool vestingEnabled) =
            tierBudget(config.tier, config.buyTaxBps);

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
            closeTimestamp: config.closeTimestamp,
            launchParamsHash: launchParamsHash(config)
        });
        BundleRouter router = new BundleRouter(routerArgs);

        // 8. mark salt + store BEFORE any third-party call (defensive CEI).
        //     setRouter targets a vault we just deployed (trusted), but we keep
        //     state-writes-before-third-party-call as a static-analysis-clean baseline.
        usedSalts[salt] = true;
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
        treasuryLp.setRegistrar(address(router));

        emit LaunchCreated(
            salt,
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

    /// @notice Full tier budget for a given (tier, buyTaxBps).
    ///         Delegates math to TierMath library (TIER_80 is curve-only,
    ///         graduating tiers calibrate quoteAmt against FLAP fee + buyTax
    ///         to keep effective curve fill >= 16 BNB with 1% margin).
    function tierBudget(LaunchTier tier, uint16 buyTaxBps)
        public
        pure
        returns (uint256 presaleCapBnb, uint256 quoteAmt, uint256 v2BuyBnb, bool vestingEnabled)
    {
        return TierMath.tierBudget(uint8(tier), buyTaxBps);
    }



    function launchCount() external view returns (uint256) {
        return allLaunches.length;
    }

    function effectiveSalt(address creator, bytes32 vanitySalt) internal pure returns (bytes32) {
        return keccak256(abi.encode(creator, vanitySalt));
    }

    function launchParamsHash(LaunchConfig calldata config) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                effectiveSalt(config.creator, config.vanitySalt),
                config.name,
                config.symbol,
                config.metaCid,
                config.buyTaxBps,
                config.sellTaxBps,
                config.taxDuration,
                config.antiFarmerDuration,
                config.commissionReceiver
            )
        );
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }
}

// slither-disable-end cyclomatic-complexity,reentrancy-events,timestamp,naming-convention
