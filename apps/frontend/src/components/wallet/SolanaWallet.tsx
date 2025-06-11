import type { Autofun } from "@/lib/autofun";
import { WalletClass } from "./WalletClass";
import type { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import { BN, Program } from "@coral-xyz/anchor";
import {
	type Connection,
	PublicKey,
	type Transaction,
	type VersionedTransaction,
	SystemProgram,
} from "@solana/web3.js";
import bs58 from "bs58";
import { AnchorProvider } from "@coral-xyz/anchor";
import IDL from "@/lib/autofun.json";
import type { TokenMetadata } from "../hooks/providers/usePromptContext";
import { SEED_CONFIG } from "../hooks/hook/UseProgram";
import { ComputeBudgetProgram, type Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

export interface ISolanaFunctions {
	signMessage: (message: Uint8Array) => Promise<Uint8Array>;
	sendTransaction: (transaction: Transaction | VersionedTransaction) => Promise<string>;
	signTransaction: <T extends Transaction | VersionedTransaction>(transaction: T) => Promise<T>;
	signAllTransactions: <T extends Transaction | VersionedTransaction>(transactions: T[]) => Promise<T[]>;
	connection: Connection;
}

export type CreateTokenResponse = {
	mintPublicKey: PublicKey;
	userPublicKey: PublicKey;
	signature: string;
};

export class SolanaWallet extends WalletClass {
	private _solanaFunctions: ISolanaFunctions;
	public readonly address: SolanaAddressLike;
	public readonly chain: SolanaNetworkIds;
	private program: Program<Autofun>;

	constructor(address: SolanaAddressLike, chain: SolanaNetworkIds, functions: ISolanaFunctions) {
		super();
		this.address = address;
		this.chain = chain;
		this._solanaFunctions = functions;
		this._createProgram();
		console.log(`SolanaWallet instance created for address: ${address}, chain: ${chain}`);
	}

	async _createProgram(): Promise<void> {
		if (!this.program) {
			try {
				const provider = new AnchorProvider(
					this._solanaFunctions.connection,
					{
						publicKey: new PublicKey(this.address),
						signTransaction: this._solanaFunctions.signTransaction,
						signAllTransactions: this._solanaFunctions.signAllTransactions,
					},
					AnchorProvider.defaultOptions(),
				);
				this.program = new Program<Autofun>(IDL, provider);
				console.log("SolanaWallet: Program created successfully.");
			} catch (error) {
				console.error("SolanaWallet: Error creating program:", error);
				throw error;
			}
		}
	}

	async sendTransaction(transaction: Transaction | VersionedTransaction): Promise<string> {
		console.log("SolanaWallet: Signing transaction...");
		try {
			const sig = await this._solanaFunctions.sendTransaction(transaction);
			console.log("SolanaWallet: Transaction signed successfully. Signature:", sig);
			return sig;
		} catch (error) {
			console.error("SolanaWallet: Error sending transaction:", error);
			throw error;
		}
	}

	async signMessage(message: string): Promise<string> {
		console.log("SolanaWallet: Signing message...");
		try {
			const messageBytes = new TextEncoder().encode(message);
			const signatureBytes = await this._solanaFunctions.signMessage(messageBytes);
			const signatureBase58 = bs58.encode(signatureBytes);
			console.log("SolanaWallet: Signed Message (Base58):", signatureBase58);
			return signatureBase58;
		} catch (error) {
			console.error("SolanaWallet: Error signing message:", error);
			throw error;
		}
	}

	async getNativeBalance(): Promise<number> {
		try {
			const balance = await this._solanaFunctions.connection.getBalance(new PublicKey(this.address));
			console.log(`SolanaWallet: Native balance for ${this.address} is ${balance} lamports.`);

			// Convert lamports to SOL (1 SOL = 1e9 lamports)
			// and round down to 4 decimal places
			const roundedBalance = Math.floor((balance / 1e9) * 10000) / 10000;

			return roundedBalance;
		} catch (error) {
			console.error("SolanaWallet: Error getting native balance:", error);
			throw error;
		}
	}

	private calculateBondingCurveParams(
		curveLimit: number,
		decimals: number,
	): {
		virtualLamportReserves: number;
		initBondingCurve: number;
	} {
		const defaultCurveLimit = Number(process.env.NEXT_PUBLIC_CURVE_LIMIT) / LAMPORTS_PER_SOL;
		const defaultVirtualReserves = Number(process.env.NEXT_PUBLIC_VIRTUAL_RESERVES);
		const normalizedCurveLimit = curveLimit / decimals;

		const defaultInitBondingCurve = 75;
		// Calculate the ratio based on curve limit
		const ratio = normalizedCurveLimit / defaultCurveLimit;

		// Calculate new values maintaining the same proportions
		const virtualLamportReserves = Math.floor(defaultVirtualReserves * ratio);
		const initBondingCurve = defaultInitBondingCurve;

		return { virtualLamportReserves, initBondingCurve };
	}

	private launchAndSwapTx = async (
		creator: PublicKey,
		decimals: number,
		tokenSupply: number,
		curveLimit: number,
		name: string,
		symbol: string,
		uri: string,
		swapAmount: number,
		slippageBps: number,
		connection: Connection,
		program: Program<Autofun>,
		mintKeypair: Keypair,
		configAccount: {
			teamWallet: PublicKey;
			authority: PublicKey;
			pendingAuthority: PublicKey;
			platformBuyFee: BN;
			platformSellFee: BN;
			lamportAmountConfig: any;
			tokenSupplyConfig: any;
			tokenDecimalsConfig: any;
			isInstantTrading: boolean;
		},
	) => {
		const slippage = slippageBps ? slippageBps : 100;
		const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now

		// Calculate bonding curve parameters
		const { virtualLamportReserves, initBondingCurve } = this.calculateBondingCurveParams(curveLimit, decimals);

		// Calculate init_bonding_curve amount as a percentage of total supply
		const initBondingCurveAmount = Math.floor((tokenSupply * initBondingCurve) / 100);

		// Calculate expected output using constant product formula: dy = (y * dx) / (x + dx)
		const numerator = virtualLamportReserves * swapAmount;
		const denominator = initBondingCurveAmount + swapAmount;
		const expectedOutput = Math.floor(numerator / denominator);

		// Apply slippage to expected output
		const minOutput = Math.floor((expectedOutput * (10000 - slippage)) / 10000);

		const tx = await program.methods
			.launchAndSwap(
				decimals,
				new BN(tokenSupply),
				new BN(virtualLamportReserves),
				new BN(curveLimit),
				initBondingCurve,
				name,
				symbol,
				uri,
				new BN(swapAmount),
				new BN(minOutput),
				new BN(deadline),
			)
			.accounts({
				teamWallet: configAccount.teamWallet,
				creator: creator,
				token: mintKeypair.publicKey,
			})
			.transaction();

		tx.feePayer = creator;
		tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

		return tx;
	};

	public override async createToken(tokenData: TokenMetadata): Promise<CreateTokenResponse> {
		console.log("SolanaWallet: Creating token with data:", tokenData);
		const [configPda] = PublicKey.findProgramAddressSync([Buffer.from(SEED_CONFIG)], this.program.programId);

		const configAccount = await this.program.account.config.fetch(configPda);

		const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
			units: 300000,
		});

		const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
			microLamports: 50000,
		});

		// Calculate bonding curve parameters
		const curveLimit = tokenData.curveLimit
			? Number(tokenData.curveLimit) * 10 ** Number(process.env.NEXT_PUBLIC_DECIMALS)
			: Number(process.env.NEXT_PUBLIC_CURVE_LIMIT);
		const decimals = Number(process.env.NEXT_PUBLIC_DECIMALS);
		const { virtualLamportReserves, initBondingCurve } = this.calculateBondingCurveParams(curveLimit, decimals);

		const tx =
			tokenData.buyAmount > 0
				? await this.launchAndSwapTx(
						new PublicKey(this.address),
						Number(process.env.NEXT_PUBLIC_DECIMALS),
						Number(process.env.NEXT_PUBLIC_TOKEN_SUPPLY),
						curveLimit,
						tokenData.name,
						tokenData.symbol,
						tokenData.metadataUrl,
						tokenData.buyAmount * LAMPORTS_PER_SOL,
						100,
						this._solanaFunctions.connection,
						this.program,
						tokenData.mintKeyPair,
						configAccount,
					)
				: await this.program.methods
						.launch(
							Number(process.env.NEXT_PUBLIC_DECIMALS),
							new BN(Number(process.env.NEXT_PUBLIC_TOKEN_SUPPLY)),
							new BN(virtualLamportReserves),
							new BN(curveLimit),
							initBondingCurve,
							tokenData.name,
							tokenData.symbol,
							tokenData.metadataUrl,
						)
						.accounts({
							creator: new PublicKey(this.address),
							token: tokenData.mintKeyPair.publicKey,
							teamWallet: configAccount.teamWallet,
						})
						.transaction();

		tx.instructions = [modifyComputeUnits, addPriorityFee, ...tx.instructions];

		tx.feePayer = new PublicKey(this.address);
		const { blockhash, lastValidBlockHeight } = await this._solanaFunctions.connection.getLatestBlockhash();
		tx.recentBlockhash = blockhash;

		// Sign the transaction with the mint keypair
		tx.sign(tokenData.mintKeyPair);

		// Request the user's signature via Phantom
		const signedTx = await this._solanaFunctions.signTransaction(tx);
		const txId = await this._solanaFunctions.connection.sendRawTransaction(signedTx.serialize(), {
			preflightCommitment: "confirmed",
			maxRetries: 5,
		});

		await this._solanaFunctions.connection.confirmTransaction(
			{
				signature: txId,
				blockhash,
				lastValidBlockHeight,
			},
			"finalized",
		);

		return {
			mintPublicKey: tokenData.mintKeyPair.publicKey,
			userPublicKey: new PublicKey(this.address),
			signature: txId,
		};
	}
}
