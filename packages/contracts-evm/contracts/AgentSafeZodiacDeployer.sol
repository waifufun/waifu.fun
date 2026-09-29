// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SafeModuleSetup} from "./SafeModuleSetup.sol";

interface IAgentSafeZodiacSafeProxyFactory {
    function createProxyWithNonce(
        address singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (address proxy);

    function proxyCreationCode() external pure returns (bytes memory);
}

interface IAgentSafeZodiacModuleFactory {
    function predictModuleAddress(
        address mastercopy,
        bytes memory initializer,
        uint256 saltNonce
    ) external view returns (address module);
}

/// @title AgentSafeZodiacDeployer
/// @notice Experimental AgentSafe deployer that atomically creates a Safe,
///         attaches a Zodiac Roles-compatible module, and applies the initial
///         constrained role configuration for the agent-hot EOA.
/// @dev    This is intentionally additive and not wired into LaunchFactory yet.
///         Mainnet rollout still needs a BSC-verified Roles v2 factory/mastercopy
///         and a fork proof that SafeModuleSetup's storage slot matches the
///         canonical Safe v1.4.1 deployment. Role config is raw calldata so the
///         off-chain agent-actions encoder can own the exact Roles v2 ABI.
contract AgentSafeZodiacDeployer {
    bytes32 public constant AGENT_ROLE = keccak256("waifu.agent.default-role");

    address public immutable safeSingleton;
    address public immutable safeProxyFactory;
    address public immutable rolesFactory;
    address public immutable rolesMastercopy;
    SafeModuleSetup public immutable moduleSetup;

    event AgentSafeWithRolesDeployed(
        address indexed safe,
        address indexed rolesModifier,
        bytes32 role,
        uint256 safeSaltNonce,
        uint256 rolesSaltNonce
    );

    error InvalidSingleton();
    error InvalidProxyFactory();
    error InvalidRolesFactory();
    error InvalidRolesMastercopy();
    error InvalidOwners();
    error InvalidThreshold();
    error EmptyRoleConfig();
    error SafePredictionMismatch(address predicted, address actual);

    constructor(
        address _safeSingleton,
        address _safeProxyFactory,
        address _rolesFactory,
        address _rolesMastercopy
    ) {
        if (_safeSingleton == address(0)) revert InvalidSingleton();
        if (_safeProxyFactory == address(0)) revert InvalidProxyFactory();
        if (_rolesFactory == address(0)) revert InvalidRolesFactory();
        if (_rolesMastercopy == address(0)) revert InvalidRolesMastercopy();

        safeSingleton = _safeSingleton;
        safeProxyFactory = _safeProxyFactory;
        rolesFactory = _rolesFactory;
        rolesMastercopy = _rolesMastercopy;
        moduleSetup = new SafeModuleSetup();
    }

    function deployAgentSafeWithRoles(
        address[] memory owners,
        uint256 threshold,
        uint256 safeSaltNonce,
        uint256 rolesSaltNonce,
        bytes[] calldata roleConfigCalls
    ) external returns (address safeAddress, address rolesModifier) {
        _validate(owners, threshold, roleConfigCalls);

        bytes memory safeInitializer = _encodeSafeSetup(owners, threshold, rolesSaltNonce, roleConfigCalls);
        address predictedSafe = _predictSafe(safeInitializer, safeSaltNonce);
        rolesModifier = _predictRolesModifier(predictedSafe, rolesSaltNonce);

        safeAddress = IAgentSafeZodiacSafeProxyFactory(safeProxyFactory).createProxyWithNonce(
            safeSingleton,
            safeInitializer,
            safeSaltNonce
        );
        if (safeAddress != predictedSafe) revert SafePredictionMismatch(predictedSafe, safeAddress);

        emit AgentSafeWithRolesDeployed(
            safeAddress,
            rolesModifier,
            AGENT_ROLE,
            safeSaltNonce,
            rolesSaltNonce
        );
    }

    function predictAgentSafeWithRoles(
        address[] memory owners,
        uint256 threshold,
        uint256 safeSaltNonce,
        uint256 rolesSaltNonce,
        bytes[] calldata roleConfigCalls
    ) external view returns (address safeAddress, address rolesModifier) {
        _validate(owners, threshold, roleConfigCalls);
        bytes memory safeInitializer = _encodeSafeSetup(owners, threshold, rolesSaltNonce, roleConfigCalls);
        safeAddress = _predictSafe(safeInitializer, safeSaltNonce);
        rolesModifier = _predictRolesModifier(safeAddress, rolesSaltNonce);
    }

    function _validate(
        address[] memory owners,
        uint256 threshold,
        bytes[] calldata roleConfigCalls
    ) internal pure {
        if (owners.length == 0) revert InvalidOwners();
        if (threshold == 0 || threshold > owners.length) revert InvalidThreshold();
        if (roleConfigCalls.length == 0) revert EmptyRoleConfig();
    }

    function _encodeSafeSetup(
        address[] memory owners,
        uint256 threshold,
        uint256 rolesSaltNonce,
        bytes[] calldata roleConfigCalls
    ) internal view returns (bytes memory) {
        return abi.encodeWithSignature(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)",
            owners,
            threshold,
            address(moduleSetup),
            abi.encodeWithSelector(
                SafeModuleSetup.deployAndEnableRoles.selector,
                rolesFactory,
                rolesMastercopy,
                rolesSaltNonce,
                roleConfigCalls
            ),
            address(0),
            address(0),
            uint256(0),
            address(0)
        );
    }

    function _predictRolesModifier(address safeAddress, uint256 rolesSaltNonce) internal view returns (address) {
        return IAgentSafeZodiacModuleFactory(rolesFactory).predictModuleAddress(
            rolesMastercopy,
            _encodeRolesSetup(safeAddress, safeAddress, safeAddress),
            rolesSaltNonce
        );
    }

    function _encodeRolesSetup(
        address owner,
        address avatar,
        address target
    ) internal pure returns (bytes memory) {
        return abi.encodeWithSignature(
            "setUp(bytes)",
            abi.encode(owner, avatar, target)
        );
    }

    function _predictSafe(bytes memory initializer, uint256 saltNonce) internal view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(keccak256(initializer), saltNonce));
        bytes memory proxyCreationCode = IAgentSafeZodiacSafeProxyFactory(safeProxyFactory).proxyCreationCode();
        bytes memory deploymentData = abi.encodePacked(proxyCreationCode, uint256(uint160(safeSingleton)));
        bytes32 codeHash = keccak256(deploymentData);
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), safeProxyFactory, salt, codeHash)))));
    }
}
