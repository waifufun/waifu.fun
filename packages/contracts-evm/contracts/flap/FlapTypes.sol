// SPDX-License-Identifier: MIT
//
//   ╭┈ waifu.fun ┈╮
//   │  FlapTypes  │
//   ╰┈┈┈┈┈┈┈┈┈┈┈┈╯
//   shared types for FLAP integration.
//
pragma solidity ^0.8.24;

/// @title FlapTypes
/// @notice shared enums + structs used by the Flap Portal V6 entry point.
///         pinned to the V6 abi. BundleRouter talks to the portal
///         exclusively through `newTokenV6`.
library FlapTypes {
	enum DexThreshType {
		TWO_THIRDS, // 0
		FOUR_FIFTHS, // 1 -> what we use (80%)
		HALF, // 2
		_95_PERCENT, // 3
		_81_PERCENT, // 4
		_1_PERCENT // 5
	}

	enum MigratorType {
		V3_MIGRATOR, // 0
		V2_MIGRATOR // 1 -> required for tax tokens
	}

	enum DEXId {
		DEX0, // 0 -> PancakeSwap on BSC
		DEX1,
		DEX2
	}

	enum V3LPFeeProfile {
		LP_FEE_PROFILE_STANDARD, // 0
		LP_FEE_PROFILE_LOW, // 1
		LP_FEE_PROFILE_HIGH // 2
	}

	enum TokenVersion {
		TOKEN_LEGACY_MINT_NO_PERMIT, // 0
		TOKEN_LEGACY_MINT_NO_PERMIT_DUPLICATE, // 1
		TOKEN_V2_PERMIT, // 2
		TOKEN_GOPLUS, // 3
		TOKEN_TAXED, // 4
		TOKEN_TAXED_V2, // 5
		TOKEN_TAXED_V3 // 6 -> what we use
	}

	struct NewTokenV6Params {
		string name;
		string symbol;
		string meta;
		DexThreshType dexThresh;
		bytes32 salt;
		MigratorType migratorType;
		address quoteToken;
		uint256 quoteAmt;
		address beneficiary;
		bytes permitData;
		bytes32 extensionID;
		bytes extensionData;
		DEXId dexId;
		V3LPFeeProfile lpFeeProfile;
		uint16 buyTaxRate;
		uint16 sellTaxRate;
		uint64 taxDuration;
		uint64 antiFarmerDuration;
		uint16 mktBps;
		uint16 deflationBps;
		uint16 dividendBps;
		uint16 lpBps;
		uint256 minimumShareBalance;
		address dividendToken;
		address commissionReceiver;
		TokenVersion tokenVersion;
	}
}
