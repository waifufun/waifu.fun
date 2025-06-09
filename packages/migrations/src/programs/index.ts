import { Program, type AnchorProvider, web3 } from "@coral-xyz/anchor";
import raydiumVaultIdl from "../vaults/programs/idl/raydium_vault.json";
import meteoraVaultIdl from "../vaults/programs/idl/meteora_vault.json";
import autofunIdl from "../vaults/programs/idl/autofun.json";
import type { RaydiumVault } from "../vaults/programs/types/raydium_vault";
import type { MeteoraVault } from "../vaults/programs/types/meteora_vault";
import type { Autofun } from "../vaults/programs/types/autofun";
import { Wallet } from "../utils/customWallet";
import type { Keypair } from "@solana/web3.js";

// Program IDs
const raydiumVaultId = raydiumVaultIdl.address;
const meteoraVaultId = meteoraVaultIdl.address;
const autofunId = autofunIdl.address;
export const RAYDIUM_VAULT_PROGRAM_ID = new web3.PublicKey(raydiumVaultId);
export const METEORA_VAULT_PROGRAM_ID = new web3.PublicKey(meteoraVaultId);
export const AUTOFUN_PROGRAM_ID = new web3.PublicKey(autofunId);

export interface ProgramContext {
	raydiumVaultProgram: Program<RaydiumVault>;
	meteoraVaultProgram: Program<MeteoraVault>;
	autofunProgram: Program<Autofun>;
	provider: AnchorProvider;
	wallet: Wallet;
}

export async function initializePrograms(provider: AnchorProvider, keypair: Keypair): Promise<ProgramContext> {
	// Initialize RaydiumVault program
	const raydiumVaultProgram = new Program<RaydiumVault>(raydiumVaultIdl as any, provider);

	// Initialize MeteoraVault program
	const meteoraVaultProgram = new Program<MeteoraVault>(meteoraVaultIdl as any, provider);

	// Initialize Autofun program
	const autofunProgram = new Program<Autofun>(autofunIdl as any, provider);
	// Create a custom wallet instance
	const wallet = new Wallet(keypair);

	return {
		raydiumVaultProgram,
		meteoraVaultProgram,
		autofunProgram,
		provider,
		wallet,
	};
}
