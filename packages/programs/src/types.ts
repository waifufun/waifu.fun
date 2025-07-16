import type { getNetwork } from "./network";
import type { MainnetAutofun, MainnetAutofunLegacy, MainnetRaydiumVault, MainnetMeteoraVault } from "./types/mainnet";
import type { DevnetAutofun, DevnetAutofunLegacy, DevnetRaydiumVault, DevnetMeteoraVault } from "./types/devnet";

export type IdlVersion = "v1" | "v2";
export type VaultType = "raydium" | "meteora";

export type GetAutofunTypes<T extends IdlVersion> = T extends "v1"
	? ReturnType<typeof getNetwork> extends "mainnet"
		? MainnetAutofunLegacy
		: DevnetAutofunLegacy
	: ReturnType<typeof getNetwork> extends "mainnet"
		? MainnetAutofun
		: DevnetAutofun;

export type GetVaultTypes<T extends VaultType> = T extends "raydium"
	? ReturnType<typeof getNetwork> extends "mainnet"
		? MainnetRaydiumVault
		: DevnetRaydiumVault
	: ReturnType<typeof getNetwork> extends "mainnet"
		? MainnetMeteoraVault
		: DevnetMeteoraVault;

// Explicit type aliases for better Next.js compatibility
export type CurrentAutofunTypes = MainnetAutofun | DevnetAutofun;
export type LegacyAutofunTypes = MainnetAutofunLegacy | DevnetAutofunLegacy;
export type RaydiumVaultTypes = MainnetRaydiumVault | DevnetRaydiumVault;
export type MeteoraVaultTypes = MainnetMeteoraVault | DevnetMeteoraVault;

export type { MainnetAutofun, MainnetAutofunLegacy, MainnetRaydiumVault, MainnetMeteoraVault } from "./types/mainnet";
export type { DevnetAutofun, DevnetAutofunLegacy, DevnetRaydiumVault, DevnetMeteoraVault } from "./types/devnet";
