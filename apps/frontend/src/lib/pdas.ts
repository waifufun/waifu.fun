import { PublicKey } from "@solana/web3.js";

export const SEED_CONFIG = "config";
export const SEED_BONDING_CURVE = "bonding_curve";

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
