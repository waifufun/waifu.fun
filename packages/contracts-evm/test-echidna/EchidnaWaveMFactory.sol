// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Property-based harness for the wave M+N LaunchFactory wiring invariants.
// The full createLaunch e2e path is exercised by the existing hardhat suite
// (wave-m-factory-integration, TreasuryLP4, wave-n-real-fork). This harness
// focuses on the pure / view invariants that should hold for any future
// configuration of the factory: tier-table totality, immutable constancy,
// ownership transfer correctness, and the constructor zero-address gates
// that protect the wave M+N deployer wiring.

import {LaunchFactory} from "../contracts/LaunchFactory.sol";
import {LaunchTier} from "../contracts/LaunchTier.sol";
import {RouterDeployer} from "../contracts/RouterDeployer.sol";
import {AgentSafeDeployer} from "../contracts/AgentSafeDeployer.sol";
import {TreasuryLP4Deployer} from "../contracts/TreasuryLP4Deployer.sol";
import {MockSafeSingleton, MockSafeProxyFactory} from "../contracts/mocks/SafeMocks.sol";

contract EchidnaWaveMFactory {
    LaunchFactory internal factory;
    RouterDeployer internal routerDep;
    AgentSafeDeployer internal safeDep;
    TreasuryLP4Deployer internal treasuryDep;

    address internal constant WBNB = address(0x0010);
    address internal constant PCS_FACTORY = address(0x0020);
    address internal constant PCS_ROUTER = address(0x0030);
    address internal constant FLAP_PORTAL = address(0x0040);
    address internal constant TOKEN_IMPL = address(0x0050);
    address internal constant TIP_RECEIVER = address(0x0060);
    address internal constant PLATFORM_COMMISSION_RECEIVER = address(0x0070);
    address internal constant PCS_V3_NPM = address(0x0080);
    address internal constant PCS_V3_FACTORY = address(0x0090);
    address internal constant BNB_USD_FEED = address(0x00A0);
    bytes32 internal constant INIT_CODE_HASH = bytes32(uint256(0xCAFE));
    address internal constant ALICE = address(0x100);

    constructor() payable {
        MockSafeSingleton sing = new MockSafeSingleton();
        MockSafeProxyFactory pf = new MockSafeProxyFactory();
        routerDep = new RouterDeployer();
        safeDep = new AgentSafeDeployer(address(sing), address(pf));
        treasuryDep = new TreasuryLP4Deployer();
        factory = new LaunchFactory(
            WBNB,
            PCS_FACTORY,
            PCS_ROUTER,
            INIT_CODE_HASH,
            FLAP_PORTAL,
            TOKEN_IMPL,
            TIP_RECEIVER,
            PLATFORM_COMMISSION_RECEIVER,
            address(routerDep),
            address(safeDep),
            address(treasuryDep),
            PCS_V3_NPM,
            PCS_V3_FACTORY,
            BNB_USD_FEED
        );
    }

    // -----------------------------------------------------------------
    // fuzzable actions
    // -----------------------------------------------------------------

    function transferOwnerToAlice() external {
        try factory.transferOwnership(ALICE) {} catch {}
    }

    function nonOwnerTransfer(address newOwner) external {
        Attacker att = new Attacker(address(factory));
        bool ok = att.attemptTransfer(newOwner);
        assert(!ok);
    }

    // -----------------------------------------------------------------
    // properties
    // -----------------------------------------------------------------

    /// Every (LaunchTier, common buyTax) returns a positive presaleCap and
    /// the tier budget never lies about how the cap decomposes.
    function echidna_tier_table_total() public view returns (bool) {
        uint16[3] memory taxes = [uint16(0), 300, 1000];
        for (uint8 t = 0; t < taxes.length; t++) {
            for (uint8 i = 0; i < 5; i++) {
                (uint256 cap, uint256 quote, uint256 v2,) =
                    factory.tierBudget(LaunchTier(i), taxes[t]);
                if (cap == 0 || quote == 0) return false;
                if (quote + v2 > cap) return false;
            }
        }
        return true;
    }

    /// Immutables never mutate.
    function echidna_immutables_constant() public view returns (bool) {
        return factory.WBNB() == WBNB
            && factory.PCS_FACTORY() == PCS_FACTORY
            && factory.PCS_ROUTER() == PCS_ROUTER
            && factory.INIT_CODE_HASH() == INIT_CODE_HASH
            && factory.FLAP_PORTAL() == FLAP_PORTAL
            && factory.TOKEN_IMPL_TAXED_V3() == TOKEN_IMPL
            && factory.TIP_RECEIVER() == TIP_RECEIVER
            && address(factory.ROUTER_DEPLOYER()) == address(routerDep)
            && address(factory.AGENT_SAFE_DEPLOYER()) == address(safeDep)
            && address(factory.TREASURY_LP4_DEPLOYER()) == address(treasuryDep)
            && factory.PCS_V3_NPM() == PCS_V3_NPM
            && factory.PCS_V3_FACTORY() == PCS_V3_FACTORY
            && factory.BNB_USD_FEED() == BNB_USD_FEED;
    }

    /// Owner is always set (never address(0)).
    function echidna_owner_nonzero() public view returns (bool) {
        return factory.owner() != address(0);
    }

    /// launchCount() is zero in this harness (we never reach createLaunch).
    function echidna_launch_count_zero() public view returns (bool) {
        return factory.launchCount() == 0;
    }

    /// No salt is marked used.
    function echidna_no_used_salts() public view returns (bool) {
        return !factory.usedSalts(bytes32(uint256(0xAAAA)))
            && !factory.usedSalts(bytes32(uint256(0xBBBB)))
            && !factory.usedSalts(bytes32(0));
    }

    /// Treasury split constants match the wave N spec.
    function echidna_treasury_split_constants() public view returns (bool) {
        return factory.TREASURY_BUYBACK_BPS() == 1000
            && factory.TREASURY_PLATFORM_BPS() == 500
            && factory.TREASURY_PATRON_BPS() == 2000
            && factory.TREASURY_V3_FEE() == 10000;
    }

    /// Treasury split (buyback + platform + patron) leaves room for the
    /// agent slice; bound it to keep the sum < 10000 always.
    function echidna_treasury_bps_room_for_agent() public view returns (bool) {
        uint256 sum = uint256(factory.TREASURY_BUYBACK_BPS())
            + uint256(factory.TREASURY_PLATFORM_BPS())
            + uint256(factory.TREASURY_PATRON_BPS());
        return sum < 10_000;
    }

    /// Tier MC ladders are strictly monotonic non-decreasing across the
    /// four positions for any tier. Production tiers are strictly
    /// increasing; we accept >= to keep the property robust to future
    /// flat ladders without breaking the smoke-test tier.
    function echidna_tier_mc_monotonic() public view returns (bool) {
        for (uint8 t = 0; t < 5; t++) {
            uint256[4] memory mc = factory.tierMcTargets(LaunchTier(t));
            for (uint256 j = 1; j < 4; j++) {
                if (mc[j] < mc[j - 1]) return false;
            }
        }
        return true;
    }
}

contract Attacker {
    address internal target;
    constructor(address _t) { target = _t; }

    function attemptTransfer(address newOwner) external returns (bool ok) {
        (ok,) = target.call(abi.encodeWithSignature("transferOwnership(address)", newOwner));
    }
}
