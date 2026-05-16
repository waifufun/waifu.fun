// SPDX-License-Identifier: MIT
//
//   ╭┈┈┈ waifu.fun ┈┈┈╮
//   │   TreasuryLP     │
//   │   the agent's    │
//   │   bag.           │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈╯
//
//      ✿  custodial for now  ✿
//
pragma solidity ^0.8.24;

// slither-disable-start incorrect-equality,reentrancy-events,missing-inheritance,naming-convention

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ITreasuryLPRegistry} from "./interfaces/ITreasuryLPRegistry.sol";

/// @title TreasuryLP
/// @notice custodial treasury holder. receives the 10% bundle-slice of the
///         new token and holds it. pure custody, owner-sweepable: the owner
///         can drain custody into a downstream LP-deployer contract via
///         sweep().
contract TreasuryLP is ITreasuryLPRegistry {
    using SafeERC20 for IERC20;

    address public immutable owner;
    address public immutable factory;

    address public managedToken;
    address public registrar;

    event TokensReceived(address indexed token, uint256 amount);
    event TokensSwept(address indexed to, address indexed token, uint256 amount);
    event ManagedTokenSet(address indexed token);
    event RegistrarSet(address indexed registrar);

    error NotOwner();
    error NotAuthorized();
    error MultipleTokens();
    error ZeroAddress();
    error NoBnbAccepted();
    error RegistrarAlreadySet();
    error NoTokenBalance();

    constructor(address _owner, address _factory) {
        if (_owner == address(0) || _factory == address(0)) revert ZeroAddress();
        owner = _owner;
        factory = _factory;
    }

    /// @notice idempotent token registration by factory/registrar after first inflow.
    ///         locks to the first registered token. subsequent calls with a different
    ///         token revert MultipleTokens.
    function recordManagedToken(address t) external {
        if (msg.sender != factory && msg.sender != registrar) revert NotAuthorized();
        if (t == address(0)) revert ZeroAddress();
        if (IERC20(t).balanceOf(address(this)) == 0) revert NoTokenBalance();
        if (managedToken == address(0)) {
            managedToken = t;
            emit ManagedTokenSet(t);
        } else if (managedToken != t) {
            revert MultipleTokens();
        }
    }

    function setRegistrar(address _registrar) external {
        if (msg.sender != factory) revert NotAuthorized();
        if (_registrar == address(0)) revert ZeroAddress();
        if (registrar != address(0)) revert RegistrarAlreadySet();
        registrar = _registrar;
        emit RegistrarSet(_registrar);
    }

    /// @notice owner-only sweep. forwards `amount` of token `t` to `to`.
    ///         used to drain custody into a downstream LP-deployer contract.
    function sweep(address to, address t, uint256 amount) external {
        if (msg.sender != owner) revert NotOwner();
        if (to == address(0) || t == address(0)) revert ZeroAddress();
        IERC20(t).safeTransfer(to, amount);
        emit TokensSwept(to, t, amount);
    }

    /// @notice helper view: balance of managed token held by this contract.
    function balance() external view returns (uint256) {
        if (managedToken == address(0)) return 0;
        return IERC20(managedToken).balanceOf(address(this));
    }

    /// @notice reject raw BNB. TreasuryLP only holds tokens.
    receive() external payable {
        revert NoBnbAccepted();
    }
}

// slither-disable-end incorrect-equality,reentrancy-events,missing-inheritance,naming-convention
