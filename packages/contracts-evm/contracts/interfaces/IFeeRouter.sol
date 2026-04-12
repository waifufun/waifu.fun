// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IFeeRouter
/// @notice Interface for the FeeRouter contract that splits WAIFU trading fees
///         across agent treasuries, the platform wallet, and veWAIFU staking.
interface IFeeRouter {
    //  Events 

    /// @notice Emitted when fees are distributed for an agent token trade.
    /// @param agentToken     The agent token whose trade generated fees.
    /// @param totalAmount    Total WAIFU fee amount distributed.
    /// @param treasuryShare  Amount sent to the agent's treasury.
    /// @param platformShare  Amount sent to the platform wallet.
    /// @param stakingShare   Amount sent to veWAIFU staking rewards.
    event FeesDistributed(
        address indexed agentToken,
        uint256 totalAmount,
        uint256 treasuryShare,
        uint256 platformShare,
        uint256 stakingShare
    );

    /// @notice Emitted when an agent token's treasury address is set or updated.
    /// @param agentToken The agent token address.
    /// @param treasury   The new treasury address.
    event AgentTreasurySet(address indexed agentToken, address indexed treasury);

    /// @notice Emitted when an authorized caller is added or removed.
    /// @param caller     The caller address.
    /// @param authorized Whether the caller is now authorized.
    event AuthorizedCallerSet(address indexed caller, bool authorized);

    /// @notice Emitted when the platform wallet is updated.
    /// @param newWallet The new platform wallet address.
    event PlatformWalletUpdated(address indexed newWallet);

    /// @notice Emitted when the staking contract is updated.
    /// @param newStaking The new staking contract address.
    event StakingContractUpdated(address indexed newStaking);

    //  Errors 

    /// @notice Caller is not authorized to distribute fees.
    error Unauthorized();

    /// @notice Supplied address is the zero address.
    error ZeroAddress();

    /// @notice Supplied amount is zero.
    error ZeroAmount();

    /// @notice Agent token has no treasury configured.
    error NoTreasurySet(address agentToken);

    //  Functions 

    /// @notice Distribute WAIFU fees from a trade. Caller must have pre-approved
    ///         this contract to spend `amount` of WAIFU.
    /// @param agentToken The agent token whose trade generated the fee.
    /// @param amount     Total WAIFU fee amount to split.
    function distributeFees(address agentToken, uint256 amount) external;

    /// @notice Set the treasury address for an agent token.
    /// @param agentToken The agent token address.
    /// @param treasury   The treasury wallet that receives the agent's share.
    function setAgentTreasury(address agentToken, address treasury) external;

    /// @notice Add or remove an authorized fee distributor (e.g. WaifuFunV2).
    /// @param caller     The address to authorize or deauthorize.
    /// @param authorized True to authorize, false to revoke.
    function setAuthorizedCaller(address caller, bool authorized) external;

    /// @notice Update the platform wallet address.
    /// @param newWallet The new platform wallet.
    function setPlatformWallet(address newWallet) external;

    /// @notice Update the staking contract address.
    /// @param newStaking The new veWAIFU staking contract.
    function setStakingContract(address newStaking) external;

    /// @notice Returns the treasury address for a given agent token.
    /// @param agentToken The agent token to query.
    /// @return The treasury address (or address(0) if unset).
    function agentTreasuries(address agentToken) external view returns (address);

    /// @notice Returns whether an address is an authorized fee distributor.
    /// @param caller The address to query.
    /// @return True if authorized.
    function authorizedCallers(address caller) external view returns (bool);
}
