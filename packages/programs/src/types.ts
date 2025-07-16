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

export type CurrentAutofunTypes = GetAutofunTypes<"v2">;
export type LegacyAutofunTypes = GetAutofunTypes<"v1">;
export type RaydiumVaultTypes = GetVaultTypes<"raydium">;
export type MeteoraVaultTypes = GetVaultTypes<"meteora">;

export type { MainnetAutofun, MainnetAutofunLegacy, MainnetRaydiumVault, MainnetMeteoraVault } from "./types/mainnet";
export type { DevnetAutofun, DevnetAutofunLegacy, DevnetRaydiumVault, DevnetMeteoraVault } from "./types/devnet";
