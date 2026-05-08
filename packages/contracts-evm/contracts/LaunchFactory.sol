// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentTokenV3} from "./AgentTokenV3.sol";
import {LaunchVault} from "./LaunchVault.sol";
import {BundleRouter} from "./BundleRouter.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/// @title LaunchFactory
/// @notice Atomic deployment of agent launch primitives.
///         Mints token, burns 50%, deploys vault + router, allocates supply.
///         Treasury LP integration deferred until W33b lands (TierConfig[]).
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
	}

	uint256 public constant TOTAL_SUPPLY = 1_000_000_000 ether;
	uint256 public constant BURN_AMOUNT = 500_000_000 ether;     // 50%
	uint256 public constant PRESALE_AMOUNT = 200_000_000 ether;  // 20%
	uint256 public constant V2_LP_AMOUNT = 200_000_000 ether;    // 20%
	uint256 public constant TREASURY_AMOUNT = 100_000_000 ether; // 10%
	uint256 public constant DEFAULT_PENALTY_BPS = 500;           // 5%

	address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

	address public immutable WBNB;
	address public immutable PCS_FACTORY;
	address public immutable PCS_ROUTER;
	bytes32 public immutable INIT_CODE_HASH;
	address public immutable TAX_SPLITTER;

	mapping(address => LaunchAddresses) public launches;
	address[] public allLaunches;

	event LaunchCreated(
		address indexed creator,
		address indexed token,
		address vault,
		address router,
		LaunchTier tier,
		uint256 presaleCap,
		uint256 v2BuyBnb,
		bool vestingEnabled
	);

	error InvalidCreator();
	error InvalidCloseTimestamp();
	error EmptyName();
	error EmptySymbol();

	constructor(
		address _wbnb,
		address _pcsFactory,
		address _pcsRouter,
		bytes32 _initCodeHash,
		address _taxSplitter
	) {
		WBNB = _wbnb;
		PCS_FACTORY = _pcsFactory;
		PCS_ROUTER = _pcsRouter;
		INIT_CODE_HASH = _initCodeHash;
		TAX_SPLITTER = _taxSplitter;
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

		// 1. Deploy token
		AgentTokenV3 token = new AgentTokenV3(
			config.name,
			config.symbol,
			config.metadataURI,
			address(this),
			TAX_SPLITTER,
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

		// 4. Tax-exempt the new contracts and DEAD
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
			router: address(router)
		});
		launches[address(token)] = addrs;
		allLaunches.push(address(token));

		emit LaunchCreated(
			config.creator,
			address(token),
			address(vault),
			address(router),
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
