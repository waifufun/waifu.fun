import { PublicKey, Connection, Keypair } from "@solana/web3.js";
import { claimPositionFee } from "./meteoraVault";
import { claim } from "./raydiumVault";
import DB from "@autofun/database";
import type { SolanaNetworkIds } from "@autofun/types";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Wallet } from "../utils/customWallet.js";
import raydiumVaultIdl from "../vaults/programs/idl/raydium_vault.json";
import meteoraVaultIdl from "../vaults/programs/idl/meteora_vault.json";
import type { RaydiumVault } from "../vaults/programs/types/raydium_vault";
import type { MeteoraVault } from "../vaults/programs/types/meteora_vault";

export class Claimer {
	private connection: Connection;
	private provider: AnchorProvider;
	private wallet: Wallet;
	private raydiumVaultProgram: Program<RaydiumVault>;
	private meteoraVaultProgram: Program<MeteoraVault>;
	private SolAddress: PublicKey = new PublicKey("So11111111111111111111111111111111111111112");

	constructor(chainId: SolanaNetworkIds) {
		const rpcUrl = process.env.HELIUS_API_KEY
			? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
			: "https://api.mainnet.solana.com";
		this.connection = new Connection(rpcUrl, "confirmed");
		this.wallet = new Wallet(
			Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.EXECUTOR_PRIVATE_KEY || "[]"))),
		);
		this.provider = new AnchorProvider(this.connection, this.wallet, AnchorProvider.defaultOptions());
		this.raydiumVaultProgram = new Program<RaydiumVault>(raydiumVaultIdl as any, this.provider);
		this.meteoraVaultProgram = new Program<MeteoraVault>(meteoraVaultIdl as any, this.provider);
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
			// Add other required parameters from migration state
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
