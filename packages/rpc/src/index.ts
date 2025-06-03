import type { AddressLike, EvmAddressLike, EvmChainIds, TURLLike } from "@autofun/types";
import {
	createPublicClient,
	createWalletClient,
	erc20Abi,
	fallback,
	getAddress,
	http,
	type PublicClient,
	type ReadContractParameters,
	type WalletClient,
} from "viem";
import { CHAINID_TO_VIEM_CHAIN, EVM_RPC_URLS, SOLANA_RPC_URLS } from "@autofun/constants";
import type { SolanaNetworkIds } from "@autofun/types";
import { createSolanaRpc } from "@solana/kit";
import { Metaplex } from "@metaplex-foundation/js";
import { Program, AnchorProvider, type Idl, type Wallet } from "@coral-xyz/anchor";
import idl from "./idls/autofun.json";
import { Connection, PublicKey, type VersionedBlockResponse } from "@solana/web3.js";
import { updateCryptoPrices } from "@autofun/utils";
import type { AutoFunConfig, BondingCurveConfig } from "./evm/types/AutoFun";
import autoFunAbi from "./evm/abis/AutoFun.json";
import { EventEmitter } from 'events';
import type {SlotInfo} from "@autofun/types";
import logger from "@autofun/logger";

type Erc20FunctionName = ReadContractParameters<typeof erc20Abi>["functionName"];
type Erc20Args = ReadContractParameters<typeof erc20Abi>["args"];

export class EVMRpcProvider {
	public client: PublicClient;
	private walletClient?: WalletClient;
	private chainId: EvmChainIds;

	constructor(chainId: EvmChainIds, privateKey?: string) {
		if (!CHAINID_TO_VIEM_CHAIN[chainId]) throw new Error("ChainId does not exist in CHAINID_TO_VIEM_CHAIN");
		if (!EVM_RPC_URLS?.[chainId] || EVM_RPC_URLS?.[chainId]?.length === 0) {
			throw new Error(`No RPC provider configured for EVM: ${chainId}`);
		}

		this.chainId = chainId;
		this.client = createPublicClient({
			batch: {
				multicall: true,
			},
			chain: CHAINID_TO_VIEM_CHAIN[chainId],
			transport: fallback([...EVM_RPC_URLS[chainId].map((rpcUrl: string) => http(rpcUrl))]),
		});

		if (privateKey) {
			this.walletClient = createWalletClient({
				chain: CHAINID_TO_VIEM_CHAIN[chainId],
				transport: fallback([...EVM_RPC_URLS[chainId].map((rpcUrl: string) => http(rpcUrl))]),
			});
		}
	}

	async readErc20Contract(contractAddress: EvmAddressLike, functionName: Erc20FunctionName, args: Erc20Args) {
		return await this.client.readContract({
			address: getAddress(contractAddress),
			abi: erc20Abi,
			functionName,
			args,
		});
	}

	async readErc20Multicall(contractAddress: EvmAddressLike, functionNames: Erc20FunctionName[], args: Erc20Args[]) {
		const contract = {
			address: getAddress(contractAddress),
			abi: erc20Abi,
		} as const;
		const calls = [];

		for (let i = 0; i < functionNames?.length; i++) {
			const functionName = functionNames[i];
			if (functionName !== undefined) {
				calls.push({
					...contract,
					functionName,
					args: args?.[i] ? args?.[i] : undefined,
				});
			}
		}

		return await this.client.multicall({
			contracts: calls,
			allowFailure: false,
		});
	}

	async readMultipleErc20Multicall(
		contractAddresses: EvmAddressLike[],
		functionNames: Erc20FunctionName[],
		args: Erc20Args[],
	) {
		const calls = [];

		for (let i = 0; i < functionNames?.length; i++) {
			const contract = {
				address: getAddress(String(contractAddresses[i])),
				abi: erc20Abi,
			} as const;

			const functionName = functionNames[i];

			if (functionName !== undefined) {
				calls.push({
					...contract,
					functionName,
					args: args?.[i] ? args?.[i] : undefined,
				});
			}
		}

		return await this.client.multicall({
			contracts: calls,
			allowFailure: false,
		});
	}

