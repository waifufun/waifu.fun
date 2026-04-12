// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./AgentToken.sol";

interface IFeeRouterMinimal {
    function setAgentTreasury(address agentToken, address treasury) external;
}

/// @title AgentTokenFactoryV2
/// @notice Deploys agent tokens with 80/10/10 supply split and registers them.
contract AgentTokenFactoryV2 is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    address public immutable waifuFunV2;
    address public immutable feeRouter;

    EnumerableSet.AddressSet private _allTokens;
    mapping(address => EnumerableSet.AddressSet) private _tokensByCreator;

    event AgentCreated(
        address indexed token,
        address indexed creator,
        address treasury,
        string name,
        string symbol,
        uint256 totalSupply
    );

    error Unauthorized();

    constructor(address waifuFunV2_, address feeRouter_) {
        waifuFunV2 = waifuFunV2_;
        feeRouter = feeRouter_;
    }

    /// @notice Deploy a new agent token
    /// @param name Token name
    /// @param symbol Token symbol
    /// @param totalSupply Total supply (18 decimals)
    /// @param agentTreasury Gnosis Safe address for agent treasury
    /// @return tokenAddress The deployed token address
    function createAgent(
        string memory name,
        string memory symbol,
        uint256 totalSupply,
        address agentTreasury
    ) external returns (address tokenAddress) {
        // Deploy token with 80/10/10 split
        AgentToken token = new AgentToken(
            name,
            symbol,
            totalSupply,
            waifuFunV2,       // 80% to bonding curve
            agentTreasury,    // 10% to agent treasury
            msg.sender        // 10% to creator
        );
        tokenAddress = address(token);

        // Track
        _allTokens.add(tokenAddress);
        _tokensByCreator[msg.sender].add(tokenAddress);

        // Register treasury with fee router
        IFeeRouterMinimal(feeRouter).setAgentTreasury(tokenAddress, agentTreasury);

        emit AgentCreated(tokenAddress, msg.sender, agentTreasury, name, symbol, totalSupply);
    }

    function getAgentTokens() external view returns (address[] memory) {
        return _allTokens.values();
    }

    function getAgentsByCreator(address creator) external view returns (address[] memory) {
        return _tokensByCreator[creator].values();
    }

    function isAgentToken(address token) external view returns (bool) {
        return _allTokens.contains(token);
    }

    function totalAgents() external view returns (uint256) {
        return _allTokens.length();
    }
}
