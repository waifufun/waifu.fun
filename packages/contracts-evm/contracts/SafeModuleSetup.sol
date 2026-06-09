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

struct RolesConditionFlat {
    uint8 parent;
    uint8 paramType;
    uint8 operator;
    bytes compValue;
}

/// @title SafeModuleSetup
/// @notice Delegatecall helper intended for Safe.setup(to,data). It deploys a
///         Zodiac Roles-compatible module with the Safe as owner/avatar/target,
///         validates and applies the launch role configuration calldata, and
///         writes the Safe module linked-list storage before the Safe leaves setup.
/// @dev    This helper must ONLY be used via Safe.setup delegatecall. The
///         storage layout mirrors Safe v1.4.x ModuleManager's module mapping
///         position after the Singleton slot. Role configuration calls are still
///         encoded off-chain, but every call is checked against the launch's
///         declared agent EOA and the constrained waifu Roles v2 template before
///         it is executed with Safe-owner authority.
contract SafeModuleSetup {
    address internal singleton;
    mapping(address => address) internal modules;

    address internal constant SENTINEL_MODULES = address(0x1);
    bytes32 public constant AGENT_ROLE = keccak256("waifu.agent.default-role");
    uint256 internal constant MAX_ROLE_CONFIG_CALLS = 128;

    bytes4 internal constant ASSIGN_ROLES_SELECTOR = bytes4(keccak256("assignRoles(address,bytes32[],bool[])"));
    bytes4 internal constant SCOPE_TARGET_SELECTOR = bytes4(keccak256("scopeTarget(bytes32,address)"));
    bytes4 internal constant SCOPE_FUNCTION_SELECTOR =
        bytes4(keccak256("scopeFunction(bytes32,address,bytes4,(uint8,uint8,uint8,bytes)[],uint8)"));
    bytes4 internal constant SET_ALLOWANCE_SELECTOR =
        bytes4(keccak256("setAllowance(bytes32,uint128,uint128,uint128,uint64,uint64)"));

    uint8 internal constant EXECUTION_OPTIONS_NONE = 0;

    event RolesModuleDeployedAndEnabled(address indexed rolesModifier, bytes32 role);

    error InvalidModule();
    error ModuleAlreadyEnabled();
    error InvalidRolesFactory();
    error InvalidRolesMastercopy();
    error InvalidAgentEoa();
    error InvalidRoleConfig(uint256 index);
    error UnsafeRoleConfig(uint256 index);
    error RoleConfigCallFailed(uint256 index);

    function deployAndEnableRoles(
        address rolesFactory,
        address rolesMastercopy,
        uint256 rolesSaltNonce,
        address agentEoa,
        bytes[] calldata roleConfigCalls
    ) external returns (address rolesModifier) {
        if (rolesFactory == address(0)) revert InvalidRolesFactory();
        if (rolesMastercopy == address(0)) revert InvalidRolesMastercopy();
        if (agentEoa == address(0) && roleConfigCalls.length != 0) revert InvalidAgentEoa();
        rolesModifier = ISafeModuleSetupRolesFactory(rolesFactory).deployModule(
            rolesMastercopy,
            _encodeRolesSetup(address(this), address(this), address(this)),
            rolesSaltNonce
        );
        _applyRoleConfig(rolesModifier, agentEoa, roleConfigCalls);
        _enableModule(rolesModifier);

        emit RolesModuleDeployedAndEnabled(rolesModifier, AGENT_ROLE);
    }

    function _applyRoleConfig(address rolesModifier, address agentEoa, bytes[] calldata roleConfigCalls) internal {
        uint256 nCalls = roleConfigCalls.length;
        if (nCalls > MAX_ROLE_CONFIG_CALLS) revert InvalidRoleConfig(type(uint256).max);
        bool assignedAgent;
        for (uint256 i = 0; i < nCalls; ++i) {
            bool sawAssign = _validateRoleConfigCall(i, rolesModifier, agentEoa, roleConfigCalls[i]);
            if (sawAssign) {
                if (assignedAgent) revert InvalidRoleConfig(i);
                assignedAgent = true;
            }
            (bool ok, ) = rolesModifier.call(roleConfigCalls[i]);
            if (!ok) revert RoleConfigCallFailed(i);
        }
        if (agentEoa != address(0) && !assignedAgent) revert InvalidAgentEoa();
    }

    function _validateRoleConfigCall(
        uint256 index,
        address rolesModifier,
        address agentEoa,
        bytes calldata callData
    ) internal view returns (bool sawAssign) {
        if (callData.length < 4) revert InvalidRoleConfig(index);
        bytes4 selector = bytes4(callData[:4]);

        if (selector == ASSIGN_ROLES_SELECTOR) {
            (address module, bytes32[] memory roleKeys, bool[] memory memberOf) =
                abi.decode(callData[4:], (address, bytes32[], bool[]));
            if (agentEoa == address(0) || module != agentEoa) revert UnsafeRoleConfig(index);
            if (roleKeys.length == 0 || roleKeys.length != memberOf.length) revert InvalidRoleConfig(index);
            for (uint256 j = 0; j < roleKeys.length; ++j) {
                if (roleKeys[j] != AGENT_ROLE || !memberOf[j]) revert UnsafeRoleConfig(index);
            }
            return true;
        }

        if (selector == SCOPE_TARGET_SELECTOR) {
            // scopeTarget is target-wide in Roles v2 and can bypass selector-level
            // checks. Permissionless launch configs must use explicit
            // scopeFunction entries only.
            revert UnsafeRoleConfig(index);
        }

        if (selector == SCOPE_FUNCTION_SELECTOR) {
            (
                bytes32 roleKey,
                address targetAddress,
                bytes4 functionSig,
                RolesConditionFlat[] memory conditions,
                uint8 executionOptions
            ) = abi.decode(callData[4:], (bytes32, address, bytes4, RolesConditionFlat[], uint8));
            if (roleKey != AGENT_ROLE) revert UnsafeRoleConfig(index);
            _validateScopeTarget(index, rolesModifier, targetAddress);
            if (!_isAllowedDefaultScope(targetAddress, functionSig)) revert UnsafeRoleConfig(index);
            // Permissionless launches never get Safe-value sends, delegatecalls,
            // or direct token/withdraw/swap capabilities from raw creator calldata.
            // Those fund-moving policies must be added later through audited typed
            // configuration or explicit Safe-owner consent, not by launch creator input.
            conditions;
            if (executionOptions != EXECUTION_OPTIONS_NONE) revert UnsafeRoleConfig(index);
            if (_isFundMovingSelector(functionSig)) revert UnsafeRoleConfig(index);
            return false;
        }

        if (selector == SET_ALLOWANCE_SELECTOR) {
            // Raw permissionless launch calldata may not mutate Roles allowance
            // accounting. Launch defaults do not require allowances because
            // Safe-value sends are disabled at setup.
            revert UnsafeRoleConfig(index);
        }

        revert UnsafeRoleConfig(index);
    }

    function _isAllowedDefaultScope(address targetAddress, bytes4 selector) internal pure returns (bool) {
        return (targetAddress == 0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997 && selector == 0xc6a5026a) // Pancake V3 Quoter quoteExactInputSingle
            || (targetAddress == 0x95c78222B3D6e262426483D42CfA53685A67Ab9D && selector == 0xa0712d68) // Venus vBUSD mint(uint256)
            || (targetAddress == 0xfD5840Cd36d94D7229439859C0112a4185BC0255 && selector == 0xa0712d68) // Venus vUSDT mint(uint256)
            || (targetAddress == 0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8 && selector == 0xa0712d68) // Venus vUSDC mint(uint256)
            || (targetAddress == 0xf508FcBf6DaBa4772C7d9E7F6c39Fc6A14Cb60b5 && selector == 0xa0712d68) // Venus vETH mint(uint256)
            || (targetAddress == 0xA07c5b74C9B40447a954e1466938b865b6BBea36 && selector == 0x0e752702) // Venus vBNB repayBorrow()
            || (targetAddress == 0x95c78222B3D6e262426483D42CfA53685A67Ab9D && selector == 0x0e752702) // Venus vBUSD repayBorrow(uint256)
            || (targetAddress == 0xfD5840Cd36d94D7229439859C0112a4185BC0255 && selector == 0x0e752702) // Venus vUSDT repayBorrow(uint256)
            || (targetAddress == 0xecA88125a5ADbe82614ffC12D0DB554E2e2867C8 && selector == 0x0e752702) // Venus vUSDC repayBorrow(uint256)
            || (targetAddress == 0xf508FcBf6DaBa4772C7d9E7F6c39Fc6A14Cb60b5 && selector == 0x0e752702) // Venus vETH repayBorrow(uint256)
            || (targetAddress == 0xfD36E2c2a6789Db23113685031d7F16329158384 && selector == 0xc2998238); // Venus Comptroller enterMarkets
    }

    function _validateScopeTarget(uint256 index, address rolesModifier, address targetAddress) internal view {
        if (targetAddress == address(0)) revert InvalidRoleConfig(index);
        if (targetAddress == rolesModifier || targetAddress == address(this)) revert UnsafeRoleConfig(index);
    }

    function _isFundMovingSelector(bytes4 selector) internal pure returns (bool) {
        return selector == 0xa9059cbb // transfer(address,uint256)
            || selector == 0x23b872dd // transferFrom(address,address,uint256)
            || selector == 0x095ea7b3 // approve(address,uint256)
            || selector == 0x39509351 // increaseAllowance(address,uint256)
            || selector == 0xa457c2d7 // decreaseAllowance(address,uint256)
            || selector == 0xd505accf // permit(address,address,uint256,uint256,uint8,bytes32,bytes32)
            || selector == 0x3ccfd60b // withdraw()
            || selector == 0x2e1a7d4d // withdraw(uint256)
            || selector == 0x24600fc3 // withdrawFunds()
            || selector == 0xb60d4288 // legacy/mock withdraw-like selector used by tests
            || selector == 0x38ed1739 // swapExactTokensForTokens(uint256,uint256,address[],address,uint256)
            || selector == 0x7ff36ab5 // swapExactETHForTokens(uint256,address[],address,uint256)
            || selector == 0x18cbafe5 // swapExactTokensForETH(uint256,uint256,address[],address,uint256)
            || selector == 0x8803dbee // swapTokensForExactTokens(uint256,uint256,address[],address,uint256)
            || selector == 0xfb3bdb41 // swapETHForExactTokens(uint256,address[],address,uint256)
            || selector == 0x4a25d94a // swapTokensForExactETH(uint256,uint256,address[],address,uint256)
            || selector == 0x04e45aaf // exactInputSingle(...)
            || selector == 0xb858183f // exactInput(...)
            || selector == 0x5023b4df // exactOutputSingle(...)
            || selector == 0x09b81346; // exactOutput(...)
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