	getTokenBalance = async (contractAddress: EvmAddressLike, owner: EvmAddressLike, raw?: boolean) => {
		const [balanceRaw, decimals] = await this.readErc20Multicall(
			getAddress(contractAddress),
			["balanceOf", "decimals"],
			[[getAddress(owner)], undefined],
		);

		if (raw) {
			return Number(balanceRaw);
		}

		return Number(balanceRaw) / 10 ** Number(decimals);
	};

	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	async readAutoFunContract(contractAddress: EvmAddressLike, functionName: string, args: any[]) {
		return await this.client.readContract({
			address: getAddress(contractAddress),
			abi: autoFunAbi.abi,
			functionName,
			args,
		});
	}
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	async writeAutoFunContract(contractAddress: EvmAddressLike, functionName: string, args: any[]) {
		if (!this.walletClient) {
			throw new Error("Wallet client not initialized. Please provide a private key in the constructor.");
		}

		return await this.walletClient.writeContract({
			address: getAddress(contractAddress),
			abi: autoFunAbi.abi,
			functionName,
			args,
			chain: CHAINID_TO_VIEM_CHAIN[this.chainId],
			account: this.walletClient.account ?? null,
		});
	}

	async launch(contractAddress: EvmAddressLike, config: AutoFunConfig) {
		return await this.writeAutoFunContract(contractAddress, "launch", [config]);
	}

	async launchAndSwap(contractAddress: EvmAddressLike, launchConfig: AutoFunConfig, swapConfig: BondingCurveConfig) {
		return await this.writeAutoFunContract(contractAddress, "launchAndSwap", [launchConfig, swapConfig]);
	}

	async swap(contractAddress: EvmAddressLike, config: BondingCurveConfig) {
		return await this.writeAutoFunContract(contractAddress, "swap", [config]);
	}

	async withdraw(contractAddress: EvmAddressLike, token: EvmAddressLike, amount: bigint) {
		return await this.writeAutoFunContract(contractAddress, "withdraw", [token, amount]);
	}

	async getLaunchedTokensByOwner(contractAddress: EvmAddressLike, owner: EvmAddressLike) {
		return await this.readAutoFunContract(contractAddress, "getLaunchedTokensByOwner", [owner]);
	}

	async getAllLaunchedTokens(contractAddress: EvmAddressLike) {
		return await this.readAutoFunContract(contractAddress, "getAllLaunchedTokens", []);
	}
}

const RETRYABLE_HTTP_CODES = new Set([429, 503]);

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function shouldFallback(error: any): boolean {
	const status = error?.response?.status || error?.statusCode || error?.code;

	if (typeof status === "number" && RETRYABLE_HTTP_CODES.has(status)) {
		return true;
	}

	const msg = error?.message?.toLowerCase() || "";
	return msg.includes("timeout") || msg.includes("network");
}

function withFallBack<TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => Promise<TResult>,
	ctx: SolanaRpcProvider,
	timeoutMs = 15000, // 15 seconds
): (...args: TArgs) => Promise<TResult> {
	return async (...args: TArgs) => {
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		const timeoutPromise = new Promise<never>((_, reject) => {
			timeoutId = setTimeout(() => {
				logger.warn(`RPC call timed out after ${timeoutMs}ms`);
				reject(new Error("Timeout exceeded"));
			}, timeoutMs);
		});

		try {
			const result = await Promise.race([fn.apply(ctx, args), timeoutPromise]);
			clearTimeout(timeoutId);
			return result;
		} catch (error) {
			clearTimeout(timeoutId);
			if (!shouldFallback(error)) {
				throw error;
			}
			logger.warn(`Falling back to next RPC due to: ${error}`);
			const rpcList = SOLANA_RPC_URLS?.[ctx.networkId];
			if (rpcList && rpcList.length > 1) {
				SolanaRpcProvider.currentRpcIndex = (SolanaRpcProvider.currentRpcIndex + 1) % rpcList.length;
			}
			const fallback = await SolanaRpcProvider.connect(ctx.networkId);
			return await fn.apply(fallback, args);
		}
	};
}

