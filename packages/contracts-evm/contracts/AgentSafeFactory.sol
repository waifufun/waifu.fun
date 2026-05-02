// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";

interface ISafeProxyFactory {
	function createProxyWithNonce(address singleton, bytes calldata initializer, uint256 saltNonce)
		external
		returns (address proxy);
}

interface ISafe {
	function setup(
		address[] calldata owners,
		uint256 threshold,
		address to,
		bytes calldata data,
		address fallbackHandler,
		address paymentToken,
		uint256 payment,
		address payable paymentReceiver
	) external;

	function enableModule(address module) external;
}

interface IRolesModifier {
	function setUp(bytes calldata initializeParams) external;
}

/**
 * @notice Deploy path for a 1-of-2 agent Safe (Steward agent key + patron wallet)
 *         with a Zodiac Roles Modifier attached as an enabled Safe module.
 *
 * BSC mainnet reference addresses (verify before live mainnet use):
 * - Safe Singleton 1.4.1: 0x41675C099F32341bf84BFc5382aF534df5C7461a
 * - Safe Proxy Factory: 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67
 * - Safe Fallback Handler: 0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99
 * - Zodiac Roles Modifier v1: 0xC581c6ED4c9Dc6f78B44e0fBF8428A0D08060b0F
 *
 * Sources to verify before mainnet:
 * - Safe deployments: https://github.com/safe-global/safe-deployments
 * - Zodiac Roles Modifier: https://github.com/gnosisguild/zodiac-modifier-roles
 */
contract AgentSafeFactory {
	error ZeroAddress();

	event AgentSafeDeployed(address safe, address rolesModifier, address agentKey, address patronWallet);

	address public immutable safeSingleton;
	address public immutable safeProxyFactory;
	address public immutable safeFallbackHandler;
	address public immutable rolesModifierSingleton;

	constructor(
		address safeSingleton_,
		address safeProxyFactory_,
		address safeFallbackHandler_,
		address rolesModifierSingleton_
	) {
		if (
			safeSingleton_ == address(0) || safeProxyFactory_ == address(0) || safeFallbackHandler_ == address(0)
				|| rolesModifierSingleton_ == address(0)
		) revert ZeroAddress();

		safeSingleton = safeSingleton_;
		safeProxyFactory = safeProxyFactory_;
		safeFallbackHandler = safeFallbackHandler_;
		rolesModifierSingleton = rolesModifierSingleton_;
	}

	function deployAgentSafe(address agentKey, address patronWallet, bytes32 salt)
		external
		returns (address safe, address rolesModifier)
	{
		if (agentKey == address(0) || patronWallet == address(0)) revert ZeroAddress();

		rolesModifier = Clones.cloneDeterministic(
			rolesModifierSingleton, keccak256(abi.encodePacked(salt, agentKey, patronWallet))
		);

		address[] memory owners = new address[](2);
		owners[0] = agentKey;
		owners[1] = patronWallet;

		bytes memory setupModulesData = abi.encodeCall(this.enableRolesModifierModule, (rolesModifier));
		bytes memory initializer = abi.encodeCall(
			ISafe.setup,
			(
				owners,
				1,
				address(this),
				setupModulesData,
				safeFallbackHandler,
				address(0),
				0,
				payable(address(0))
			)
		);

		safe = ISafeProxyFactory(safeProxyFactory).createProxyWithNonce(safeSingleton, initializer, uint256(salt));

		IRolesModifier(rolesModifier).setUp(abi.encode(safe, safe, safe));

		emit AgentSafeDeployed(safe, rolesModifier, agentKey, patronWallet);
	}

	/**
	 * @dev Called by Safe.setup via delegatecall. The external self-call makes msg.sender the Safe,
	 *      satisfying Safe's authorized-self guard around enableModule.
	 */
	function enableRolesModifierModule(address rolesModifier) external {
		ISafe(address(this)).enableModule(rolesModifier);
	}
}
