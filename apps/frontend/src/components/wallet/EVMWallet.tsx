import { WalletClass } from "./WalletClass";
import type { EvmAddressLike } from "@autofun/types";
import type { EvmChainIds } from "@autofun/types";
import { getPublicClient, getWalletClient } from "wagmi/actions";
import { http } from "viem";
import { base } from "@reown/appkit/networks";
import { config } from "@/app/providers";
import { formatEther } from "viem";
// import { EVMRpcProvider } from '@autofun/rpc';

export interface IEVMFunctions {
	signMessage: (message: string) => Promise<string>;
	// biome-ignore lint/suspicious/noExplicitAny: implementation comes later
	sendTransaction: (transaction: any) => Promise<any>;
	switchNetwork?: (networkId: EvmChainIds) => Promise<void>;
	chainId: EvmChainIds;
}

export interface TokenMetadata {
	name: string;
	symbol: string;
	metadataUrl: string;
	buyAmount?: number;
}

export class EVMWallet extends WalletClass {
	public readonly address: EvmAddressLike;
	public readonly chain: EvmChainIds;
	private _evmFunctions: IEVMFunctions;
	private _rpcClient: any;
	// private _rpcProvider: EVMRpcProvider;

	constructor(address: EvmAddressLike, chain: EvmChainIds, functions: IEVMFunctions) {
		super();
		this._evmFunctions = functions;
		this.address = address;
		this.chain = chain;
		this._initializeRpcClient();
		// this._rpcProvider = new EVMRpcProvider(chain);
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

			const rpcUrl = this.chain === base.id ? "https://mainnet.base.org" : "https://sepolia.base.org";

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

	// async createToken(tokenData: TokenMetadata): Promise<any> {
	// 	console.log("EVMWallet: Creating token with data:", tokenData);
	// 	console.log("virtualLamportReserves:", process.env.NEXT_PUBLIC_VIRTUAL_RESERVES);
	// 	console.log("tokenSupply:", process.env.NEXT_PUBLIC_TOKEN_SUPPLY);
	// 	console.log("decimals:", process.env.NEXT_PUBLIC_DECIMALS);

	// 	try {
	// 		await this.switchNetwork();

	// 		const decimals = Number(process.env.NEXT_PUBLIC_DECIMALS);
	// 		const tokenSupply = BigInt(process.env.NEXT_PUBLIC_TOKEN_SUPPLY || "0");
	// 		const virtualReserves = BigInt(process.env.NEXT_PUBLIC_VIRTUAL_RESERVES || "0");
	// 		const slippageBps = 100; // 1% slippage

	// 		const launchConfig = {
	// 			name: tokenData.name,
	// 			symbol: tokenData.symbol,
	// 			initialSupply: tokenSupply,
	// 			maxSupply: tokenSupply,
	// 			owner: this.address as `0x${string}`,
	// 			decimals: decimals,
	// 			metadataUrl: tokenData.metadataUrl
	// 		};

	// 		if (tokenData.buyAmount && tokenData.buyAmount > 0) {
	// 			const buyAmount = BigInt(tokenData.buyAmount);
	// 			const initBondingCurvePercentage = 10n; // 10% initial bonding curve
	// 			const initBondingCurveAmount = (tokenSupply * initBondingCurvePercentage) / 100n;

	// 			// Calculate expected output using constant product formula: dy = (y * dx) / (x + dx)
	// 			const numerator = virtualReserves * buyAmount;
	// 			const denominator = initBondingCurveAmount + buyAmount;
	// 			const expectedOutput = numerator / denominator;

	// 			// Apply slippage to expected output
	// 			const minOutput = (expectedOutput * BigInt(10000 - slippageBps)) / 10000n;

	// 			const swapConfig = {
	// 				token: this.address as `0x${string}`,
	// 				amountIn: buyAmount,
	// 				minAmountOut: minOutput,
	// 			};

	// 			return await this._rpcProvider.launchAndSwap(this.address as `0x${string}`, launchConfig, swapConfig);
	// 		} else {
	// 			return await this._rpcProvider.launch(this.address as `0x${string}`, launchConfig);
	// 		}
	// 	} catch (error) {
	// 		console.error("EVMWallet: Error creating token:", error);
	// 		throw error;
	// 	}
	// }

	// {/* Malibu - this is without using the rpc package*/}
	private async launchAndSwapTx(
		tokenData: TokenMetadata,
		decimals: number,
		tokenSupply: number,
		virtualReserves: number,
		swapAmount: number,
		slippageBps = 100,
	) {
		await this.switchNetwork();
		console.log("EVMWallet: Creating launch and swap transaction...");

		try {
			if (!this._rpcClient) {
				throw new Error("No provider available for transaction");
			}

			const deadline = Math.floor(Date.now() / 1000) + 120; // 2 minutes

			const initBondingCurvePercentage = 100; // Default to 100%
			const initBondingCurveAmount = (tokenSupply * initBondingCurvePercentage) / 100;

			// Calculate expected output using constant product formula: dy = (y * dx) / (x + dx)
			const numerator = virtualReserves * swapAmount;
			const denominator = initBondingCurveAmount + swapAmount;
			const expectedOutput = Math.floor(numerator / denominator);

			// Apply slippage to expected output
			const minOutput = Math.floor((expectedOutput * (10000 - slippageBps)) / 10000);

			const tx = {
				to: this._rpcClient.address,
				data: this._rpcClient.interface.encodeFunctionData("launchAndSwap", [
					decimals,
					tokenSupply,
					virtualReserves,
					tokenData.name,
					tokenData.symbol,
					tokenData.metadataUrl,
					swapAmount,
					minOutput,
					deadline,
				]),
				value: swapAmount,
			};

			return tx;
		} catch (error) {
			console.error("EVMWallet: Error creating launch and swap transaction:", error);
			throw error;
		}
	}

	async createToken(tokenData: TokenMetadata): Promise<any> {
		console.log("EVMWallet: Creating token with data:", tokenData);
		console.log("virtualLamportReserves:", process.env.NEXT_PUBLIC_VIRTUAL_RESERVES);
		console.log("tokenSupply:", process.env.NEXT_PUBLIC_TOKEN_SUPPLY);
		console.log("decimals:", process.env.NEXT_PUBLIC_DECIMALS);

		try {
			await this.switchNetwork();

			const decimals = Number(process.env.NEXT_PUBLIC_DECIMALS);
			const tokenSupply = Number(process.env.NEXT_PUBLIC_TOKEN_SUPPLY);
			const virtualReserves = Number(process.env.NEXT_PUBLIC_VIRTUAL_RESERVES);

			if (tokenData.buyAmount && tokenData.buyAmount > 0) {
				const tx = await this.launchAndSwapTx(tokenData, decimals, tokenSupply, virtualReserves, tokenData.buyAmount);
				return await this.sendTransaction(tx);
			} else {
				const tx = {
					to: this._rpcClient.address,
					data: this._rpcClient.interface.encodeFunctionData("launch", [
						decimals,
						tokenSupply,
						virtualReserves,
						tokenData.name,
						tokenData.symbol,
						tokenData.metadataUrl,
					]),
				};
				return await this.sendTransaction(tx);
			}
		} catch (error) {
			console.error("EVMWallet: Error creating token:", error);
			throw error;
		}
	}
}
