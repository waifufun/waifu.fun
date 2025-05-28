import { WalletClass } from "./WalletClass";
import type { EvmAddressLike } from "@autofun/types";
import { EvmChainIds } from "@autofun/types";
import { getPublicClient, getWalletClient } from 'wagmi/actions';
import { http } from 'viem';
import { base, baseSepolia } from '@reown/appkit/networks';
import { config } from '@/app/providers';
import { formatEther } from 'viem';

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
	private _rpcClient: any;

	constructor(address: EvmAddressLike, chain: EvmChainIds, functions: IEVMFunctions) {
		super();
		this._evmFunctions = functions;
		this.address = address;
		this.chain = chain;
		this._initializeRpcClient();
		console.log(`EVMWallet instance created for address: ${address}, chain: ${chain}`);
	}

	private async _initializeRpcClient() {
		try {
			const walletClient = await getWalletClient(config);
			if (walletClient) {
				this._rpcClient = walletClient;
				console.log("Using injected provider");
				return;
			}

			const publicClient = getPublicClient(config);
			if (publicClient) {
				this._rpcClient = publicClient;
				console.log("Using RPC fallback");
				return;
			}

			const rpcUrl = this.chain === base.id 
				? 'https://mainnet.base.org'
				: 'https://sepolia.base.org';
			
			this._rpcClient = http(rpcUrl);
			console.log("Using direct RPC connection");
		} catch (error) {
			console.error("Error initializing RPC client:", error);
			throw error;
		}
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
		await this.switchNetwork();
		console.log("EVMWallet: Signing transaction...");
		try {
			if (this._evmFunctions.sendTransaction) {
				const signedTx = await this._evmFunctions.sendTransaction(transaction);
				console.log("EVMWallet: Transaction signed successfully with injected provider.");
				return signedTx;
			}

			if (this._rpcClient) {
				const signedTx = await this._rpcClient.sendTransaction(transaction);
				console.log("EVMWallet: Transaction signed successfully with RPC client.");
				return signedTx;
			}

			throw new Error("No provider available for transaction");
		} catch (error) {
			console.error("EVMWallet: Error signing transaction:", error);
			throw error;
		}
	}

	async signMessage(message: string): Promise<string> {
		await this.switchNetwork();
		console.log("EVMWallet: Signing message...");
		try {
			if (this._evmFunctions.signMessage) {
				const signature = await this._evmFunctions.signMessage(message);
				console.log("EVMWallet: Message signed successfully with injected provider.");
				return signature;
			}

			if (this._rpcClient) {
				const signature = await this._rpcClient.signMessage(message);
				console.log("EVMWallet: Message signed successfully with RPC client.");
				return signature;
			}

			throw new Error("No provider available for signing");
		} catch (error) {
			console.error("EVMWallet: Error signing message:", error);
			throw error;
		}
	}

	async getNativeBalance(): Promise<number> {
		try {
			await this.switchNetwork();
			console.log("EVMWallet: Getting native balance...");

			if (this._rpcClient) {
				const balance = await this._rpcClient.getBalance({
					address: this.address as `0x${string}`,
				});
				
				const balanceInEther = Number(formatEther(balance));
				console.log(`EVMWallet: Native balance: ${balanceInEther} ETH`);
				return balanceInEther;
			}

			throw new Error("No provider available for getting balance");
		} catch (error) {
			console.error("EVMWallet: Error getting native balance:", error);
			throw error;
		}
	}

	async createToken(): Promise<void> {
		throw new Error("Method not implemented.");
	}
}
