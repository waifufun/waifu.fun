import { PublicKey, SYSVAR_RENT_PUBKEY, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const SEED_CONFIG = "config";
export const SEED_BONDING_CURVE = "bonding_curve";
export const SEED_GLOBAL = "global";

export const METAPLEX_METADATA_PROGRAM_ID = new PublicKey("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");

export function getConfigPda(programId: PublicKey): PublicKey {
	const [configPda] = PublicKey.findProgramAddressSync([Buffer.from(SEED_CONFIG)], programId);
	return configPda;
}

export function getBondingCurvePda(programId: PublicKey, tokenMint: PublicKey): PublicKey {
	const [bondingCurvePda] = PublicKey.findProgramAddressSync(
		[Buffer.from(SEED_BONDING_CURVE), tokenMint.toBuffer()],
		programId,
	);
	return bondingCurvePda;
}

export function getGlobalVaultPda(programId: PublicKey): PublicKey {
	const [globalVaultPda] = PublicKey.findProgramAddressSync([Buffer.from(SEED_GLOBAL)], programId);
	return globalVaultPda;
}

export function getGlobalTokenAccountPda(globalVault: PublicKey, tokenMint: PublicKey): PublicKey {
	const [ata] = PublicKey.findProgramAddressSync(
		[globalVault.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), tokenMint.toBuffer()],
		ASSOCIATED_TOKEN_PROGRAM_ID,
	);
	return ata;
}

export function getTokenMetadataPda(tokenMint: PublicKey): PublicKey {
	const [metadataPda] = PublicKey.findProgramAddressSync(
		[Buffer.from("metadata"), METAPLEX_METADATA_PROGRAM_ID.toBuffer(), tokenMint.toBuffer()],
		METAPLEX_METADATA_PROGRAM_ID,
	);
	return metadataPda;
}

export function getLaunchAccounts({
	programId,
	creator,
	tokenMint,
	teamWallet,
}: {
	programId: PublicKey;
	creator: PublicKey;
	tokenMint: PublicKey;
	teamWallet: PublicKey;
}) {
	const globalConfig = getConfigPda(programId);
	const globalVault = getGlobalVaultPda(programId);
	const bondingCurve = getBondingCurvePda(programId, tokenMint);
	const tokenMetadataAccount = getTokenMetadataPda(tokenMint);
	const globalTokenAccount = getGlobalTokenAccountPda(globalVault, tokenMint);

	return {
		globalConfig,
		globalVault,
		creator,
		token: tokenMint,
		bondingCurve,
		tokenMetadataAccount,
		globalTokenAccount,
		systemProgram: SystemProgram.programId,
		rent: SYSVAR_RENT_PUBKEY,
		tokenProgram: TOKEN_PROGRAM_ID,
		associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
		mplTokenMetadataProgram: METAPLEX_METADATA_PROGRAM_ID,
		teamWallet,
	};
}
