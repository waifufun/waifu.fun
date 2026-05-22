// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared LaunchTier enum used by both LaunchFactory and LaunchVault.
///         Extracted to its own file so LaunchVault can import the enum
///         without creating a circular import with LaunchFactory (which
///         must in turn import LaunchVault to deploy it).
///
///         Ordering matters: tier index is set in stone by storage layout
///         choices made elsewhere (deploy scripts, indexer, frontend tier
///         math). Append new tiers; never reorder.
enum LaunchTier {
    TIER_80,
    TIER_90,
    TIER_95,
    TIER_98,
    TIER_TEST
}
