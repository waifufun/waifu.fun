// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title AgentToken
/// @notice Simple BEP-20 token for waifu.fun agents. Fixed supply, distributed at construction.
contract AgentToken is ERC20 {
    uint8 private immutable _dec;

    /// @param name_ Token name
    /// @param symbol_ Token symbol
    /// @param totalSupply_ Total token supply
    /// @param bondingCurve_ Address receiving 80% (bonding curve)
    /// @param agentTreasury_ Address receiving 10% (agent Safe)
    /// @param creator_ Address receiving 10% (launcher)
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address bondingCurve_,
        address agentTreasury_,
        address creator_
    ) ERC20(name_, symbol_) {
        _dec = 18;
        uint256 curveShare = (totalSupply_ * 80) / 100;
        uint256 treasuryShare = (totalSupply_ * 10) / 100;
        uint256 creatorShare = totalSupply_ - curveShare - treasuryShare;
        _mint(bondingCurve_, curveShare);
        _mint(agentTreasury_, treasuryShare);
        _mint(creator_, creatorShare);
    }

    function decimals() public view virtual override returns (uint8) {
        return _dec;
    }
}
