import { type AnchorProvider, web3 } from "@coral-xyz/anchor";
import type { Keypair } from "@solana/web3.js";
import { Wallet } from "../utils/customWallet";

import {
	createRaydiumVaultProgramWithProvider,
	createMeteoraVaultProgramWithProvider,
	createCurrentAutofunProgramWithProvider,
	createLegacyAutofunProgramWithProvider,
	getRaydiumVaultProgramAddress,
	getMeteoraVaultProgramAddress,
	getCurrentProgramAddress,
	getLegacyProgramAddress,
	type RaydiumVaultTypes,
	type MeteoraVaultTypes,
	type CurrentAutofunTypes,
	type LegacyAutofunTypes,
} from "@autofun/programs";
import { Program } from "@coral-xyz/anchor";

// Program IDs - now using centralized addresses
export const RAYDIUM_VAULT_PROGRAM_ID = new web3.PublicKey(getRaydiumVaultProgramAddress());
export const METEORA_VAULT_PROGRAM_ID = new web3.PublicKey(getMeteoraVaultProgramAddress());
export const AUTOFUN_PROGRAM_ID = new web3.PublicKey(getCurrentProgramAddress());
export const AUTOFUN_LEGACY_PROGRAM_ID = new web3.PublicKey(getLegacyProgramAddress());

export interface ProgramContext {
	raydiumVaultProgram: Program<RaydiumVaultTypes>; 
	meteoraVaultProgram: Program<MeteoraVaultTypes>; 
	autofunProgram: Program<CurrentAutofunTypes>; 
	autofunLegacyProgram?: Program<LegacyAutofunTypes>; 
	provider: AnchorProvider;
	wallet: Wallet;
}

export async function initializePrograms(provider: AnchorProvider, keypair: Keypair): Promise<ProgramContext> {
	// Initialize programs using centralized package
	const raydiumVaultProgram = createRaydiumVaultProgramWithProvider(provider);
	const meteoraVaultProgram = createMeteoraVaultProgramWithProvider(provider);
	const autofunProgram = createCurrentAutofunProgramWithProvider(provider);
	const autofunLegacyProgram = createLegacyAutofunProgramWithProvider(provider);

	// Create a custom wallet instance
	const wallet = new Wallet(keypair);

	return {
		raydiumVaultProgram,
		meteoraVaultProgram,
		autofunProgram,
		autofunLegacyProgram,
		provider,
		wallet,
	};
}
