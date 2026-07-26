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
import {TreasuryLP5} from "./TreasuryLP5.sol";
import {IVaultRouterSetter} from "./interfaces/IVaultRouterSetter.sol";
import {TierMath} from "./TierMath.sol";
import {LaunchTier} from "./LaunchTier.sol";
import {RouterDeployer} from "./RouterDeployer.sol";
import {TaxSplitter} from "./TaxSplitter.sol";
import {AgentSafeZodiacDeployer} from "./AgentSafeZodiacDeployer.sol";
import {TreasuryLP5Deployer} from "./TreasuryLP5Deployer.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IPCSV2Factory {
    function getPair(address tokenA, address tokenB) external view returns (address);
}

contract LaunchFactory is ReentrancyGuard {
    /// @dev LaunchTier enum is defined in `LaunchTier.sol` and shared with
    ///      `LaunchVault` so the vault can gate behavior on tier (e.g. the
    ///      instant admin refund only available for TIER_TEST). External
    ///      callers that used to reference `LaunchFactory.LaunchTier` should
    ///      import the enum from `./LaunchTier.sol` directly.

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
        address platformReceiver; // destination of the platform slice from the TaxSplitter
        address patron; // human receiving the patron slice (typically == creator)
        address[] agentSafeOwners; // initial owners of the agent's Gnosis Safe
        uint256 agentSafeThreshold; // 1..agentSafeOwners.length
        uint16 platformBps; // 1000..5000 (10%..50%)
        uint16 patronBps; // share routed to patron via TaxSplitter; agent gets the remainder
        // --- Zodiac AgentSafe additions ---
        address agentEoa; // Steward/agent-hot EOA assigned in roleConfigCalls; zero means pending/no role assignment yet
        bytes[] roleConfigCalls; // raw Zodiac Roles v2 config from @waifufun/agent-actions/zodiac
        // --- wave N additions ---
        int24[4] treasuryTickLowers; // V3 tick lower per LP tier, must be multiple of v3 tickSpacing
        int24[4] treasuryTickUppers; // V3 tick upper per LP tier, must be > tickLower, multiple of spacing
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
    // wave N split: 10% buyback / 5% platform / 20% patron / 65% agent
    // (uniform across launches; encoded as immutable constants for now)
    // ---------------------------------------------------------------------
    uint16 public constant TREASURY_BUYBACK_BPS = 1000;
    uint16 public constant TREASURY_PLATFORM_BPS = 500;
    uint16 public constant TREASURY_PATRON_BPS = 2000;
    uint24 public constant TREASURY_V3_FEE = 10000; // 1% tier, tickSpacing 200 on PCS V3
    int24 internal constant MAX_TICK_PCS_V3_1PCT = 887200;

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
    AgentSafeZodiacDeployer public immutable AGENT_SAFE_DEPLOYER;
    TreasuryLP5Deployer public immutable TREASURY_LP5_DEPLOYER;
    address public immutable PCS_V3_NPM;
    address public immutable PCS_V3_FACTORY;

    // ---------------------------------------------------------------------
    // storage
    // ---------------------------------------------------------------------

    address public owner; // admin emergency stop
    mapping(bytes32 => bool) public usedSalts; // dedupe across launches
    mapping(address => LaunchAddresses) public launches; // keyed by predictedToken
    mapping(address => bool) public finalized; // wave N: tracks finalizeLaunch idempotency
    address[] public allLaunches;
    address private immutable platformCommissionReceiver;

    // ---------------------------------------------------------------------
    // events
    // ---------------------------------------------------------------------

    event LaunchCreated(
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
    event LaunchFinalized(address indexed predictedToken, address indexed treasuryLp, address indexed pair);
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
    error InvalidTickRange();
    error EmptyName();
    error EmptySymbol();
    error EmptyMetaCid();
    error SaltAlreadyUsed();
    error NotOwner();
    error ZeroAddress();
    error NotCreator();
    error PredictedAddressAlreadyDeployed();
    error UnknownLaunch();
    error AlreadyFinalized();
    error PairNotReady();

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
        address _agentSafeDeployer,
        address _treasuryLp5Deployer,
        address _pcsV3Npm,
        address _pcsV3Factory
    ) {
        if (
            _wbnb == address(0) || _pcsFactory == address(0) || _pcsRouter == address(0)
                || _flapPortal == address(0) || _tokenImplTaxedV3 == address(0)
                || _tipReceiver == address(0) || _platformCommissionReceiver == address(0)
                || _routerDeployer == address(0) || _agentSafeDeployer == address(0)
                || _treasuryLp5Deployer == address(0) || _pcsV3Npm == address(0)
                || _pcsV3Factory == address(0)
        ) revert ZeroAddress();
        ROUTER_DEPLOYER = RouterDeployer(_routerDeployer);
        AGENT_SAFE_DEPLOYER = AgentSafeZodiacDeployer(_agentSafeDeployer);
        TREASURY_LP5_DEPLOYER = TreasuryLP5Deployer(_treasuryLp5Deployer);

        WBNB = _wbnb;
        PCS_FACTORY = _pcsFactory;
        PCS_ROUTER = _pcsRouter;
        INIT_CODE_HASH = _initCodeHash;
        FLAP_PORTAL = _flapPortal;
        TOKEN_IMPL_TAXED_V3 = _tokenImplTaxedV3;
        TIP_RECEIVER = _tipReceiver;
        platformCommissionReceiver = _platformCommissionReceiver;
        PCS_V3_NPM = _pcsV3Npm;
        PCS_V3_FACTORY = _pcsV3Factory;

        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ---------------------------------------------------------------------
    // external: createLaunch
    // ---------------------------------------------------------------------

    /// @notice deploy a launch quintet (vault + treasury + taxSplitter + agentSafe + router) atomically.
    /// @dev The deployed TaxSplitter address becomes BundleRouter.commissionReceiver,
    ///      replacing the env-default platform wallet so per-launch revenue flows split
    ///      platform / patron / agent on every distribute.
    ///
    ///      Wave N: TreasuryLP5 is deployed with the V3 NPM wired in but the FLAP
    ///      V2 pair address is unknown at createLaunch time (graduates post-bundle).
    ///      finalizeLaunch(token) is callable by anyone once the V2 pair exists,
    ///      idempotent, and wires the pair + transfers TreasuryLP5 ownership to
    ///      the agent Safe.
    function createLaunch(LaunchConfig calldata config) external nonReentrant returns (LaunchAddresses memory addrs) {
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
            vestingEnabled,
            config.tier
        );

        // deploy AgentSafe via the Zodiac deployer (deterministic CREATE2 inside Safe ProxyFactory)
        // and attach the Roles module atomically. `roleConfigCalls` is produced
        // off-chain by @waifufun/agent-actions/zodiac and included in the signed
        // createLaunch calldata. If `agentEoa` is zero, the Steward agent key is
        // still pending: deploy the Safe with the Roles module enabled but no
        // default member assigned yet.
        uint256 saltNonce =
            uint256(keccak256(abi.encode("AGENT_SAFE", config.creator, config.vanitySalt)));
        uint256 rolesSaltNonce =
            uint256(keccak256(abi.encode("AGENT_SAFE_ROLES", config.creator, config.vanitySalt)));
        (address agentSafe, ) = AGENT_SAFE_DEPLOYER.deployAgentSafeWithRoles(
            config.agentSafeOwners, config.agentSafeThreshold, saltNonce, rolesSaltNonce, config.roleConfigCalls
        );

        // deploy TaxSplitter (immutable 3-way: platform / patron / agent)
        TaxSplitter taxSplitter =
            new TaxSplitter(config.platformReceiver, config.patron, agentSafe, config.platformBps, config.patronBps);

        // deploy TreasuryLP5 via deployer (creation bytecode lives off-factory to fit EIP-170)
        address treasuryLp = TREASURY_LP5_DEPLOYER.deploy(
            _buildTreasuryArgs(config, predicted, agentSafe)
        );

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
                        treasuryLp: agentSafe, // 10% → agent treasury (Safe), not LP5
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
            treasuryLp: treasuryLp,
            predictedTokenAddress: predicted,
            taxSplitter: address(taxSplitter),
            agentSafe: agentSafe
        });
        launches[predicted] = addrs;
        allLaunches.push(predicted);

        // one-shot wire vault -> router (last external call before emit)
        IVaultRouterSetter(address(vault)).setRouter(address(router));

        emit LaunchCreated(
            salt,
            config.creator,
            predicted,
            address(vault),
            address(router),
            treasuryLp,
            address(taxSplitter),
            agentSafe,
            config.tier,
            presaleCap,
            v2BuyBnb,
            config.closeTimestamp
        );
    }

    // ---------------------------------------------------------------------
    // external: finalizeLaunch (anyone, idempotent, post-graduation)
    // ---------------------------------------------------------------------

    /// @notice Wire the post-graduation FLAP V2 pair into the TreasuryLP5 and
    ///         transfer ownership to the agent Safe. Callable by anyone once
    ///         the V2 pair exists on PCS_FACTORY; idempotent (reverts on a
    ///         second call). Cannot be griefed because it requires the V2
    ///         pair to exist, which only the bundle path can create.
    function finalizeLaunch(address predictedToken) external nonReentrant {
        LaunchAddresses memory addrs = launches[predictedToken];
        if (addrs.treasuryLp == address(0)) revert UnknownLaunch();
        if (finalized[predictedToken]) revert AlreadyFinalized();

        address pair = IPCSV2Factory(PCS_FACTORY).getPair(predictedToken, WBNB);
        if (pair == address(0)) revert PairNotReady();

        finalized[predictedToken] = true;
        TreasuryLP5 treasury = TreasuryLP5(payable(addrs.treasuryLp));
        // LP5's setFlapV2Pair also initializes the V3 pool and mints all 4
        // tier positions single-sided in the same tx (tick-gated, no MC).
        treasury.setFlapV2Pair(pair);
        treasury.transferOwnership(addrs.agentSafe);

        emit LaunchFinalized(predictedToken, addrs.treasuryLp, pair);
    }

    /// @notice Full tier budget for a given (tier, buyTaxBps).
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
    ///         splitter address in BundleExecParams.commissionReceiver. Tick
    ///         arrays do NOT need to be in the hash because they are baked into
    ///         the TreasuryLP5 constructor (immutable Tier[4] storage) and the
    ///         bundle bot cannot alter them post-deploy.
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
        if (uint256(config.platformBps) + uint256(config.patronBps) > 10000) revert InvalidPlatformBps();
        uint256 nOwners = config.agentSafeOwners.length;
        if (nOwners == 0) revert InvalidAgentSafeConfig();
        if (config.agentSafeThreshold == 0 || config.agentSafeThreshold > nOwners) {
            revert InvalidAgentSafeConfig();
        }
        if (config.agentEoa == address(0)) {
            if (config.roleConfigCalls.length != 0) revert InvalidAgentSafeConfig();
        } else if (config.roleConfigCalls.length == 0) {
            revert InvalidAgentSafeConfig();
        }

        // --- wave O treasury tick range validation ---
        // TreasuryLP5 re-checks spacing + ordering on its side but we fail fast
        // here with a clearer error for the wizard / bundle bot.
        for (uint8 i = 0; i < 4; i++) {
            int24 lo = config.treasuryTickLowers[i];
            int24 hi = config.treasuryTickUppers[i];
            if (lo >= hi) revert InvalidTickRange();
            if (hi > MAX_TICK_PCS_V3_1PCT) revert InvalidTickRange();
            if (lo < -MAX_TICK_PCS_V3_1PCT) revert InvalidTickRange();
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

    function _buildTreasuryArgs(LaunchConfig calldata config, address predicted, address agentSafe)
        internal
        view
        returns (TreasuryLP5.ConstructorArgs memory args)
    {
        TreasuryLP5.Tier[4] memory ts = _buildTiers(config);
        args = TreasuryLP5.ConstructorArgs({
            token: predicted,
            flapV2Router: PCS_ROUTER,
            wbnb: WBNB,
            v3Npm: PCS_V3_NPM,
            v3Factory: PCS_V3_FACTORY,
            agentSafe: agentSafe,
            platformReceiver: config.platformReceiver,
            patronReceiver: config.patron,
            buybackBps: TREASURY_BUYBACK_BPS,
            platformBps: TREASURY_PLATFORM_BPS,
            patronBps: TREASURY_PATRON_BPS,
            v3Fee: TREASURY_V3_FEE,
            tiers: ts
        });
    }

    /// @notice Build the 4 tier ranges from the LaunchConfig's tick arrays.
    ///         The caller (launch wizard / bundle bot) computes ticks from
    ///         MC targets off-chain and passes them in. The contract only
    ///         ever sees ticks, never MC.
    function _buildTiers(LaunchConfig calldata config) internal pure returns (TreasuryLP5.Tier[4] memory ts) {
        for (uint8 i = 0; i < 4; i++) {
            ts[i] = TreasuryLP5.Tier({
                tokenAmount: 25_000_000 ether, // 25M per tier x 4 = 100M total
                tickLower: config.treasuryTickLowers[i],
                tickUpper: config.treasuryTickUppers[i],
                deployed: false,
                paused: false,
                positionId: 0
            });
        }
    }
}

// slither-disable-end cyclomatic-complexity,reentrancy-events,timestamp,naming-convention
