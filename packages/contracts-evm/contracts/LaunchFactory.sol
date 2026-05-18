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
import {RouterDeployer} from "./RouterDeployer.sol";
import {TaxSplitter} from "./TaxSplitter.sol";
import {AgentSafeDeployer} from "./AgentSafeDeployer.sol";

contract LaunchFactory {
    enum LaunchTier {
        TIER_80,
        TIER_90,
        TIER_95,
        TIER_98,
        TIER_TEST
    }

    struct LaunchConfig {
        string name;
        string symbol;
        string metaCid; // IPFS CID from funcs.flap.sh
        address creator; // SIWE-authenticated launcher
        address bundleBot; // hot-wallet EOA authorized to call BundleRouter.executeBundle
        LaunchTier tier;
        uint16 buyTaxBps; // 300 default for waifu.fun
        uint16 sellTaxBps; // 300 default
        uint64 taxDuration; // 365 days default
        uint64 antiFarmerDuration; // 1 hour default
        uint256 closeTimestamp; // presale end
        bytes32 vanitySalt; // raw salt mined off-chain; scoped by creator before CREATE2
        address predictedTokenAddress; // must match CREATE2 derivation; on-chain reconciliation check
        bool noBurn; // smoke-test mode: route burn portion to creator instead of DEAD
        // --- wave M3 additions ---
        address platformReceiver; // destination of the 10% platform slice from the TaxSplitter
        address patron; // human receiving the patron slice (typically == creator)
        address[] agentSafeOwners; // initial owners of the agent's Gnosis Safe
        uint256 agentSafeThreshold; // 1..agentSafeOwners.length
        uint16 platformBps; // 1000..5000 (10%..50%)
        uint16 patronBps; // share routed to patron via TaxSplitter; agent gets the remainder
    }

    struct LaunchAddresses {
        address vault;
        address router;
        address treasuryLp;
        address predictedTokenAddress;
        address taxSplitter; // wave M3
        address agentSafe; // wave M3
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
    RouterDeployer public immutable ROUTER_DEPLOYER;
    AgentSafeDeployer public immutable AGENT_SAFE_DEPLOYER;

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
        address taxSplitter,
        address agentSafe,
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
    error InvalidPlatformReceiver();
    error InvalidPredictedAddress();
    error InvalidCloseTimestamp();
    error InvalidTaxBps();
    error InvalidPlatformBps();
    error InvalidPatron();
    error InvalidAgentSafeConfig();
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
        address _platformCommissionReceiver,
        address _routerDeployer,
        address _agentSafeDeployer
    ) {
        if (
            _wbnb == address(0) || _pcsFactory == address(0) || _pcsRouter == address(0) || _flapPortal == address(0)
                || _tokenImplTaxedV3 == address(0) || _tipReceiver == address(0)
                || _platformCommissionReceiver == address(0) || _routerDeployer == address(0)
                || _agentSafeDeployer == address(0)
        ) revert ZeroAddress();
        ROUTER_DEPLOYER = RouterDeployer(_routerDeployer);
        AGENT_SAFE_DEPLOYER = AgentSafeDeployer(_agentSafeDeployer);

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

    /// @notice deploy a launch quintet (vault + treasury + taxSplitter + agentSafe + router) atomically.
    /// @dev The deployed TaxSplitter address becomes BundleRouter.commissionReceiver,
    ///      replacing the env-default platform wallet so per-launch revenue flows split
    ///      platform / patron / agent on every distribute.
    function createLaunch(LaunchConfig calldata config) external returns (LaunchAddresses memory addrs) {
        _validateConfig(config);

        bytes32 salt = effectiveSalt(config.creator, config.vanitySalt);

        // salt collision
        if (usedSalts[salt]) revert SaltAlreadyUsed();

        // CREATE2 prediction reconciliation
        address predicted =
            address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), FLAP_PORTAL, salt, INIT_CODE_HASH)))));
        if (predicted != config.predictedTokenAddress) revert InvalidPredictedAddress();
        if (predicted.code.length != 0) revert PredictedAddressAlreadyDeployed();

        // tier budget (tax-calibrated quoteAmt based on config.buyTaxBps)
        (uint256 presaleCap, uint256 quoteAmt, uint256 v2BuyBnb, bool vestingEnabled) =
            tierBudget(config.tier, config.buyTaxBps);

        // deploy LaunchVault
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

        // deploy TreasuryLP
        TreasuryLP treasuryLp = new TreasuryLP(config.creator, address(this));

        // deploy AgentSafe via the external deployer (deterministic CREATE2 inside Safe ProxyFactory)
        uint256 saltNonce =
            uint256(keccak256(abi.encode("AGENT_SAFE", config.creator, config.vanitySalt)));
        address agentSafe = AGENT_SAFE_DEPLOYER.deployAgentSafe(
            config.agentSafeOwners, config.agentSafeThreshold, saltNonce
        );

        // deploy TaxSplitter (immutable 3-way: platform / patron / agent)
        TaxSplitter taxSplitter =
            new TaxSplitter(config.platformReceiver, config.patron, agentSafe, config.platformBps, config.patronBps);

        // deploy BundleRouter via helper, passing TaxSplitter as the commissionReceiver
        BundleRouter router = BundleRouter(
            payable(
                ROUTER_DEPLOYER.deploy(
                    BundleRouter.ConstructorArgs({
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
                        noBurn: config.noBurn,
                        presaleCap: presaleCap,
                        quoteAmt: quoteAmt,
                        v2BuyBnb: v2BuyBnb,
                        closeTimestamp: config.closeTimestamp,
                        launchParamsHash: _launchParamsHash(config, address(taxSplitter))
                    })
                )
            )
        );

        // mark salt + store BEFORE any external call (defensive CEI).
        usedSalts[salt] = true;
        addrs = LaunchAddresses({
            vault: address(vault),
            router: address(router),
            treasuryLp: address(treasuryLp),
            predictedTokenAddress: predicted,
            taxSplitter: address(taxSplitter),
            agentSafe: agentSafe
        });
        launches[predicted] = addrs;
        allLaunches.push(predicted);

        // one-shot wire vault -> router (last external call before emit)
        IVaultRouterSetter(address(vault)).setRouter(address(router));
        treasuryLp.setRegistrar(address(router));

        emit LaunchCreated(
            salt,
            config.creator,
            predicted,
            address(vault),
            address(router),
            address(treasuryLp),
            address(taxSplitter),
            agentSafe,
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

    /// @notice Public hash used to bind a LaunchConfig to its BundleRouter. The
    ///         TaxSplitter address (deployed by createLaunch) takes the place of
    ///         the legacy `commissionReceiver` field so the bundle bot must pass
    ///         splitter address in BundleExecParams.commissionReceiver.
    function launchParamsHash(LaunchConfig calldata config, address taxSplitter)
        public
        pure
        returns (bytes32)
    {
        return _launchParamsHash(config, taxSplitter);
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        address prev = owner;
        owner = newOwner;
        emit OwnershipTransferred(prev, newOwner);
    }

    // ---------------------------------------------------------------------
    // internal
    // ---------------------------------------------------------------------

    function _validateConfig(LaunchConfig calldata config) internal view {
        if (config.creator == address(0)) revert InvalidCreator();
        if (msg.sender != config.creator) revert NotCreator();
        if (config.bundleBot == address(0)) revert InvalidBundleBot();
        if (config.predictedTokenAddress == address(0)) revert InvalidPredictedAddress();
        if (config.closeTimestamp <= block.timestamp) revert InvalidCloseTimestamp();
        if (config.buyTaxBps > 10000 || config.sellTaxBps > 10000) revert InvalidTaxBps();
        if (config.buyTaxBps > 1000 || config.sellTaxBps > 1000 || config.taxDuration > 365 days) {
            revert InvalidTaxBps();
        }
        if (bytes(config.name).length == 0) revert EmptyName();
        if (bytes(config.symbol).length == 0) revert EmptySymbol();
        if (bytes(config.metaCid).length == 0) revert EmptyMetaCid();

        // --- wave M3 splitter / safe validation ---
        if (config.platformReceiver == address(0)) revert InvalidPlatformReceiver();
        if (config.platformReceiver != platformCommissionReceiver) revert InvalidPlatformReceiver();
        if (config.patron == address(0)) revert InvalidPatron();
        if (config.platformBps < 1000 || config.platformBps > 5000) revert InvalidPlatformBps();
        // platformBps + patronBps must leave a non-negative slice for the agent.
        if (uint256(config.platformBps) + uint256(config.patronBps) > 10000) revert InvalidPlatformBps();
        uint256 nOwners = config.agentSafeOwners.length;
        if (nOwners == 0) revert InvalidAgentSafeConfig();
        if (config.agentSafeThreshold == 0 || config.agentSafeThreshold > nOwners) {
            revert InvalidAgentSafeConfig();
        }
    }

    function _launchParamsHash(LaunchConfig calldata config, address taxSplitter)
        internal
        pure
        returns (bytes32)
    {
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
                taxSplitter
            )
        );
    }
}

// slither-disable-end cyclomatic-complexity,reentrancy-events,timestamp,naming-convention