export class SolanaRpcProvider extends EventEmitter {
	public connection;
	public client;
	private program;
	public networkId: SolanaNetworkIds;
	private static currentRpc: SolanaRpcProvider | null = null;
	public static currentRpcIndex = 0;
	private subscriptions: Map<number, { type: string; cleanup?: () => void }> = new Map();

	constructor(networkId: SolanaNetworkIds) {
		super();
		const rpc = SOLANA_RPC_URLS?.[networkId]?.[0];
		if (!rpc) {
			throw new Error(`No RPC URL configured for Solana network: ${networkId}`);
		}
		this.connection = new Connection(rpc, "confirmed");
		this.client = createSolanaRpc(rpc);
		this.networkId = networkId;

		const dummyWallet = {
			publicKey: new PublicKey("11111111111111111111111111111111"),
			// biome-ignore lint/suspicious/noExplicitAny: spoofing wallet
			signTransaction: async (tx: any) => tx,
			// biome-ignore lint/suspicious/noExplicitAny: spoofing wallet
			signAllTransactions: async (txs: any[]) => txs,
		};

		const provider = new AnchorProvider(this.connection, dummyWallet as Wallet, {});
		this.program = new Program(idl as Idl, provider);
	}

	public subscribeSlot = withFallBack(async (
		callback: (slotInfo: SlotInfo) => void
	): Promise<number> => {
		const subscriptionId = this.connection.onSlotChange((slotInfo) => {
		  const slotData: SlotInfo = {
			slot: slotInfo.slot,
			parent: slotInfo.parent,
			root: slotInfo.root,
		  };
		  
		  callback(slotData);
		  this.emit('slot:change', slotData);
		});
	
		// Track the subscription
		this.subscriptions.set(subscriptionId, {
		  type: 'slot',
		  cleanup: () => this.connection.removeSlotChangeListener(subscriptionId),
		});
	
		logger.info(`Subscribed to slot changes with subscription ID: ${subscriptionId}`);
		return subscriptionId;
	}, this);

	public unsubscribe(subscriptionId: number): boolean {
		const subscription = this.subscriptions.get(subscriptionId);
		
		if (!subscription) {
		  logger.warn(`Subscription ${subscriptionId} not found`);
		  return false;
		}
	
		try {
		  if (subscription.cleanup) {
			subscription.cleanup();
		  }
		  
		  this.subscriptions.delete(subscriptionId);
		  logger.info(`Unsubscribed from subscription ${subscriptionId}`);
		  this.emit('subscription:removed', subscriptionId);
		  return true;
		} catch (error) {
		  logger.error(`Error unsubscribing from ${subscriptionId}:`, error);
		  return false;
		}
	}

	public unsubscribeAll(): void {
		logger.info(`Unsubscribing from ${this.subscriptions.size} active subscriptions`);
		
		for (const [subscriptionId, subscription] of this.subscriptions) {
		  try {
			if (subscription.cleanup) {
			  subscription.cleanup();
			}
		  } catch (error) {
			logger.error(`Error cleaning up subscription ${subscriptionId}:`, error);
		  }
		}
		
		this.subscriptions.clear();
		this.emit('subscriptions:cleared');
		logger.info('All subscriptions cleared');
	}

	public getActiveSubscriptionCount(): number {
		return this.subscriptions.size;
	}

	public getActiveSubscriptions(): Array<{ id: number; type: string }> {
		return Array.from(this.subscriptions.entries()).map(([id, sub]) => ({
		  id,
		  type: sub.type,
		}));
	}

	public destroy(): void {
		this.unsubscribeAll();
		this.removeAllListeners();
	}

