// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockRolesModifier {
    bytes public lastSetUpData;

    function setUp(bytes calldata initializeParams) external {
        lastSetUpData = initializeParams;
    }
}

contract MockSafe {
    address[] public owners;
    uint256 public threshold;
    address public fallbackHandler;
    address public enabledModule;
    address public setupCaller;

    function setup(
        address[] calldata owners_,
        uint256 threshold_,
        address to,
        bytes calldata data,
        address fallbackHandler_,
        address,
        uint256,
        address payable
    ) external {
        owners = owners_;
        threshold = threshold_;
        fallbackHandler = fallbackHandler_;

        if (to != address(0)) {
            (bool ok, bytes memory result) = to.delegatecall(data);
            if (!ok) {
                assembly {
                    revert(add(result, 0x20), mload(result))
                }
            }
        }
    }

    function enableModule(address module) external {
        require(msg.sender == address(this), "only self");
        enabledModule = module;
        setupCaller = msg.sender;
    }

    function ownersLength() external view returns (uint256) {
        return owners.length;
    }
}

contract MockSafeProxyFactory {
    event ProxyCreated(address proxy, address singleton, bytes initializer, uint256 saltNonce);

    address public lastProxy;
    address public lastSingleton;
    bytes public lastInitializer;
    uint256 public lastSaltNonce;

    function createProxyWithNonce(address singleton, bytes calldata initializer, uint256 saltNonce)
        external
        returns (address proxy)
    {
        MockSafe safe = new MockSafe();
        proxy = address(safe);
        lastProxy = proxy;
        lastSingleton = singleton;
        lastInitializer = initializer;
        lastSaltNonce = saltNonce;
        (bool ok, bytes memory result) = proxy.call(initializer);
        if (!ok) {
            assembly {
                revert(add(result, 0x20), mload(result))
            }
        }
        emit ProxyCreated(proxy, singleton, initializer, saltNonce);
    }
}
