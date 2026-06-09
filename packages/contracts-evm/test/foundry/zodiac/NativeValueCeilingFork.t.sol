// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {NativeValueCeilingChecker, Operation} from "../../../contracts/NativeValueCeilingChecker.sol";

/*//////////////////////////////////////////////////////////////
            Minimal interfaces to the DEPLOYED Roles v2
//////////////////////////////////////////////////////////////*/

/// @dev Zodiac ModuleProxyFactory deployed canonically on BSC.
interface IModuleProxyFactory {
    function deployModule(
        address masterCopy,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (address proxy);
}

/// @dev ConditionFlat mirrors Roles v2 `Types.sol`:
///      (uint8 parent, uint8 paramType, uint8 operator, bytes compValue).
struct ConditionFlat {
    uint8 parent;
    uint8 paramType;
    uint8 operator;
    bytes compValue;
}

/// @dev Roles v2 surface we exercise. `Operation` is shared with the checker
///      (Call = 0, DelegateCall = 1).
interface IRolesV2 {
    function setUp(bytes memory initParams) external;

    function owner() external view returns (address);

    function assignRoles(address module, bytes32[] calldata roleKeys, bool[] calldata memberOf) external;

    function scopeTarget(bytes32 roleKey, address targetAddress) external;

    function allowFunction(bytes32 roleKey, address targetAddress, bytes4 selector, uint8 options) external;

    function scopeFunction(
        bytes32 roleKey,
        address targetAddress,
        bytes4 selector,
        ConditionFlat[] memory conditions,
        uint8 options
    ) external;

    function execTransactionWithRole(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        bytes32 roleKey,
        bool shouldRevert
    ) external returns (bool success);
}

/*//////////////////////////////////////////////////////////////
                    Test fixtures (avatar + sink)
//////////////////////////////////////////////////////////////*/

/// @dev Minimal Safe-like avatar: the Roles module's `exec` calls
///      `execTransactionFromModule` on the avatar/target. We forward the call
///      (carrying native value) so the ceiling governs a real value-bearing call.
contract MockAvatar {
    error NotEnabledModule();

    address public module;

    function enableModule(address module_) external {
        module = module_;
    }

    receive() external payable {}

    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 /* operation */
    ) external returns (bool success) {
        if (msg.sender != module) revert NotEnabledModule();
        (success, ) = to.call{value: value}(data);
    }
}

/// @dev Sink standing in for an agent-actions target.
///      - drip()    : value-bearing action gated by the per-tx ceiling
///      - ping()    : unconstrained-but-scoped action (the "allowed" call)
///      - withdraw(): NEVER scoped (gated action that must revert NotAllowed)
contract PayableSink {
    uint256 public lastValue;
    uint256 public dripCount;
    uint256 public pingCount;
    uint256 public withdrawCount;

    function drip() external payable {
        lastValue = msg.value;
        unchecked {
            ++dripCount;
        }
    }

    function ping() external {
        unchecked {
            ++pingCount;
        }
    }

    function withdraw() external {
        unchecked {
            ++withdrawCount;
        }
    }
}

/*//////////////////////////////////////////////////////////////
                          The fork test
//////////////////////////////////////////////////////////////*/

