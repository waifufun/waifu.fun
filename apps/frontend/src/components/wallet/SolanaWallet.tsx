import { WalletClass } from "./WalletClass";
import type { SolanaAddressLike, SolanaNetworkIds } from "@autofun/types";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";

export interface ISolanaFunctions {
	signMessage: (message: Uint8Array) => Promise<Uint8Array>;
	sendTransaction: (transaction: Transaction | VersionedTransaction) => Promise<string>;
}

export class SolanaWallet extends WalletClass {
	private _solanaFunctions: ISolanaFunctions;
	public readonly address: SolanaAddressLike;
	public readonly chain: SolanaNetworkIds;

	constructor(address: SolanaAddressLike, chain: SolanaNetworkIds, functions: ISolanaFunctions) {
		super();
		this.address = address;
		this.chain = chain;
		this._solanaFunctions = functions;
		console.log(`SolanaWallet instance created for address: ${address}, chain: ${chain}`);
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
		throw new Error("Method not implemented.");
	}
}
