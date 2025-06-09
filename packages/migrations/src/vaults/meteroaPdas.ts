import { PublicKey } from "@solana/web3.js";
import { CP_AMM_PROGRAM_ID } from "@meteora-ag/cp-amm-sdk";

export const VAULT_CONFIG_SEED = "meteora_vault_config";
export const POSITION_SEED = "meteora_position";
export const NFT_FAUCET_SEED = "meteora_vault_nft_seed";

export function getVaultConfig(programId: PublicKey): PublicKey {
	const [address] = PublicKey.findProgramAddressSync([Buffer.from(VAULT_CONFIG_SEED)], programId);
	return address;
}

export function getUserPosition(programId: PublicKey, positionNft: PublicKey): PublicKey {
	const [address] = PublicKey.findProgramAddressSync([Buffer.from(POSITION_SEED), positionNft.toBuffer()], programId);
	return address;
}

export function getNftTokenFaucet(programId: PublicKey, positionNft: PublicKey): PublicKey {
	const [address] = PublicKey.findProgramAddressSync([Buffer.from(NFT_FAUCET_SEED), positionNft.toBuffer()], programId);
	return address;
}

export function getEventAuthority(): PublicKey {
	const [address] = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], CP_AMM_PROGRAM_ID);
	return address;
}

export function derivePositionNftAccount(positionNftMint: PublicKey): PublicKey {
	return PublicKey.findProgramAddressSync(
		[Buffer.from("position_nft_account"), positionNftMint.toBuffer()],
		CP_AMM_PROGRAM_ID,
	)[0];
}
