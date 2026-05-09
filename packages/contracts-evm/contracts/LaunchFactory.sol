// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentTokenV3} from "./AgentTokenV3.sol";
import {LaunchVault} from "./LaunchVault.sol";
import {BundleRouter} from "./BundleRouter.sol";
import {TaxSplitter} from "./TaxSplitter.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title LaunchFactory
/// @notice Atomic deployment of agent launch primitives.
///         Mints token, burns 50%, deploys vault + router + per-agent
///         TaxSplitter, allocates supply.
///         Treasury LP integration deferred until W33b lands (TierConfig[]).
/// @dev W40c: each launch deploys its own TaxSplitter parameterized with
///      `[creator, platformWallet]` recipients and `[9000, 1000]` bps so the
///      3% transfer tax actually splits 90% to the agent treasury and 10% to
///      the platform fee wallet on a per-agent basis (V3 audit C-5).
contract LaunchFactory is ReentrancyGuard {
	enum LaunchTier { TIER_80, TIER_90, TIER_95, TIER_98 }

	struct LaunchConfig {
		string name;
		string symbol;
		string metadataURI;
		address creator;
		LaunchTier tier;
		uint256 closeTimestamp; // launch round end (typically now + 24h)
	}

	struct LaunchAddresses {
		address token;
		address vault;
		address router;
		address taxSplitter;
	}

	uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
	uint256 public constant BURN_AMOUNT = 500_000_000 ether;     // 50%
	uint256 public constant PRESALE_AMOUNT = 200_000_000 ether;  // 20%
	uint256 public constant V2_LP_AMOUNT = 200_000_000 ether;    // 20%
	uint256 public constant TREASURY_AMOUNT = 100_000_000 ether; // 10%
	uint256 public constant DEFAULT_PENALTY_BPS = 500;           // 5%

	uint16 public constant SPLITTER_AGENT_BPS = 9000;    // 90% to creator (agent treasury)
	uint16 public constant SPLITTER_PLATFORM_BPS = 1000; // 10% to platform wallet

	address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

	address public immutable WBNB;
	address public immutable PCS_FACTORY;
	address public immutable PCS_ROUTER;
	bytes32 public immutable INIT_CODE_HASH;
	address public immutable PLATFORM_WALLET;

	mapping(address => LaunchAddresses) public launches;
	address[] public allLaunches;

	event LaunchCreated(
		address indexed creator,
		address indexed token,
		address vault,
		address router,
		address taxSplitter,
		LaunchTier tier,
		uint256 presaleCap,
		uint256 v2BuyBnb,
		bool vestingEnabled
	);

	error InvalidCreator();
	error InvalidPlatformWallet();
	error InvalidCloseTimestamp();
	error EmptyName();
	error EmptySymbol();

	constructor(
		address _wbnb,
		address _pcsFactory,
		address _pcsRouter,
		bytes32 _initCodeHash,
		address _platformWallet
	) {
		if (_platformWallet == address(0)) revert InvalidPlatformWallet();
		WBNB = _wbnb;
		PCS_FACTORY = _pcsFactory;
		PCS_ROUTER = _pcsRouter;
		INIT_CODE_HASH = _initCodeHash;
		PLATFORM_WALLET = _platformWallet;
	}

	/// @notice Returns the (presaleCapBnb, v2BuyBnb, vestingEnabled) tuple for a tier.
	function tierConfig(LaunchTier tier) public pure returns (
		uint256 presaleCapBnb,
		uint256 v2BuyBnb,
		bool vestingEnabled
	) {
		if (tier == LaunchTier.TIER_80) return (16 ether, 0, false);
		if (tier == LaunchTier.TIER_90) return (32 ether, 16 ether, true);
		if (tier == LaunchTier.TIER_95) return (64 ether, 48 ether, true);
		// TIER_98
		return (160 ether, 144 ether, true);
	}

	/// @notice Deploy a complete agent launch system in one transaction.
	function createLaunch(LaunchConfig calldata config)
		external
		nonReentrant
		returns (LaunchAddresses memory addrs)
	{
		if (config.creator == address(0)) revert InvalidCreator();
		if (config.closeTimestamp <= block.timestamp) revert InvalidCloseTimestamp();
		if (bytes(config.name).length == 0) revert EmptyName();
		if (bytes(config.symbol).length == 0) revert EmptySymbol();

		(uint256 presaleCap, , bool vestingEnabled) = tierConfig(config.tier);

		// 0. Deploy per-agent TaxSplitter (90% creator / 10% platform)
		address splitterAddr;
		{
			address[] memory recipients = new address[](2);
			recipients[0] = config.creator;
			recipients[1] = PLATFORM_WALLET;
			uint16[] memory bps = new uint16[](2);
			bps[0] = SPLITTER_AGENT_BPS;
			bps[1] = SPLITTER_PLATFORM_BPS;
			TaxSplitter splitter = new TaxSplitter(recipients, bps);
			splitterAddr = address(splitter);
		}

		// 1. Deploy token using the per-agent splitter
		AgentTokenV3 token = new AgentTokenV3(
			config.name,
			config.symbol,
			config.metadataURI,
			address(this),
			splitterAddr,
			TOTAL_SUPPLY
		);

		// 2. Deploy router (factory is initial owner; transfer to creator at end)
		BundleRouter router = new BundleRouter(
			WBNB,
			PCS_FACTORY,
			PCS_ROUTER,
			INIT_CODE_HASH
		);

		// 3. Deploy vault (creator owns)
		LaunchVault vault = new LaunchVault(
			config.creator,
			payable(address(router)),
			PRESALE_AMOUNT,
			DEFAULT_PENALTY_BPS,
			vestingEnabled,
			config.closeTimestamp
		);

		// 4. Tax-exempt the new contracts and DEAD.
		//    AgentTokenV3 already exempts the factory, the splitter, itself, and DEAD
		//    in its constructor; we add the vault + router here.
		token.setTaxExempt(address(vault), true);
		token.setTaxExempt(address(router), true);

		// 5. Burn 50%
		token.transfer(DEAD, BURN_AMOUNT);

		// 6. Allocate to vault
		token.transfer(address(vault), PRESALE_AMOUNT);

		// 7. Treasury allocation parked here in factory until W33b lands
		//    (factory holds 200M for V2 LP + 100M for treasury = 300M)
		//    Future: token.transfer(treasuryLp, TREASURY_AMOUNT);

		// 8. Lock token bootstrap (no more setTaxExempt)
		token.finalizeBootstrap();

		addrs = LaunchAddresses({
			token: address(token),
			vault: address(vault),
			router: address(router),
			taxSplitter: splitterAddr
		});
		launches[address(token)] = addrs;
		allLaunches.push(address(token));

		emit LaunchCreated(
			config.creator,
			address(token),
			address(vault),
			address(router),
			splitterAddr,
			config.tier,
			presaleCap,
			_v2BuyForTier(config.tier),
			vestingEnabled
		);
	}

	function _v2BuyForTier(LaunchTier tier) internal pure returns (uint256) {
		(, uint256 v2, ) = tierConfig(tier);
		return v2;
	}

	function launchCount() external view returns (uint256) {
		return allLaunches.length;
	}
}
