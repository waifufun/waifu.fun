import { type AnchorProvider, web3 } from "@coral-xyz/anchor";
import type { Keypair } from "@solana/web3.js";
import { Wallet } from "../utils/customWallet.js";

import type { Program } from "@coral-xyz/anchor";
import {
	type CurrentAutofunTypes,
	type LegacyAutofunTypes,
	type MeteoraVaultTypes,
	type RaydiumVaultTypes,
	createCurrentAutofunProgramWithProvider,
	createLegacyAutofunProgramWithProvider,
	createMeteoraVaultProgramWithProvider,
	createRaydiumVaultProgramWithProvider,
	getCurrentProgramAddress,
	getLegacyProgramAddress,
	getMeteoraVaultProgramAddress,
	getRaydiumVaultProgramAddress,
} from "@waifufun/programs";

// Program IDs - now using centralized addresses
export const RAYDIUM_VAULT_PROGRAM_ID = new web3.PublicKey(getRaydiumVaultProgramAddress());
export const METEORA_VAULT_PROGRAM_ID = new web3.PublicKey(getMeteoraVaultProgramAddress());
export const AUTOFUN_PROGRAM_ID = new web3.PublicKey(getCurrentProgramAddress());
export const AUTOFUN_LEGACY_PROGRAM_ID = new web3.PublicKey(getLegacyProgramAddress());

export interface ProgramContext {
	raydiumVaultProgram: Program<RaydiumVaultTypes>;
	meteoraVaultProgram: Program<MeteoraVaultTypes>;
	waifufunProgram: Program<CurrentAutofunTypes>;
	waifufunLegacyProgram?: Program<LegacyAutofunTypes>;
	provider: AnchorProvider;
	wallet: Wallet;
}

export async function initializePrograms(provider: AnchorProvider, keypair: Keypair): Promise<ProgramContext> {
	// Initialize programs using centralized package
	const raydiumVaultProgram = createRaydiumVaultProgramWithProvider(provider);
	const meteoraVaultProgram = createMeteoraVaultProgramWithProvider(provider);
	const waifufunProgram = createCurrentAutofunProgramWithProvider(provider);
	const waifufunLegacyProgram = createLegacyAutofunProgramWithProvider(provider);

	// Create a custom wallet instance
	const wallet = new Wallet(keypair);

	return {
		raydiumVaultProgram,
		meteoraVaultProgram,
		waifufunProgram,
		waifufunLegacyProgram,
		provider,
		wallet,
	};
}