	static async connect(networkId: SolanaNetworkIds): Promise<SolanaRpcProvider> {
		if (SolanaRpcProvider.currentRpc && SolanaRpcProvider.currentRpc.networkId === networkId) {
			return SolanaRpcProvider.currentRpc;
		}

		const rpcList = SOLANA_RPC_URLS?.[networkId];
		if (!rpcList || rpcList.length === 0) {
			throw new Error(`No RPC URLs configured for Solana: ${networkId}`);
		}

		let attempts = 0;
		const maxAttempts = rpcList.length;

		while (attempts < maxAttempts) {
			const rpc = rpcList[SolanaRpcProvider.currentRpcIndex];
			if (!rpc) {
				throw new Error(`No RPC URL found at index ${SolanaRpcProvider.currentRpcIndex} for Solana: ${networkId}`);
			}
			try {
				const connection = new Connection(rpc as string, "confirmed");
				await connection.getVersion(); // test connection
				const provider = new SolanaRpcProvider(networkId);
				SolanaRpcProvider.currentRpc = provider;
				return provider;
			} catch (error) {
				logger.warn(`Failed RPC: ${rpc}. Trying next...`);
				SolanaRpcProvider.currentRpcIndex = (SolanaRpcProvider.currentRpcIndex + 1) % rpcList.length;
				attempts++;
			}
		}

		throw new Error("All RPC endpoints failed. Cannot connect to Solana.");
	}

	getTokenMetadata = withFallBack(async (contractAddress: string) => {
		const metaplex = new Metaplex(this.connection);
		const mint = new PublicKey(contractAddress);
		const metadata = await metaplex.nfts().findByMint({ mintAddress: mint });
		const uri = metadata?.uri || undefined;

		if (!uri) throw new Error("No URI could be determined for token.");

		const uriData = (await fetch(uri).then(async (resp) => await resp.json())) as {
			name: string;
			symbol: string;
			description: string;
			image: TURLLike;
			showName: boolean;
			createdOn: string;
			twitter: string;
			website: string;
			telegram: string;
			discord: string;
		};

		return {
			...metadata?.json,
			totalSupply: metadata?.mint?.supply?.basisPoints?.toNumber() || 0,
			creator: metadata?.creators?.[0]?.address?.toBase58(),
			decimals: metadata?.mint?.decimals || 6,
			...uriData,
		};
	}, this);

	private getTokenSupplies = withFallBack(async (mintAddresses: PublicKey[]) => {
		const tokenAccounts = await this.connection.getMultipleAccountsInfo(mintAddresses);
		return tokenAccounts.map((acc, i) => {
			if (!acc) return { mint: mintAddresses[i], supply: 0, decimals: 0 };
			const data = acc.data;
			const supply = Number(data.readBigUInt64LE(36));
			const decimals = data.readUInt8(44);
			return { mint: mintAddresses[i], supply, decimals };
		});
	}, this);

