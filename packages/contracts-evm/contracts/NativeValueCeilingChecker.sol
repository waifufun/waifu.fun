// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// slither-disable-start naming-convention

/**
 * @dev Operation enum mirrored from `@gnosis-guild/zodiac-core` (Enum.Operation).
 *      Re-declared locally so this checker has no external Solidity dependency
 *      and compiles standalone under the waifu.fun contracts-evm toolchain.
 *      Values MUST match the canonical enum: 0 = Call, 1 = DelegateCall.
 */
enum Operation {
    Call,
    DelegateCall
}

/**
 * @title ICustomCondition
 * @notice Interface a Zodiac Roles v2 `Custom` (operator 22) condition checker
 *         must implement. The Roles `PermissionChecker._custom` path decodes the
 *         condition `compValue` as `abi.encodePacked(address checker, bytes12 extra)`:
 *         the leading 20 bytes select this contract, and the trailing 12 bytes are
 *         forwarded as `extra`. The checker is invoked once per scoped call with the
 *         transaction's native `value` and returns `(true, _)` to allow or
 *         `(false, reason)` to block (surfacing as `Status.CustomConditionViolation`).
 * @dev    Signature is byte-for-byte identical to
 *         gnosisguild/zodiac-modifier-roles periphery/Types.sol::ICustomCondition.
 */
interface ICustomCondition {
    function check(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        uint256 location,
        uint256 size,
        bytes12 extra
    ) external view returns (bool success, bytes32 reason);
}

/**
 * @title NativeValueCeilingChecker
 * @author waifu.fun
 * @notice Stateless Zodiac Roles v2 `Custom` condition checker that enforces a
 *         per-call native-value ceiling. Roles v2 ships no native
 *         `context.value <= cap` operator, so the agent-actions encoder
 *         (`roles-v2-encoder.ts`) emits a `Custom` condition whose `compValue` is
 *         `abi.encodePacked(address(this), bytes12(uint96(cap)))`. The Roles
 *         module forwards the trailing 12 bytes as `extra` (the uint96 cap, wei)
 *         and the call's actual native value as `value`.
 *
 *         A call is allowed iff `value <= cap`. Above-cap calls return
 *         `(false, ...)`, which the Roles `PermissionChecker` maps to
 *         `Status.CustomConditionViolation`, reverting the gated transaction.
 *
 * @dev    SECURITY / DESIGN NOTES
 *         - Stateless and immutable: no storage, no owner, no upgrade path. A
 *           single deployment can back every agent Safe's per-tx ceiling; the
 *           cap is carried inline per-condition via `extra`, never stored here.
 *         - The cap is encoded as `bytes12` (uint96, max ~7.9e28 wei). The encoder
 *           asserts `cap <= type(uint96).max` before packing, so no truncation can
 *           occur on the producing side; this checker additionally treats the full
 *           12-byte `extra` as the cap with no further interpretation.
 *         - DelegateCall is rejected: a per-tx native-value ceiling is meaningless
 *           for delegatecalls (they execute in the avatar's context and can move
 *           the avatar's entire balance regardless of the forwarded `value`).
 *           Rejecting them is fail-closed and matches the encoder's intent of
 *           scoping plain value-bearing calls only.
 *         - Ignores `to`, `data`, `location`, `size`: the ceiling constrains the
 *           native `value` of the call exclusively, independent of calldata shape.
 */
contract NativeValueCeilingChecker is ICustomCondition {
    /// @dev Returned as the `reason` when a call's native value exceeds the cap.
    bytes32 public constant VALUE_CEILING_EXCEEDED = bytes32("NativeValueCeilingExceeded");

    /// @dev Returned as the `reason` when a delegatecall is rejected.
    bytes32 public constant DELEGATECALL_REJECTED = bytes32("NativeValueCeilingNoDelegate");

    /**
     * @inheritdoc ICustomCondition
     * @dev Allows the call iff it is a plain `Call` whose native `value` is less
     *      than or equal to the ceiling encoded in `extra` (uint96 wei). Pure: the
     *      verdict depends only on `value`, `operation` and `extra`.
     */
    function check(
        address /* to */,
        uint256 value,
        bytes calldata /* data */,
        Operation operation,
        uint256 /* location */,
        uint256 /* size */,
        bytes12 extra
    ) external pure override returns (bool success, bytes32 reason) {
        // A per-call value ceiling only makes sense for plain calls. Delegatecalls
        // execute in the avatar's storage/balance context and are fail-closed here.
        if (operation != Operation.Call) {
            return (false, DELEGATECALL_REJECTED);
        }

        uint256 cap = uint256(uint96(extra));
        if (value <= cap) {
            return (true, bytes32(0));
        }
        return (false, VALUE_CEILING_EXCEEDED);
    }
}

// slither-disable-end naming-convention
