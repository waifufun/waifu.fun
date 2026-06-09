// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// slither-disable-start naming-convention,low-level-calls,missing-zero-check

/// @notice Minimal proxy contract that delegates all calls to a singleton.
///         Mirrors the constructor + fallback shape of Gnosis SafeProxy v1.4.1
///         (no admin slot, no upgrade path; the singleton is fixed at deploy).
contract MockSafeProxy {
    /// @dev singleton storage slot. Public so MockSafeProxyFactory can read it
    ///      in its proxyCreationCode getter analogue, and so tests can verify
    ///      the proxy was wired to the right singleton.
    address internal singleton;

    constructor(address _singleton) {
        require(_singleton != address(0), "MockSafeProxy: zero singleton");
        singleton = _singleton;
    }

    fallback() external payable {
        address impl = singleton;
        assembly {
            calldatacopy(0, 0, calldatasize())
            let success := delegatecall(gas(), impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch success
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }

    receive() external payable {}
}

/// @notice Minimal Safe singleton mock with just enough surface for
///         AgentSafeDeployer tests: setup() stores owners + threshold and
///         exposes getOwners() / getThreshold() for read-back assertions.
/// @dev    Slot 0 is reserved for the proxy's `singleton` pointer so that
///         delegatecalls from MockSafeProxy do not clobber it (matches the
///         canonical Gnosis Safe layout where the Singleton base contract
///         declares `address singleton` first).
contract MockSafeSingleton {
    address private _slot0Singleton; // do not touch; reserved for proxy
    mapping(address => address) internal modules;
    address[] internal owners;
    uint256 internal threshold;
    bool internal initialized;

    address internal constant SENTINEL_MODULES = address(0x1);

    error AlreadyInitialized();
    error BadOwners();
    error BadThreshold();
    error SetupCallFailed();

    function setup(
        address[] memory _owners,
        uint256 _threshold,
        address to,
        bytes memory data,
        address, // fallbackHandler (ignored)
        address, // paymentToken (ignored)
        uint256, // payment (ignored)
        address // paymentReceiver (ignored)
    ) public {
        if (initialized) revert AlreadyInitialized();
        if (_owners.length == 0) revert BadOwners();
        if (_threshold == 0 || _threshold > _owners.length) revert BadThreshold();
        owners = _owners;
        threshold = _threshold;
        initialized = true;
        modules[SENTINEL_MODULES] = SENTINEL_MODULES;

        if (to != address(0)) {
            (bool ok, ) = to.delegatecall(data);
            if (!ok) revert SetupCallFailed();
        }
    }

    function getOwners() public view returns (address[] memory) {
        return owners;
    }

    function getThreshold() public view returns (uint256) {
        return threshold;
    }

    function isOwner(address candidate) public view returns (bool) {
        uint256 n = owners.length;
        for (uint256 i = 0; i < n; ++i) {
            if (owners[i] == candidate) return true;
        }
        return false;
    }

    function isModuleEnabled(address module) public view returns (bool) {
        return module != address(0) && module != SENTINEL_MODULES && modules[module] != address(0);
    }

    function getModulesPaginated(address start, uint256 pageSize)
        public
        view
        returns (address[] memory array, address next)
    {
        if (start == address(0)) start = SENTINEL_MODULES;
        array = new address[](pageSize);
        uint256 count = 0;
        address current = modules[start];
        while (current != address(0) && current != SENTINEL_MODULES && count < pageSize) {
            array[count] = current;
            current = modules[current];
            unchecked {
                ++count;
            }
        }

        address[] memory trimmed = new address[](count);
        for (uint256 i = 0; i < count; ++i) trimmed[i] = array[i];
        return (trimmed, current == address(0) ? SENTINEL_MODULES : current);
    }
}

/// @notice Minimal SafeProxyFactory v1.4.1 mock. Deploys MockSafeProxy via
///         CREATE2 using the same salt derivation as the canonical factory:
///           salt = keccak256(keccak256(initializer) || saltNonce)
///         then invokes the supplied initializer on the proxy. The
///         proxyCreationCode() getter returns the bytecode that
///         AgentSafeDeployer.predictAgentSafe relies on for CREATE2 address
///         derivation, so off-chain prediction stays consistent.
contract MockSafeProxyFactory {
    error ProxyCreationFailed();
    error InitializerFailed();

    event ProxyCreation(address indexed proxy, address indexed singleton);

    function createProxyWithNonce(
        address _singleton,
        bytes memory initializer,
        uint256 saltNonce
    ) public returns (address proxy) {
        bytes memory deploymentData = abi.encodePacked(
            type(MockSafeProxy).creationCode,
            uint256(uint160(_singleton))
        );
        bytes32 salt = keccak256(abi.encodePacked(keccak256(initializer), saltNonce));
        assembly {
            proxy := create2(0, add(deploymentData, 0x20), mload(deploymentData), salt)
        }
        if (proxy == address(0)) revert ProxyCreationFailed();

        if (initializer.length > 0) {
            (bool ok, ) = proxy.call(initializer);
            if (!ok) revert InitializerFailed();
        }

        emit ProxyCreation(proxy, _singleton);
    }

    function proxyCreationCode() public pure returns (bytes memory) {
        return type(MockSafeProxy).creationCode;
    }
}

// slither-disable-end naming-convention,low-level-calls,missing-zero-check