	getBondingCurveInfo = withFallBack(async (contractAddresses: string[]) => {
		if (!contractAddresses || contractAddresses?.length === 0) return [];
		const tokenMints: PublicKey[] = contractAddresses.map((addr) => new PublicKey(addr));

		if (!tokenMints || tokenMints?.length === 0) return [];

		const PROGRAM_ID = this.program.programId;

		const bondingCurvePDAs = await Promise.all(
			tokenMints.map((mint) =>
				PublicKey.findProgramAddress([Buffer.from("bonding_curve"), mint.toBuffer()], PROGRAM_ID).then(([pda]) => pda),
			),
		);

		const cryptoPrices = await updateCryptoPrices({});
		const solanaUsdPrice = cryptoPrices.solana;

		if (!solanaUsdPrice) throw new Error("Unable to determine Solana USD price");

		const accountInfos = await this.connection.getMultipleAccountsInfo(bondingCurvePDAs);
		const supplies = await this.getTokenSupplies(tokenMints);

		const bondingCurves = accountInfos.map((info, i) => {
			if (!info) return null;

			try {
				return this.program.coder.accounts.decode("bondingCurve", info.data);
			} catch (err) {
				logger.error(
					"Failed to decode bonding curve for",
					tokenMints?.[i] ? tokenMints[i].toBase58() : undefined,
					err,
				);
				return null;
			}
		});

		return bondingCurves.map((curve, i) => {
			const mint = tokenMints?.[i] ? tokenMints[i].toBase58() : undefined;
			const bondingCurveAddress = bondingCurvePDAs[i]?.toBase58();
			const supplyInfo = supplies[i];

			if (!supplyInfo) throw new Error(`Unable to determine supplyInfo for token: ${mint}`);

			// TODO - Ensure non valid values are just skipped entirely if we see such token
			if (!curve || !curve.reserveToken || String(curve.reserveToken) === "0") {
				return {
					tokenMint: mint,
					curveCompleted: null,
					priceLamports: null,
					priceSOL: null,
					marketCapSOL: null,
					marketCapUSD: null,
					exists: false,
					reserveLamport: 0,
					reserveToken: 0,
					virtualReserves: 0,
					curveLimit: 0,
					curveProgress: 0,
					priceUSD: 0,
					decimals: supplyInfo.decimals || 6,
					totalSupply: supplyInfo.supply || 0,
				};
			}

			const reserveLamport = Number(curve.reserveLamport);
			const reserveToken = Number(curve.reserveToken);
			const tokenDecimals = supplyInfo.decimals || 6;

			const priceSOL = reserveLamport / 1e9 / (reserveToken / 10 ** tokenDecimals);
			const priceUsd = solanaUsdPrice * priceSOL;
			const totalSupply = supplyInfo.supply;
			const marketCapSOL = (totalSupply / 10 ** tokenDecimals) * priceSOL;
			const marketCapUSD = marketCapSOL * solanaUsdPrice;

			const virtualReserves = Number(curve.initLamport);
			const curveLimit = Number(curve.curveLimit);
			const curveProgress =
				curveLimit > virtualReserves ? ((reserveLamport - virtualReserves) / (curveLimit - virtualReserves)) * 100 : 0;

			const creator = curve.creator.toBase58();

			return {
				contractAddress: mint,
				bondingCurveAddress,
				creator: creator ? creator : undefined,
				curveCompleted: curve.isCompleted,
				curveProgress: Math.min(Math.max(curveProgress, 0), 100),
				priceLamports: reserveLamport / reserveToken,
				decimals: tokenDecimals,
				virtualReserves,
				reserveLamport,
				curveLimit,
				priceSOL,
				priceUsd,
				totalSupply,
				marketCapSOL,
				marketCapUSD,
				exists: true,
			};
		});
	}, this);

	getTokenBalance = withFallBack(async (contractAddress: AddressLike, owner: AddressLike, raw?: boolean) => {
		const mint = new PublicKey(contractAddress);
		const ownerAddress = new PublicKey(owner);

		const tokenAccounts = await this.connection.getTokenAccountsByOwner(ownerAddress, {
			mint,
		});

		if (!tokenAccounts.value.length) return 0;

		const accountData = tokenAccounts.value[0]?.account.data;
		const amount = Number(accountData?.readBigUInt64LE(64));

		const accountInfo = await this.connection.getParsedAccountInfo(mint);
		const decimals =
			accountInfo.value?.data && "parsed" in accountInfo.value.data ? accountInfo.value.data.parsed.info.decimals : 6;

		if (raw) {
			return amount;
		}

		return amount / 10 ** decimals;
	}, this);

	getBlock = withFallBack(async (blockNumber: number): Promise<VersionedBlockResponse | null> => {
		const block = await this.connection.getBlock(blockNumber, {
			maxSupportedTransactionVersion: 0,
		});
		return block as VersionedBlockResponse | null;
	}, this);

	getSignaturesForAddress = withFallBack(
		async (address: AddressLike, options?: { limit?: number; before?: string; until?: string }) => {
			const publicKey = new PublicKey(address);
			return await this.connection.getSignaturesForAddress(publicKey, options);
		},
		this,
	);

	getTransaction = withFallBack(async (signature: string) => {
		return await this.connection.getTransaction(signature, {
			maxSupportedTransactionVersion: 0,
		});
	}, this);


	getSlot = withFallBack(async () => {
		return await this.connection.getSlot();
	}, this);
}
