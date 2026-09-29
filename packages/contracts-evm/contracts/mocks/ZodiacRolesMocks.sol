// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// slither-disable-start naming-convention,low-level-calls,missing-zero-check

contract MockRolesModifier {
    address public owner;
    address public avatar;
    address public target;
    bool public initialized;

    mapping(address => mapping(bytes32 => bool)) public memberOf;
    mapping(bytes32 => mapping(address => mapping(bytes4 => bool))) public scopedFunction;

    error AlreadyInitialized();
    error Unauthorized();
    error NotAllowed();
    error CallFailed();
    error InvalidOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    function setUp(bytes memory initParams) external {
        if (initialized) revert AlreadyInitialized();
        (address owner_, address avatar_, address target_) = abi.decode(initParams, (address, address, address));
        if (owner_ == address(0)) revert InvalidOwner();
        owner = owner_;
        avatar = avatar_;
        target = target_;
        initialized = true;
    }

    function assignRoles(address module, bytes32[] calldata roleKeys, bool[] calldata memberOf_) external onlyOwner {
        require(roleKeys.length == memberOf_.length, "MockRoles: length mismatch");
        for (uint256 i = 0; i < roleKeys.length; ++i) {
            memberOf[module][roleKeys[i]] = memberOf_[i];
        }
    }

    function scopeFunction(
        bytes32 roleKey,
        address targetAddress,
        bytes4 functionSig,
        uint8[] calldata,
        bytes calldata,
        uint8
    ) external onlyOwner {
        scopedFunction[roleKey][targetAddress][functionSig] = true;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();
        owner = newOwner;
    }

    function execTransactionWithRole(
        address to,
        uint256 value,
        bytes calldata data,
        uint8,
        bytes32 roleKey,
        bool
    ) external returns (bool success) {
        bytes4 selector;
        if (data.length >= 4) selector = bytes4(data[:4]);
        if (!memberOf[msg.sender][roleKey] || !scopedFunction[roleKey][to][selector]) revert NotAllowed();
        (success, ) = to.call{value: value}(data);
        if (!success) revert CallFailed();
    }
}

contract MockRolesModuleFactory {
    event ModuleDeployed(address indexed module, address indexed mastercopy, uint256 saltNonce);

    error ProxyCreationFailed();
    error InitializerFailed();

    function deployModule(
        address mastercopy,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (address module) {
        mastercopy; // interface parity with Zodiac factory; mock deploys concrete modifier code.
        bytes memory deploymentData = type(MockRolesModifier).creationCode;
        bytes32 salt = keccak256(abi.encodePacked(keccak256(initializer), saltNonce));
        assembly {
            module := create2(0, add(deploymentData, 0x20), mload(deploymentData), salt)
        }
        if (module == address(0)) revert ProxyCreationFailed();
        if (initializer.length > 0) {
            (bool ok, ) = module.call(initializer);
            if (!ok) revert InitializerFailed();
        }
        emit ModuleDeployed(module, mastercopy, saltNonce);
    }

    function predictModuleAddress(
        address,
        bytes memory initializer,
        uint256 saltNonce
    ) external view returns (address module) {
        bytes32 codeHash = keccak256(type(MockRolesModifier).creationCode);
        bytes32 salt = keccak256(abi.encodePacked(keccak256(initializer), saltNonce));
        module = address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, codeHash)))));
    }
}

contract MockAgentActionTarget {
    uint256 public allowedCalls;
    uint256 public gatedCalls;

    function claimRewards() external {
        unchecked {
            ++allowedCalls;
        }
    }

    function withdrawFunds() external {
        unchecked {
            ++gatedCalls;
        }
    }
}

// slither-disable-end naming-convention,low-level-calls,missing-zero-check
