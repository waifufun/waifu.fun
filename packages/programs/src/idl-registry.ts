import type { Idl } from "@coral-xyz/anchor";
import type { IdlVersion, VaultType } from "./exported-types";
import { devnetAutofun, devnetAutofunLegacy, devnetMeteoraVault, devnetRaydiumVault } from "./idls/devnet";
import { mainnetAutofun, mainnetAutofunLegacy, mainnetMeteoraVault, mainnetRaydiumVault } from "./idls/mainnet";
import { getNetwork } from "./network";

export function getAutofunIdl(version: IdlVersion = "v2"): Idl {
	const network = getNetwork();

	if (network === "mainnet") {
		return (version === "v1" ? mainnetAutofunLegacy : mainnetAutofun) as Idl;
	}
	return (version === "v1" ? devnetAutofunLegacy : devnetAutofun) as Idl;
}

export function getVaultIdl(vaultType: VaultType): Idl {
	const network = getNetwork();

	if (network === "mainnet") {
		return (vaultType === "raydium" ? mainnetRaydiumVault : mainnetMeteoraVault) as Idl;
	}
	return (vaultType === "raydium" ? devnetRaydiumVault : devnetMeteoraVault) as Idl;
}

export function getCurrentAutofunIdl(): Idl {
	return getAutofunIdl("v2");
}

export function getLegacyAutofunIdl(): Idl {
	return getAutofunIdl("v1");
}

export function getRaydiumVaultIdl(): Idl {
	return getVaultIdl("raydium");
}

export function getMeteoraVaultIdl(): Idl {
	return getVaultIdl("meteora");
}
