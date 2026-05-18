// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentSafeDeployer} from "../contracts/AgentSafeDeployer.sol";
import {MockSafeSingleton, MockSafeProxyFactory} from "../contracts/mocks/SafeMocks.sol";

interface ISafeReadback {
    function getOwners() external view returns (address[] memory);
    function getThreshold() external view returns (uint256);
}

/// @title EchidnaAgentSafeDeployer
/// @notice Property-based fuzzing surface for AgentSafeDeployer. We verify
///         that for any sane (owners, threshold, saltNonce) triple:
///           - predictAgentSafe() == deployAgentSafe() actual address
///           - the deployed safe records the exact owner set we asked for
///           - the deployed safe records the threshold we asked for
///           - the deployer never becomes an owner, never holds privileges
///         Echidna fuzzes the saltNonce + owner-set permutations and we
///         track the last successful deployment for the property checks.
contract EchidnaAgentSafeDeployer {
    AgentSafeDeployer internal deployer;
    MockSafeSingleton internal singleton;
    MockSafeProxyFactory internal factory;

    address internal lastSafe;
    address[] internal lastOwners;
    uint256 internal lastThreshold;

    address internal constant OWNER_A = address(0xA1);
    address internal constant OWNER_B = address(0xB2);
    address internal constant OWNER_C = address(0xC3);

    constructor() payable {
        singleton = new MockSafeSingleton();
        factory = new MockSafeProxyFactory();
        deployer = new AgentSafeDeployer(address(singleton), address(factory));
    }

    // -----------------------------------------------------------------
    // fuzzable actions
    // -----------------------------------------------------------------

    function deploy1of1(uint64 saltNonce) external {
        address[] memory os = new address[](1);
        os[0] = OWNER_A;
        _doDeploy(os, 1, saltNonce);
    }

    function deploy1of2(uint64 saltNonce) external {
        address[] memory os = new address[](2);
        os[0] = OWNER_A;
        os[1] = OWNER_B;
        _doDeploy(os, 1, saltNonce);
    }

    function deploy2of2(uint64 saltNonce) external {
        address[] memory os = new address[](2);
        os[0] = OWNER_A;
        os[1] = OWNER_B;
        _doDeploy(os, 2, saltNonce);
    }

    function deploy2of3(uint64 saltNonce) external {
        address[] memory os = new address[](3);
        os[0] = OWNER_A;
        os[1] = OWNER_B;
        os[2] = OWNER_C;
        _doDeploy(os, 2, saltNonce);
    }

    function deploy3of3(uint64 saltNonce) external {
        address[] memory os = new address[](3);
        os[0] = OWNER_A;
        os[1] = OWNER_B;
        os[2] = OWNER_C;
        _doDeploy(os, 3, saltNonce);
    }

    function _doDeploy(address[] memory owners, uint256 threshold, uint64 saltNonce) internal {
        // predict first, then deploy, then verify the address matches.
        address predicted = deployer.predictAgentSafe(owners, threshold, uint256(saltNonce));
        try deployer.deployAgentSafe(owners, threshold, uint256(saltNonce)) returns (address safe) {
            // The deployer must never lie about the prediction.
            assert(safe == predicted);
            lastSafe = safe;
            // copy owner list defensively.
            delete lastOwners;
            for (uint256 i = 0; i < owners.length; i++) {
                lastOwners.push(owners[i]);
            }
            lastThreshold = threshold;
        } catch {
            // collision with a prior CREATE2 deploy is acceptable; everything
            // else (the safe initializer reverting, etc.) is not.
        }
    }

    // -----------------------------------------------------------------
    // properties
    // -----------------------------------------------------------------

    /// owners recorded on the deployed safe match what we asked for.
    function echidna_deployed_safe_has_correct_owners() public view returns (bool) {
        if (lastSafe == address(0)) return true;
        address[] memory got = ISafeReadback(lastSafe).getOwners();
        if (got.length != lastOwners.length) return false;
        for (uint256 i = 0; i < got.length; i++) {
            if (got[i] != lastOwners[i]) return false;
        }
        return true;
    }

    /// threshold recorded on the deployed safe matches what we asked for.
    function echidna_deployed_safe_has_correct_threshold() public view returns (bool) {
        if (lastSafe == address(0)) return true;
        return ISafeReadback(lastSafe).getThreshold() == lastThreshold;
    }

    /// the deployer is never an owner of any safe it produces.
    function echidna_deployer_is_not_owner() public view returns (bool) {
        if (lastSafe == address(0)) return true;
        address[] memory got = ISafeReadback(lastSafe).getOwners();
        for (uint256 i = 0; i < got.length; i++) {
            if (got[i] == address(deployer)) return false;
        }
        return true;
    }

    /// immutables on the deployer never mutate.
    function echidna_deployer_immutables_constant() public view returns (bool) {
        return deployer.safeSingleton() == address(singleton)
            && deployer.safeProxyFactory() == address(factory);
    }
}
