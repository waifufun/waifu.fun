// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BundleRouter} from "../contracts/BundleRouter.sol";

/// @title EchidnaBundleRouter
/// @notice property surface for BundleRouter constants + access control.
///         the full executeBundle path requires Flap Portal + PCS V2 mocks
///         and is already covered by the 26 e2e bundle tests + 29 adversarial
///         stress tests. this harness focuses on what Echidna can falsify
///         without external infra:
///           - immutable constancy
///           - executed flag is single-shot (we cannot reach true in this
///             harness since executeBundle has no mocked deps; so the
///             invariant is "executed stays false")
///           - non-bundleBot callers cannot flip executed
contract EchidnaBundleRouter {
    BundleRouter internal router;

    address internal constant FACTORY = address(0x0001);
    address internal constant WBNB = address(0x0010);
    address internal constant PCS_FACTORY = address(0x0020);
    address internal constant PCS_ROUTER = address(0x0030);
    address internal constant FLAP_PORTAL = address(0x0040);
    address internal constant TIP_RECEIVER = address(0x0050);
    address internal constant VAULT = address(0x0060);
    address internal constant TREASURY_LP = address(0x0070);
    address internal constant BUNDLE_BOT = address(0x0080);
    address internal constant PREDICTED_TOKEN = address(0x7777);
    address internal constant CREATOR = address(0x0090);

    uint256 internal constant PRESALE_CAP = 32 ether;
    uint256 internal constant QUOTE_AMT = 20 ether;
    uint256 internal constant V2_BUY = 12 ether;
    bytes32 internal constant LAUNCH_PARAMS_HASH = keccak256("echidna-launch-params");

    constructor() payable {
        BundleRouter.ConstructorArgs memory a = BundleRouter.ConstructorArgs({
            factory: FACTORY,
            wbnb: WBNB,
            pcsFactory: PCS_FACTORY,
            pcsRouter: PCS_ROUTER,
            flapPortal: FLAP_PORTAL,
            tipReceiver: TIP_RECEIVER,
            vault: payable(VAULT),
            treasuryLp: TREASURY_LP,
            bundleBot: BUNDLE_BOT,
            predictedToken: PREDICTED_TOKEN,
            creator: CREATOR,
            noBurn: false,
            presaleCap: PRESALE_CAP,
            quoteAmt: QUOTE_AMT,
            v2BuyBnb: V2_BUY,
            closeTimestamp: block.timestamp + 7 days,
            launchParamsHash: LAUNCH_PARAMS_HASH
        });
        router = new BundleRouter(a);
    }

    // -----------------------------------------------------------------
    // fuzzable actions
    // -----------------------------------------------------------------

    /// any non-bundleBot caller (us) should never be able to execute the
    /// bundle. we don't pass real params because the very first check is
    /// msg.sender == bundleBot, which will revert before any deeper logic.
    function tryExecuteAsHarness(uint256 tip, uint256 deadline) public {
        BundleRouter.BundleExecParams memory p = BundleRouter.BundleExecParams({
            vanitySalt: bytes32(uint256(0xABCD)),
            name: "Test",
            symbol: "TST",
            meta: "ipfs://Q",
            buyTaxBps: 300,
            sellTaxBps: 300,
            taxDuration: 365 days,
            antiFarmerDuration: 1 hours,
            commissionReceiver: address(0x1),
            tipBnb: tip,
            deadline: deadline
        });
        // expected: revert NotBundleBot. catch swallows.
        try router.executeBundle(p) {
            // if this returned success, the access guard is broken.
            assert(false);
        } catch {
            // ok
        }
    }

    // -----------------------------------------------------------------
    // properties
    // -----------------------------------------------------------------

    /// executed flag never flips from false (we never reach a successful bundle).
    function echidna_executed_false() public view returns (bool) {
        return !router.executed();
    }

    /// immutables are stable.
    function echidna_immutables_stable() public view returns (bool) {
        return router.factory() == FACTORY && router.WBNB() == WBNB && router.PCS_FACTORY() == PCS_FACTORY
            && router.PCS_ROUTER() == PCS_ROUTER && router.FLAP_PORTAL() == FLAP_PORTAL
            && router.TIP_RECEIVER() == TIP_RECEIVER && router.vault() == payable(VAULT)
            && router.treasuryLp() == TREASURY_LP && router.bundleBot() == BUNDLE_BOT
            && router.predictedToken() == PREDICTED_TOKEN && router.creator() == CREATOR
            && router.presaleCap() == PRESALE_CAP && router.quoteAmt() == QUOTE_AMT && router.v2BuyBnb() == V2_BUY
            && router.launchParamsHash() == LAUNCH_PARAMS_HASH;
    }

    /// extra public action so echidna has >1 callable function (avoids
    /// a known Echidna 2.3.x Set.elemAt crash on single-action ABIs).
    function noop(uint256 x) public pure returns (uint256) {
        return x + 1;
    }

    function pingExecuted() public view returns (bool) {
        return router.executed();
    }

    /// the DEAD constant is the standard burn address.
    function echidna_dead_constant() public view returns (bool) {
        return router.DEAD() == 0x000000000000000000000000000000000000dEaD;
    }
}
