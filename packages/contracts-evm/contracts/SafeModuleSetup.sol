// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISafeModuleSetupRolesFactory {
    function deployModule(
        address mastercopy,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (address module);
}

interface ISafeModuleSetupRolesModifier {
    function setUp(bytes memory initParams) external;
}

/// @title SafeModuleSetup
/// @notice Delegatecall helper intended for Safe.setup(to,data). It deploys a
///         Zodiac Roles-compatible module with the Safe as owner/avatar/target,
///         applies caller-supplied role configuration calldata, and writes the
///         Safe module linked-list storage before the Safe leaves setup.
/// @dev    This helper must ONLY be used via Safe.setup delegatecall. The
///         storage layout mirrors Safe v1.4.x ModuleManager's module mapping
///         position after the Singleton slot. Role configuration calls are raw
///         calldata so the off-chain agent-actions encoder can track the exact
///         canonical Roles v2 ABI without hardcoding a stale ABI here.
contract SafeModuleSetup {
    address internal singleton;
    mapping(address => address) internal modules;

    address internal constant SENTINEL_MODULES = address(0x1);
    bytes32 public constant AGENT_ROLE = keccak256("waifu.agent.default-role");

    event RolesModuleDeployedAndEnabled(address indexed rolesModifier, bytes32 role);

    error InvalidModule();
    error ModuleAlreadyEnabled();
    error InvalidRolesFactory();
    error InvalidRolesMastercopy();
    error RoleConfigCallFailed(uint256 index);

    function deployAndEnableRoles(
        address rolesFactory,
        address rolesMastercopy,
        uint256 rolesSaltNonce,
        bytes[] calldata roleConfigCalls
    ) external returns (address rolesModifier) {
        if (rolesFactory == address(0)) revert InvalidRolesFactory();
        if (rolesMastercopy == address(0)) revert InvalidRolesMastercopy();
        rolesModifier = ISafeModuleSetupRolesFactory(rolesFactory).deployModule(
            rolesMastercopy,
            _encodeRolesSetup(address(this), address(this), address(this)),
            rolesSaltNonce
        );
        _applyRoleConfig(rolesModifier, roleConfigCalls);
        _enableModule(rolesModifier);

        emit RolesModuleDeployedAndEnabled(rolesModifier, AGENT_ROLE);
    }

    function _applyRoleConfig(address rolesModifier, bytes[] calldata roleConfigCalls) internal {
        uint256 nCalls = roleConfigCalls.length;
        for (uint256 i = 0; i < nCalls; ++i) {
            (bool ok, ) = rolesModifier.call(roleConfigCalls[i]);
            if (!ok) revert RoleConfigCallFailed(i);
        }
    }

    function _enableModule(address module) internal {
        if (module == address(0) || module == SENTINEL_MODULES) revert InvalidModule();
        if (modules[module] != address(0)) revert ModuleAlreadyEnabled();

        modules[module] = modules[SENTINEL_MODULES];
        modules[SENTINEL_MODULES] = module;
    }

    function _encodeRolesSetup(
        address owner,
        address avatar,
        address target
    ) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(
            ISafeModuleSetupRolesModifier.setUp.selector,
            abi.encode(owner, avatar, target)
        );
    }
}
