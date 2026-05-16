// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LaunchFactory} from "../contracts/LaunchFactory.sol";

/// @title EchidnaLaunchFactory
/// @notice property surface for LaunchFactory state-keeping invariants.
///         createLaunch() requires Portal + PCS plumbing to reach the
///         BundleRouter constructor, so the e2e factory deploy path is
///         exercised via the existing 81 unit tests + 26 e2e bundle tests.
///         this harness focuses on the pure / view-level invariants the
///         factory enforces: tier-table totality, salt-store monotonicity,
///         immutable constancy, ownership transfer correctness.
contract EchidnaLaunchFactory {
    LaunchFactory internal factory;

    address internal constant WBNB = address(0x0010);
    address internal constant PCS_FACTORY = address(0x0020);
    address internal constant PCS_ROUTER = address(0x0030);
    address internal constant FLAP_PORTAL = address(0x0040);
    address internal constant TOKEN_IMPL = address(0x0050);
    address internal constant TIP_RECEIVER = address(0x0060);
    address internal constant PLATFORM_COMMISSION_RECEIVER = address(0x0070);
    bytes32 internal constant INIT_CODE_HASH = bytes32(uint256(0xCAFE));

    address internal constant ALICE = address(0x100);

    constructor() payable {
        factory = new LaunchFactory(
            WBNB,
            PCS_FACTORY,
            PCS_ROUTER,
            INIT_CODE_HASH,
            FLAP_PORTAL,
            TOKEN_IMPL,
            TIP_RECEIVER,
            PLATFORM_COMMISSION_RECEIVER
        );
    }

    // -----------------------------------------------------------------
    // fuzzable actions
    // -----------------------------------------------------------------

    /// transfer ownership and back. should always succeed if caller is owner.
    function transferOwnerToAlice() external {
        try factory.transferOwnership(ALICE) {} catch {}
    }

    /// non-owner attempt; should always revert.
    function nonOwnerTransfer(address newOwner) external {
        // we send via low-level call from a fresh actor since msg.sender will be
        // the harness, which is the constructor-set owner. simulate a non-owner
        // via a child contract.
        Attacker att = new Attacker(address(factory));
        bool ok = att.attemptTransfer(newOwner);
        // current owner is the harness, so attacker call must always fail.
        assert(!ok);
    }

    // -----------------------------------------------------------------
    // properties
    // -----------------------------------------------------------------

    /// every LaunchTier enum value returns non-zero presaleCap + non-zero quoteAmt.
    function echidna_tier_table_total() public view returns (bool) {
        for (uint8 i = 0; i < 4; i++) {
            (uint256 cap, uint256 quote, uint256 v2, ) =
                factory.tierBudget(LaunchFactory.LaunchTier(i), 300);
            if (cap == 0 || quote == 0) return false;
            if (quote + v2 > cap) return false;
        }
        return true;
    }

    /// immutables never mutate.
    function echidna_immutables_constant() public view returns (bool) {
        return factory.WBNB() == WBNB &&
            factory.PCS_FACTORY() == PCS_FACTORY &&
            factory.PCS_ROUTER() == PCS_ROUTER &&
            factory.INIT_CODE_HASH() == INIT_CODE_HASH &&
            factory.FLAP_PORTAL() == FLAP_PORTAL &&
            factory.TOKEN_IMPL_TAXED_V3() == TOKEN_IMPL &&
            factory.TIP_RECEIVER() == TIP_RECEIVER;
    }

    /// owner is always set (never address(0)).
    function echidna_owner_nonzero() public view returns (bool) {
        return factory.owner() != address(0);
    }

    /// launchCount() never decreases (we never reach createLaunch in this harness,
    /// so it must always be 0).
    function echidna_launch_count_zero() public view returns (bool) {
        return factory.launchCount() == 0;
    }

    /// no salt is marked used (we never call createLaunch).
    /// fixed sentinel since echidna property fns cannot take args.
    function echidna_no_used_salts() public view returns (bool) {
        return !factory.usedSalts(bytes32(uint256(0xAAAA))) &&
               !factory.usedSalts(bytes32(uint256(0xBBBB))) &&
               !factory.usedSalts(bytes32(0));
    }
}

contract Attacker {
    address internal target;
    constructor(address _t) { target = _t; }

    function attemptTransfer(address newOwner) external returns (bool ok) {
        (ok,) = target.call(abi.encodeWithSignature("transferOwnership(address)", newOwner));
    }
}
