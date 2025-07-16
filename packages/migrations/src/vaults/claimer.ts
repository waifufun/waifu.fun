import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { claimPositionFee } from "./meteoraVault";
import { claim } from "./raydiumVault";
import DB from "@autofun/database";
import type { SolanaNetworkIds } from "@autofun/types";
import { AnchorProvider } from "@coral-xyz/anchor";
import { Wallet } from "../utils/customWallet.js";
import { getRpcUrl } from "../utils/getRpcUrl";
import { Program } from "@coral-xyz/anchor";

import {
	createRaydiumVaultProgramWithProvider,
	createMeteoraVaultProgramWithProvider,
	type RaydiumVaultTypes,
	type MeteoraVaultTypes,
} from "@autofun/programs";

export class Claimer {
	private connection: Connection;
	private provider: AnchorProvider;
	private wallet: Wallet;
	private raydiumVaultProgram: Program<RaydiumVaultTypes>;
	private meteoraVaultProgram: Program<MeteoraVaultTypes>;
	private SolAddress: PublicKey = new PublicKey("So11111111111111111111111111111111111111112");

	constructor(chainId: SolanaNetworkIds) {
		const rpcUrl = getRpcUrl();
		this.connection = new Connection(rpcUrl, "confirmed");
		this.wallet = new Wallet(
			Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.EXECUTOR_PRIVATE_KEY || "[]"))),
		);
		this.provider = new AnchorProvider(this.connection, this.wallet, AnchorProvider.defaultOptions());
		
		// Initialize programs using centralized package
		this.raydiumVaultProgram = createRaydiumVaultProgramWithProvider(this.provider);
		this.meteoraVaultProgram = createMeteoraVaultProgramWithProvider(this.provider);
	}

	async claimMeteora(tokenMint: string): Promise<string> {
		const migration = await DB.Migration.findOne({ contractAddress: tokenMint });
		if (!migration?.primaryNftMint || !migration.marketId) {
			throw new Error("No NFT found for claiming");
		}

		const result = await claimPositionFee(
			this.provider,
			this.wallet.payer as Keypair,
			this.meteoraVaultProgram,
			new PublicKey(migration.primaryNftMint),
			new PublicKey(migration.marketId),
			new PublicKey(tokenMint),
			this.SolAddress,
		);

		return result;
	}

	async claimRaydium(tokenMint: string): Promise<string> {
		const migration = await DB.Migration.findOne({ contractAddress: tokenMint });
		if (!migration?.primaryNftMint || !migration.marketId || !migration.creator) {
			throw new Error("No NFT found for claiming");
		}

		const result = await claim(
			this.raydiumVaultProgram,
			this.wallet.payer as Keypair,
			new PublicKey(migration.primaryNftMint),
			new PublicKey(migration.marketId),
			this.connection,
			new PublicKey(migration.creator),
		);

		return result;
	}
}
