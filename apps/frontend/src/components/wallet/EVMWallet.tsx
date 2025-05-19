import { WalletClass } from "./WalletClass";
import type { EvmAddressLike, EvmChainIds } from "@autofun/types";

export interface IEVMFunctions {
	signMessage: (message: string) => Promise<string>;
	// biome-ignore lint/suspicious/noExplicitAny: implementation comes later
	sendTransaction: (transaction: any) => Promise<any>;
	switchNetwork?: (networkId: EvmChainIds) => Promise<void>;
	chainId: EvmChainIds;
}

export class EVMWallet extends WalletClass {
	public readonly address: EvmAddressLike;
	public readonly chain: EvmChainIds;
	private _evmFunctions: IEVMFunctions;

	constructor(address: EvmAddressLike, chain: EvmChainIds, functions: IEVMFunctions) {
		super();
		this._evmFunctions = functions;
		this.address = address;
		this.chain = chain;
		console.log(`EVMWallet instance created for address: ${address}, chain: ${chain}`);
	}

	private async switchNetwork(): Promise<void> {
		try {
			if (!(this._evmFunctions.chainId === this.chain)) {
				console.log(`EVMWallet: Switching network from ${this._evmFunctions.chainId} to ${this.chain}`);
				await this._evmFunctions.switchNetwork?.(this.chain);
				console.log("EVMWallet: Network switched successfully.");
			}
		} catch (error) {
			console.error("EVMWallet: Error switching network:", error);
			throw error;
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: implementation comes later
	async sendTransaction(transaction: any): Promise<any> {
		this.switchNetwork();
		console.log("EVMWallet: Signing transaction...");
		try {
			const signedTx = await this._evmFunctions.sendTransaction(transaction);
			console.log("EVMWallet: Transaction signed successfully.");
			return signedTx;
		} catch (error) {
			console.error("EVMWallet: Error signing transaction:", error);
			throw error;
		}
	}

	async signMessage(message: string): Promise<string> {
		this.switchNetwork();
		console.log("EVMWallet: Signing message...");
		try {
			const signature = await this._evmFunctions.signMessage(message);
			console.log("EVMWallet: Signed Message:", signature);
			return signature;
		} catch (error) {
			console.error("EVMWallet: Error signing message:", error);
			throw error;
		}
	}

	async getNativeBalance(): Promise<number> {
		throw new Error("Method not implemented.");
	}
}
