import type { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { getNetwork } from "./network";
import { getAutofunIdl, getVaultIdl } from "./idls";
import type {
	IdlVersion,
	VaultType,
	GetAutofunTypes,
	GetVaultTypes,
	CurrentAutofunTypes,
	LegacyAutofunTypes,
	RaydiumVaultTypes,
	MeteoraVaultTypes,
} from "./types";

export type WalletLike = {
	publicKey: PublicKey;
	signTransaction<T>(tx: T): Promise<T>;
	signAllTransactions<T>(txs: T[]): Promise<T[]>;
};

export const PROGRAM_ADDRESSES = {
	mainnet: {
		autofun: "autoiNVyGniA5dosggHy34BZYimthNzLy6WXL7qwzPA",
		autofunLegacy: "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5",
		raydiumVault: "autoFENwXX1Y3V4pkUdJw7WzhF1ZT6xQsyJWkLqBcta",
		meteoraVault: "auto8znD4FacuJSPEfD6hpFUZTUaakso8dbEgDD1P84",
	},
	devnet: {
		autofun: "TeStFsfeHHNsCRNo9WaF6eyo5Fzwm2Yiq5mXfhknvxS",
		autofunLegacy: "TeStFsfeHHNsCRNo9WaF6eyo5Fzwm2Yiq5mXfhknvxS",
		raydiumVault: "autoFENwXX1Y3V4pkUdJw7WzhF1ZT6xQsyJWkLqBcta",
		meteoraVault: "auto8znD4FacuJSPEfD6hpFUZTUaakso8dbEgDD1P84",
	},
} as const;

export function getProgramAddress(version: IdlVersion = "v2"): string {
	const network = getNetwork();
	const addresses = PROGRAM_ADDRESSES[network];

	return version === "v1" ? addresses.autofunLegacy : addresses.autofun;
}

// New functions that accept only provider directly
export function createAutofunProgramWithProvider<T extends IdlVersion>(
	provider: AnchorProvider,
	version: T = "v2" as T,
): Program<GetAutofunTypes<T>> {
	const idl = getAutofunIdl(version);
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	return new Program<GetAutofunTypes<T>>(idl as any, provider);
}

export function createCurrentAutofunProgramWithProvider(provider: AnchorProvider): Program<CurrentAutofunTypes> {
	return createAutofunProgramWithProvider(provider, "v2");
}

export function createLegacyAutofunProgramWithProvider(provider: AnchorProvider): Program<LegacyAutofunTypes> {
	return createAutofunProgramWithProvider(provider, "v1");
}

// Original wallet-based functions (kept for backward compatibility)
export function createAutofunProgram<T extends IdlVersion>(
	connection: Connection,
	wallet: WalletLike,
	version: T = "v2" as T,
): Program<GetAutofunTypes<T>> {
	const idl = getAutofunIdl(version);
	const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	return new Program<GetAutofunTypes<T>>(idl as any, provider);
}

export function createCurrentAutofunProgram(connection: Connection, wallet: WalletLike): Program<CurrentAutofunTypes> {
	return createAutofunProgram(connection, wallet, "v2");
}

export function createLegacyAutofunProgram(connection: Connection, wallet: WalletLike): Program<LegacyAutofunTypes> {
	return createAutofunProgram(connection, wallet, "v1");
}

export function getCurrentProgramAddress(): string {
	return getProgramAddress("v2");
}

export function getLegacyProgramAddress(): string {
	return getProgramAddress("v1");
}

// Vault program functions with provider support
export function createVaultProgramWithProvider<T extends VaultType>(
	provider: AnchorProvider,
	vaultType: T,
): Program<GetVaultTypes<T>> {
	const idl = getVaultIdl(vaultType);
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	return new Program<GetVaultTypes<T>>(idl as any, provider);
}

export function createRaydiumVaultProgramWithProvider(provider: AnchorProvider): Program<RaydiumVaultTypes> {
	return createVaultProgramWithProvider(provider, "raydium");
}

export function createMeteoraVaultProgramWithProvider(provider: AnchorProvider): Program<MeteoraVaultTypes> {
	return createVaultProgramWithProvider(provider, "meteora");
}

export function getVaultProgramAddress(vaultType: VaultType): string {
	const network = getNetwork();
	const addresses = PROGRAM_ADDRESSES[network];

	return vaultType === "raydium" ? addresses.raydiumVault : addresses.meteoraVault;
}

export function createVaultProgram<T extends VaultType>(
	connection: Connection,
	wallet: WalletLike,
	vaultType: T,
): Program<GetVaultTypes<T>> {
	const idl = getVaultIdl(vaultType);
	const provider = new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	return new Program<GetVaultTypes<T>>(idl as any, provider);
}

export function createRaydiumVaultProgram(connection: Connection, wallet: WalletLike): Program<RaydiumVaultTypes> {
	return createVaultProgram(connection, wallet, "raydium");
}

export function createMeteoraVaultProgram(connection: Connection, wallet: WalletLike): Program<MeteoraVaultTypes> {
	return createVaultProgram(connection, wallet, "meteora");
}

export function getRaydiumVaultProgramAddress(): string {
	return getVaultProgramAddress("raydium");
}

export function getMeteoraVaultProgramAddress(): string {
	return getVaultProgramAddress("meteora");
}