/// @notice Proves the agent-EOA guardrails end-to-end through the REAL Zodiac
///         Roles v2 module deployed on BSC mainnet (mastercopy 0x9646fDAD...,
///         canonical ModuleProxyFactory 0x000000000000aDdB...). NO mocks of the
///         Roles module: a fresh proxy of the canonical mastercopy is deployed
///         and configured with the encoder's REAL v2 calldata shape.
///
///         Asserted (matching the audit's (a)-(d)):
///           (a) the agent-scoped allowed call (ping) succeeds,
///           (b) a gated/unscoped call (withdraw) reverts (NotAllowed),
///           (c) value <= cap succeeds, value > cap reverts through the deployed
///               NativeValueCeilingChecker Custom condition,
///           (d) the agent EOA cannot self-escalate: it cannot reach the Roles
///               owner-only functions (assignRoles / scopeFunction).
///
/// Run: FORK_BSC=true FOUNDRY_PROFILE=zodiac forge test \
///        --fork-url $BSC_RPC_URL --match-contract NativeValueCeilingFork -vvv
contract NativeValueCeilingForkTest is Test {
    // Canonical BSC mainnet deployments (see ZODIAC-BSC-ADDRESSES.md).
    address internal constant ROLES_V2_MASTERCOPY = 0x9646fDAD06d3e24444381f44362a3B0eB343D337;
    address internal constant MODULE_PROXY_FACTORY = 0x000000000000aDdB49795b0f9bA5BC298cDda236;

    // Roles v2 enum/operator constants.
    uint8 internal constant PT_NONE = 0;
    uint8 internal constant PT_CALLDATA = 5;
    uint8 internal constant OP_MATCHES = 5;
    uint8 internal constant OP_CUSTOM = 22;
    uint8 internal constant EXEC_NONE = 0; // ExecutionOptions.None
    uint8 internal constant EXEC_SEND = 1; // ExecutionOptions.Send (allow value)

    bytes32 internal constant ROLE_KEY = keccak256("waifu.agent.default-role");
    bytes4 internal constant DRIP_SELECTOR = bytes4(keccak256("drip()"));
    bytes4 internal constant PING_SELECTOR = bytes4(keccak256("ping()"));
    bytes4 internal constant WITHDRAW_SELECTOR = bytes4(keccak256("withdraw()"));

    uint96 internal constant CAP = 1 ether;

    NativeValueCeilingChecker internal checker;
    IRolesV2 internal roles;
    MockAvatar internal avatar;
    PayableSink internal sink;
    address internal owner; // the deployer/owner of the Roles module (this test)

    address internal agent = address(0xA9E27);
    address internal attacker = address(0xBAD);

    function setUp() public {
        // Only meaningful on a BSC fork where the canonical Roles v2 lives.
        // Run with FORK_BSC=true + --fork-url $BSC_RPC_URL (NodeReal recommended;
        // public RPC returns "missing trie node").
        if (block.chainid != 56) {
            vm.skip(true);
            return;
        }
        owner = address(this);

        checker = new NativeValueCeilingChecker();
        avatar = new MockAvatar();
        sink = new PayableSink();
        vm.deal(address(avatar), 100 ether);

        // Deploy a fresh Roles v2 module proxy off the canonical mastercopy.
        // setUp(owner=this, avatar, target=avatar) so this test owns config and
        // the module routes exec through the avatar.
        bytes memory initParams = abi.encode(owner, address(avatar), address(avatar));
        bytes memory initializer = abi.encodeWithSelector(IRolesV2.setUp.selector, initParams);
        address proxy = IModuleProxyFactory(MODULE_PROXY_FACTORY).deployModule(
            ROLES_V2_MASTERCOPY,
            initializer,
            uint256(keccak256("waifu.native-value-ceiling.fork"))
        );
        roles = IRolesV2(proxy);
        avatar.enableModule(proxy);

        // Grant the agent EOA the role.
        bytes32[] memory keys = new bytes32[](1);
        keys[0] = ROLE_KEY;
        bool[] memory member = new bool[](1);
        member[0] = true;
        roles.assignRoles(agent, keys, member);

        // (a) scope ping() as an unconstrained allowed call (wildcarded function).
        roles.scopeTarget(ROLE_KEY, address(sink));
        roles.allowFunction(ROLE_KEY, address(sink), PING_SELECTOR, EXEC_NONE);

        // (c) scope drip() with the canonical Matches(Calldata) root + Custom
        //     ceiling, EXACTLY as the agent-actions encoder emits it.
        roles.scopeFunction(ROLE_KEY, address(sink), DRIP_SELECTOR, _ceilingConditions(CAP), EXEC_SEND);

        // withdraw() is intentionally left UNSCOPED -> must revert (b).
    }

    /// @dev Builds EXACTLY the tree the agent-actions encoder emits for a single
    ///      maxValuePerTx ceiling: Matches(Calldata) root + Custom(None) child
    ///      whose compValue = abi.encodePacked(checker, bytes12(uint96(cap))).
    function _ceilingConditions(uint96 cap) internal view returns (ConditionFlat[] memory conditions) {
        conditions = new ConditionFlat[](2);
        conditions[0] = ConditionFlat({parent: 0, paramType: PT_CALLDATA, operator: OP_MATCHES, compValue: ""});
        conditions[1] = ConditionFlat({
            parent: 0,
            paramType: PT_NONE,
            operator: OP_CUSTOM,
            compValue: abi.encodePacked(address(checker), bytes12(cap))
        });
    }

    function _execAsAgent(
        bytes4 selector,
        uint256 value
    ) internal returns (bool success) {
        vm.prank(agent);
        success = roles.execTransactionWithRole(
            address(sink),
            value,
            abi.encodeWithSelector(selector),
            Operation.Call,
            ROLE_KEY,
            true
        );
    }

    /*//////////////////////////////////////////////////////////////
                       (a) ALLOWED call succeeds
    //////////////////////////////////////////////////////////////*/

    function test_a_allowedCall_ping_succeeds() public {
        bool success = _execAsAgent(PING_SELECTOR, 0);
        assertTrue(success, "scoped ping() should succeed");
        assertEq(sink.pingCount(), 1, "ping executed exactly once");
    }

    /*//////////////////////////////////////////////////////////////
                  (b) GATED / unscoped call reverts
    //////////////////////////////////////////////////////////////*/

    function test_b_gatedCall_withdraw_reverts() public {
        vm.prank(agent);
        vm.expectRevert(); // Roles: FunctionNotAllowed (unscoped selector)
        roles.execTransactionWithRole(
            address(sink),
            0,
            abi.encodeWithSelector(WITHDRAW_SELECTOR),
            Operation.Call,
            ROLE_KEY,
            true
        );
        assertEq(sink.withdrawCount(), 0, "unscoped withdraw must never execute");
    }

    /*//////////////////////////////////////////////////////////////
              (c) native value ceiling via the real checker
    //////////////////////////////////////////////////////////////*/

    function test_c_valueAtCap_passes() public {
        bool success = _execAsAgent(DRIP_SELECTOR, uint256(CAP));
        assertTrue(success, "value == cap should pass");
        assertEq(sink.dripCount(), 1, "drip executed once");
        assertEq(sink.lastValue(), uint256(CAP), "sink received the full capped value");
    }

    function test_c_valueBelowCap_passes() public {
        bool success = _execAsAgent(DRIP_SELECTOR, uint256(CAP) - 1);
        assertTrue(success, "value < cap should pass");
        assertEq(sink.lastValue(), uint256(CAP) - 1);
    }

    function test_c_valueAboveCap_reverts() public {
        vm.prank(agent);
        vm.expectRevert(); // Roles: ConditionViolation(CustomConditionViolation)
        roles.execTransactionWithRole(
            address(sink),
            uint256(CAP) + 1,
            abi.encodeWithSelector(DRIP_SELECTOR),
            Operation.Call,
            ROLE_KEY,
            true
        );
        assertEq(sink.dripCount(), 0, "above-cap call must never execute");
    }

    function test_c_valueFarAboveCap_reverts() public {
        vm.prank(agent);
        vm.expectRevert();
        roles.execTransactionWithRole(
            address(sink),
            uint256(CAP) + 50 ether,
            abi.encodeWithSelector(DRIP_SELECTOR),
            Operation.Call,
            ROLE_KEY,
            true
        );
        assertEq(sink.dripCount(), 0);
    }

    /*//////////////////////////////////////////////////////////////
            (d) agent EOA cannot self-escalate (owner funcs)
    //////////////////////////////////////////////////////////////*/

    function test_d_agentCannotReassignOwnRole() public {
        // The agent is NOT the Roles owner; assignRoles is onlyOwner.
        bytes32[] memory keys = new bytes32[](1);
        keys[0] = ROLE_KEY;
        bool[] memory member = new bool[](1);
        member[0] = true;

        assertTrue(roles.owner() != agent, "agent must not be the Roles owner");

        vm.prank(agent);
        vm.expectRevert(); // Ownable: caller is not the owner
        roles.assignRoles(attacker, keys, member);
    }

    function test_d_agentCannotRescopeToWildcardWithdraw() public {
        // Agent tries to grant itself an unconstrained withdraw() permission.
        vm.prank(agent);
        vm.expectRevert(); // onlyOwner
        roles.allowFunction(ROLE_KEY, address(sink), WITHDRAW_SELECTOR, EXEC_NONE);

        // And confirm withdraw still blocked afterward.
        vm.prank(agent);
        vm.expectRevert();
        roles.execTransactionWithRole(
            address(sink),
            0,
            abi.encodeWithSelector(WITHDRAW_SELECTOR),
            Operation.Call,
            ROLE_KEY,
            true
        );
        assertEq(sink.withdrawCount(), 0);
    }

    function test_d_agentCannotRaiseValueCeiling() public {
        // Agent tries to re-scope drip() with a higher ceiling. onlyOwner blocks it.
        vm.prank(agent);
        vm.expectRevert();
        roles.scopeFunction(ROLE_KEY, address(sink), DRIP_SELECTOR, _ceilingConditions(1000 ether), EXEC_SEND);

        // Ceiling unchanged: an over-cap call still reverts.
        vm.prank(agent);
        vm.expectRevert();
        roles.execTransactionWithRole(
            address(sink),
            uint256(CAP) + 1,
            abi.encodeWithSelector(DRIP_SELECTOR),
            Operation.Call,
            ROLE_KEY,
            true
        );
        assertEq(sink.dripCount(), 0);
    }
}
