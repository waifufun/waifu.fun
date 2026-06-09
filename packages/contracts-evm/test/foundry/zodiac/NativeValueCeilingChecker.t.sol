// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NativeValueCeilingChecker, ICustomCondition, Operation} from "../../../contracts/NativeValueCeilingChecker.sol";

/// @notice Unit tests for the ICustomCondition checker logic in isolation. These
///         exercise the exact `check(...)` calldata shape the Roles v2
///         PermissionChecker._custom path produces (value + bytes12 extra cap),
///         independent of any fork. The fork test
///         (NativeValueCeilingFork.t.sol) proves the same guarantee through the
///         REAL deployed Roles module.
contract NativeValueCeilingCheckerTest is Test {
    NativeValueCeilingChecker internal checker;

    function setUp() public {
        checker = new NativeValueCeilingChecker();
    }

    function _check(uint256 value, uint96 cap, Operation op) internal view returns (bool ok, bytes32 reason) {
        (ok, reason) = checker.check(
            address(0xBEEF), // to (ignored)
            value,
            hex"deadbeef", // data (ignored)
            op,
            0, // location (ignored)
            0, // size (ignored)
            bytes12(cap)
        );
    }

    function test_belowCap_allowed() public view {
        (bool ok, bytes32 reason) = _check(0.5 ether, 1 ether, Operation.Call);
        assertTrue(ok, "below cap should pass");
        assertEq(reason, bytes32(0));
    }

    function test_atCap_allowed() public view {
        (bool ok, ) = _check(1 ether, 1 ether, Operation.Call);
        assertTrue(ok, "value == cap should pass (<=)");
    }

    function test_oneWeiOverCap_rejected() public view {
        (bool ok, bytes32 reason) = _check(1 ether + 1, 1 ether, Operation.Call);
        assertFalse(ok, "one wei over cap must be rejected");
        assertEq(reason, checker.VALUE_CEILING_EXCEEDED());
    }

    function test_zeroCap_onlyZeroValueAllowed() public view {
        (bool okZero, ) = _check(0, 0, Operation.Call);
        assertTrue(okZero, "zero value under zero cap passes");
        (bool okOne, ) = _check(1, 0, Operation.Call);
        assertFalse(okOne, "any positive value under zero cap is rejected");
    }

    function test_maxCap_allowsUpToUint96Max() public view {
        uint96 maxCap = type(uint96).max;
        (bool okAt, ) = _check(uint256(maxCap), maxCap, Operation.Call);
        assertTrue(okAt, "value == uint96 max cap passes");
        (bool okOver, ) = _check(uint256(maxCap) + 1, maxCap, Operation.Call);
        assertFalse(okOver, "value above uint96 max cap is rejected");
    }

    function test_delegateCall_alwaysRejected() public view {
        // Even a zero-value delegatecall is fail-closed: a per-call native ceiling
        // is meaningless for delegatecalls (avatar-context balance movement).
        (bool okZero, bytes32 reason) = _check(0, 1 ether, Operation.DelegateCall);
        assertFalse(okZero, "delegatecall must be rejected regardless of value");
        assertEq(reason, checker.DELEGATECALL_REJECTED());
        (bool okUnder, ) = _check(0.1 ether, 1 ether, Operation.DelegateCall);
        assertFalse(okUnder, "under-cap delegatecall still rejected");
    }

    /// @dev Fuzz: for any cap and value on a plain Call, allow iff value <= cap.
    function testFuzz_callCeilingIsExact(uint96 cap, uint256 value) public view {
        (bool ok, ) = _check(value, cap, Operation.Call);
        assertEq(ok, value <= uint256(cap), "Call allowed iff value <= cap");
    }

    /// @dev The checker is stateless/pure: identical inputs always agree.
    function testFuzz_deterministic(uint96 cap, uint256 value) public view {
        (bool a, bytes32 ra) = _check(value, cap, Operation.Call);
        (bool b, bytes32 rb) = _check(value, cap, Operation.Call);
        assertEq(a, b);
        assertEq(ra, rb);
    }
}
