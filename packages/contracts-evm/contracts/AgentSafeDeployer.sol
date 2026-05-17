// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface for the canonical Gnosis Safe ProxyFactory v1.4.1
///         (`SafeProxyFactory`). We only need the nonce-based deployment path
///         so the caller can deterministically choose the proxy address.
interface ISafeProxyFactory {
	function createProxyWithNonce(
		address singleton,
		bytes memory initializer,
		uint256 saltNonce
	) external returns (address proxy);

	function proxyCreationCode() external pure returns (bytes memory);
}

/// @title AgentSafeDeployer
/// @notice Thin wrapper that deploys a Gnosis Safe v1.4.1 with a known set of
///         owners + threshold at launch time. The deployer holds no privileges
///         on the resulting Safe and never becomes an owner; the proxy belongs
///         entirely to the supplied `owners` after `Safe.setup()` runs inside
///         the factory call.
/// @dev    Canonical BSC mainnet addresses (passed via constructor, NOT
///         hardcoded so we can reuse the same bytecode on testnet / other
///         chains):
///           - Safe Singleton v1.4.1: 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762
///           - Safe ProxyFactory v1.4.1: 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67
contract AgentSafeDeployer {
	/// @notice Safe singleton (master copy) the proxy delegates to.
	address public immutable safeSingleton;

	/// @notice Canonical SafeProxyFactory that performs the CREATE2 deploy.
	address public immutable safeProxyFactory;

	event SafeDeployed(
		address indexed safe,
		uint256 saltNonce,
		address[] owners,
		uint256 threshold
	);

	error InvalidSingleton();
	error InvalidProxyFactory();
	error InvalidOwners();
	error InvalidThreshold();

	constructor(address _safeSingleton, address _safeProxyFactory) {
		if (_safeSingleton == address(0)) revert InvalidSingleton();
		if (_safeProxyFactory == address(0)) revert InvalidProxyFactory();
		safeSingleton = _safeSingleton;
		safeProxyFactory = _safeProxyFactory;
	}

	/// @notice Deploy a new Safe v1.4.1 proxy with the supplied owners and
	///         threshold. The Safe is initialized atomically inside the
	///         factory call; no fallback handler, no module setup, no payment.
	/// @param owners     Initial owner set (length >= 1).
	/// @param threshold  Signatures required (1 <= threshold <= owners.length).
	/// @param saltNonce  CREATE2 nonce; controls the deterministic Safe address.
	/// @return safeAddress Address of the newly deployed Safe proxy.
	function deployAgentSafe(
		address[] memory owners,
		uint256 threshold,
		uint256 saltNonce
	) external returns (address safeAddress) {
		_validate(owners, threshold);

		bytes memory initializer = _encodeSetup(owners, threshold);

		safeAddress = ISafeProxyFactory(safeProxyFactory).createProxyWithNonce(
			safeSingleton,
			initializer,
			saltNonce
		);

		emit SafeDeployed(safeAddress, saltNonce, owners, threshold);
	}

	/// @notice Predict the CREATE2 address that `deployAgentSafe` would
	///         produce for the same arguments, without actually deploying.
	///         Mirrors the address derivation used by SafeProxyFactory v1.4.1:
	///           salt        = keccak256(keccak256(initializer) ++ saltNonce)
	///           initCode    = proxyCreationCode ++ uint256(singleton)
	///           addr        = CREATE2(factory, salt, keccak256(initCode))
	function predictAgentSafe(
		address[] memory owners,
		uint256 threshold,
		uint256 saltNonce
	) external view returns (address) {
		_validate(owners, threshold);

		bytes memory initializer = _encodeSetup(owners, threshold);
		bytes32 salt = keccak256(
			abi.encodePacked(keccak256(initializer), saltNonce)
		);

		bytes memory proxyCreationCode = ISafeProxyFactory(safeProxyFactory)
			.proxyCreationCode();
		bytes memory deploymentData = abi.encodePacked(
			proxyCreationCode,
			uint256(uint160(safeSingleton))
		);
		bytes32 codeHash = keccak256(deploymentData);

		return
			address(
				uint160(
					uint256(
						keccak256(
							abi.encodePacked(
								bytes1(0xff),
								safeProxyFactory,
								salt,
								codeHash
							)
						)
					)
				)
			);
	}

	// --- internal ---------------------------------------------------------

	function _validate(address[] memory owners, uint256 threshold) internal pure {
		if (owners.length == 0) revert InvalidOwners();
		if (threshold == 0 || threshold > owners.length) revert InvalidThreshold();
	}

	/// @dev Encodes the call to Safe v1.4.1 `setup(...)` with the minimal
	///      configuration:
	///        - no setup module call (`to=0`, `data=""`)
	///        - no fallback handler (`fallbackHandler=0`)
	///        - no payment (paymentToken/payment/paymentReceiver zeroed)
	///      Callers that need a CompatibilityFallbackHandler or modules can
	///      perform that wiring through normal Safe transactions post-deploy.
	function _encodeSetup(address[] memory owners, uint256 threshold)
		internal
		pure
		returns (bytes memory)
	{
		return
			abi.encodeWithSignature(
				"setup(address[],uint256,address,bytes,address,address,uint256,address)",
				owners,
				threshold,
				address(0),
				bytes(""),
				address(0),
				address(0),
				uint256(0),
				address(0)
			);
	}
}
