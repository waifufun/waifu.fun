import { EventEmitter } from "node:events";
import { AnchorProvider, type Program, type Wallet } from "@coral-xyz/anchor";
import { Metaplex } from "@metaplex-foundation/js";
import { createSolanaRpc } from "@solana/kit";
import { Connection, LAMPORTS_PER_SOL, PublicKey, type VersionedBlockResponse } from "@solana/web3.js";
import { updateCryptoPrices } from "@waifufun/codex";
import { CHAINID_TO_VIEM_CHAIN, EVM_RPC_URLS, SOLANA_RPC_URLS } from "@waifufun/constants";
import logger from "@waifufun/logger";
import {
	type CurrentAutofunTypes,
	type LegacyAutofunTypes,
	createCurrentAutofunProgramWithProvider,
	createLegacyAutofunProgramWithProvider,
} from "@waifufun/programs";
import type { AddressLike, EvmAddressLike, EvmChainIds, TURLLike } from "@waifufun/types";
import type { SolanaNetworkIds } from "@waifufun/types";
import type { SlotInfo } from "@waifufun/types";
import BN from "bn.js";
import Decimal from "decimal.js";
import {
	http,
	type PublicClient,
	type ReadContractParameters,
	type WalletClient,
	createPublicClient,
	createWalletClient,
	erc20Abi,
	fallback,
	getAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import autoFunAbi from "./evm/abis/WaifuFun.json";
import type { WaifuFunLaunchParams, WaifuFunSwapParameter } from "./evm/types/WaifuFun";
import { safeFetchJson } from "./safe-url-fetch";

type Erc20FunctionName = ReadContractParameters<typeof erc20Abi>["functionName"];
type Erc20Args = ReadContractParameters<typeof erc20Abi>["args"];
const MAX_TOKEN_METADATA_BYTES = 1024 * 1024;
const TOKEN_METADATA_TIMEOUT_MS = 10_000;

export class EVMRpcProvider {
	public client: PublicClient;
	private walletClient?: WalletClient;
	private chainId: EvmChainIds;

	constructor(chainId: EvmChainIds, privateKey?: string) {
		const chain = CHAINID_TO_VIEM_CHAIN[chainId];
		if (!chain) throw new Error("ChainId does not exist in CHAINID_TO_VIEM_CHAIN");
		if (!EVM_RPC_URLS?.[chainId] || EVM_RPC_URLS?.[chainId]?.length === 0) {
			throw new Error(`No RPC provider configured for EVM: ${chainId}`);
		}

		this.chainId = chainId;
		this.client = createPublicClient({
			batch: {
				multicall: true,
			},
			chain,
			transport: fallback([...EVM_RPC_URLS[chainId].map((rpcUrl: string) => http(rpcUrl))]),
		});

		if (privateKey) {
			const normalizedPrivateKey = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as `0x${string}`;
			this.walletClient = createWalletClient({
				account: privateKeyToAccount(normalizedPrivateKey),
				chain,
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

	async readWaifuFunContract(contractAddress: EvmAddressLike, functionName: string, args: any[]) {
		return await this.client.readContract({
			address: getAddress(contractAddress),
			abi: autoFunAbi.abi,
			functionName,
			args,
		});
	}
	async writeWaifuFunContract(contractAddress: EvmAddressLike, functionName: string, args: any[], value?: bigint) {
		if (!this.walletClient) {
			throw new Error("Wallet client not initialized. Please provide a private key in the constructor.");
		}
		const chain = CHAINID_TO_VIEM_CHAIN[this.chainId];
		if (!chain) {
			throw new Error("ChainId does not exist in CHAINID_TO_VIEM_CHAIN");
		}
		if (!this.walletClient.account) {
			throw new Error("Wallet client account not initialized.");
		}

		return await this.walletClient.writeContract({
			address: getAddress(contractAddress),
			abi: autoFunAbi.abi,
			functionName,
			args,
			...(value !== undefined ? { value } : {}),
			chain,
			account: this.walletClient.account,
		});
	}

	async launch(contractAddress: EvmAddressLike, config: WaifuFunLaunchParams) {
		return await this.writeWaifuFunContract(contractAddress, "launch", [
			config.totalSupply,
			config.virtualReserveETHAmount,
			config.decimals,
			config.name,
			config.symbol,
		]);
	}

	async launchAndSwap(
		contractAddress: EvmAddressLike,
		launchConfig: WaifuFunLaunchParams,
		swapConfig: WaifuFunSwapParameter,
	) {
		return await this.writeWaifuFunContract(
			contractAddress,
			"launchAndSwap",
			[
				launchConfig.totalSupply,
				launchConfig.virtualReserveETHAmount,
				launchConfig.decimals,
				launchConfig.name,
				launchConfig.symbol,
				swapConfig,
			],
			swapConfig.direction === 0 ? swapConfig.amountIn : undefined,
		);
	}

	async swap(contractAddress: EvmAddressLike, config: WaifuFunSwapParameter) {
		return await this.writeWaifuFunContract(
			contractAddress,
			"swap",
			[config],
			config.direction === 0 ? config.amountIn : undefined,
		);
	}

	async withdraw(contractAddress: EvmAddressLike, token: EvmAddressLike) {
		return await this.writeWaifuFunContract(contractAddress, "withdraw", [token]);
	}

	async getLaunchedTokensByOwner(contractAddress: EvmAddressLike, owner: EvmAddressLike) {
		return await this.readWaifuFunContract(contractAddress, "getLaunchedTokensByOwner", [owner]);
	}

	async getAllLaunchedTokens(contractAddress: EvmAddressLike) {
		return await this.readWaifuFunContract(contractAddress, "getAllLaunchedTokens", []);
	}
}

const RETRYABLE_HTTP_CODES = new Set([429, 503]);

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
	private program: Program<CurrentAutofunTypes>;
	public program_legacy: Program<LegacyAutofunTypes>;
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
			signTransaction: async (tx: any) => tx,
			signAllTransactions: async (txs: any[]) => txs,
		};

		const provider = new AnchorProvider(this.connection, dummyWallet as Wallet, {});

		this.program = createCurrentAutofunProgramWithProvider(provider);
		this.program_legacy = createLegacyAutofunProgramWithProvider(provider);
	}

	public subscribeSlot = withFallBack(async (callback: (slotInfo: SlotInfo) => void): Promise<number> => {
		const subscriptionId = this.connection.onSlotChange((slotInfo) => {
			const slotData: SlotInfo = {
				slot: slotInfo.slot,
				parent: slotInfo.parent,
				root: slotInfo.root,
			};

			callback(slotData);
			this.emit("slot:change", slotData);
		});

		// Track the subscription
		this.subscriptions.set(subscriptionId, {
			type: "slot",
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
			this.emit("subscription:removed", subscriptionId);
			return true;
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			logger.error(err, `Error unsubscribing from ${subscriptionId}`);
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
			} catch (error: unknown) {
				const err = error instanceof Error ? error : new Error(String(error));
				logger.error(err, `Error cleaning up subscription ${subscriptionId}`);
			}
		}

		this.subscriptions.clear();
		this.emit("subscriptions:cleared");
		logger.info("All subscriptions cleared");
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
				logger.error(error);
				SolanaRpcProvider.currentRpcIndex = (SolanaRpcProvider.currentRpcIndex + 1) % rpcList.length;
				attempts++;
			}
		}

		throw new Error("All RPC endpoints failed. Cannot connect to Solana.");
	}

	getAccountInfo = withFallBack(async (address: AddressLike) => {
		const publicKey = new PublicKey(address);
		const accountInfo = await this.connection.getAccountInfo(publicKey);
		if (!accountInfo) {
			throw new Error(`No account info found for address: ${address}`);
		}
		return {
			lamports: accountInfo.lamports,
			data: accountInfo.data,
			executable: accountInfo.executable,
			owner: accountInfo.owner,
			rentEpoch: accountInfo.rentEpoch,
		};
	}, this);

	isToken2022 = withFallBack(async (contractAddress: AddressLike) => {
		const publicKey = new PublicKey(contractAddress);
		const accountInfo = await this.connection.getAccountInfo(publicKey);
		if (!accountInfo) {
			throw new Error(`No account info found for address: ${contractAddress}`);
		}
		const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
		const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
		const isSplToken = accountInfo.owner.equals(TOKEN_PROGRAM_ID);
		const isSPL2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
		if (!isSplToken && !isSPL2022) {
			throw new Error(`Not a valid SPL token. Owner:  ${accountInfo.owner.toString()}`);
		}
		const isToken2022 = accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
		return isToken2022;
	}, this);

	getTokenMetadata = withFallBack(async (contractAddress: AddressLike) => {
		const metaplex = new Metaplex(this.connection);
		const mint = new PublicKey(contractAddress);
		const isToken2022 = await this.isToken2022(contractAddress);
		const mintInfo = (await this.connection.getParsedAccountInfo(mint)) as {
			value: {
				data: {
					parsed: {
						info: {
							mintAuthority: string;
							supply: string | bigint;
							decimals: string | number;
							extensions: {
								extension: string;
								state: {
									name: string;
									symbol: string;
									uri: string;
								};
							}[];
						};
					};
				};
			};
		};
		const parsedData = mintInfo.value?.data?.parsed;
		if (isToken2022 && parsedData?.info?.extensions) {
			const metadataExt = parsedData.info.extensions.find((ext) => ext.extension === "tokenMetadata");
			if (metadataExt?.state) {
				const name = metadataExt.state.name || "";
				const symbol = metadataExt.state.symbol || "";
				const uri = metadataExt.state.uri || "";
				const creator = parsedData?.info?.mintAuthority || null;
				const totalSupply = parsedData?.info?.supply || 0;
				const decimals = parsedData?.info?.decimals || 0;

				if (!uri) throw new Error("No URI found in token metadata extension.");
				const uriData = await safeFetchJson<{
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
				}>(uri, {
					maxBytes: MAX_TOKEN_METADATA_BYTES,
					timeoutMs: TOKEN_METADATA_TIMEOUT_MS,
				});
				return {
					name: name || uriData.name,
					symbol: symbol || uriData.symbol,
					description: uriData.description || "",
					image: uriData.image,
					showName: uriData.showName || false,
					createdOn: uriData.createdOn || new Date().toISOString(),
					twitter: uriData.twitter || undefined,
					website: uriData.website || undefined,
					telegram: uriData.telegram || undefined,
					discord: uriData.discord || undefined,
					creator: creator,
					totalSupply: totalSupply,
					decimals: decimals,
					isToken2022,
					url: uri,
				};
			}
		}

		const metadata = await metaplex.nfts().findByMint({ mintAddress: mint });
		const uri = metadata?.uri || undefined;
		console.log("Metadata URI:", uri);

		if (!uri) throw new Error("No URI could be determined for token.");

		const uriData = await safeFetchJson<{
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
		}>(uri, {
			maxBytes: MAX_TOKEN_METADATA_BYTES,
			timeoutMs: TOKEN_METADATA_TIMEOUT_MS,
		});

		return {
			...metadata?.json,
			totalSupply: String(metadata?.mint?.supply?.basisPoints) || "0",
			creator: metadata?.creators?.[0]?.address?.toBase58(),
			decimals: metadata?.mint?.decimals || 6,
			...uriData,
			isToken2022,
			url: uri,
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

	getBondingCurveInfo = withFallBack(async (contractAddresses: string[], version?: number) => {
		if (!contractAddresses || contractAddresses?.length === 0) return [];
		const tokenMints: PublicKey[] = contractAddresses.map((addr) => new PublicKey(addr));

		if (!tokenMints || tokenMints?.length === 0) return [];

		// Use legacy program for version 1, current program for other versions
		const programToUse = version === 1 ? this.program_legacy : this.program;
		const PROGRAM_ID = programToUse.programId;

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
				return programToUse.coder.accounts.decode("bondingCurve", info.data);
			} catch (err: unknown) {
				const wrapped = err instanceof Error ? err : new Error(String(err));
				const mintLabel = tokenMints[i]?.toBase58() ?? "unknown";
				logger.error(wrapped, `Failed to decode bonding curve for ${mintLabel}`);
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
					contractAddress: mint,
					tokenMint: mint,
					curveCompleted: curve?.isCompleted,
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
					priceUsd: 0,
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

			const reserveLamportBN = new BN(reserveLamport.toString());
			const virtualReservesBN = new BN(virtualReserves.toString());
			const curveLimitBN = new BN(curveLimit.toString());

			let curveProgress = curve?.isCompleted ? new Decimal(100) : new Decimal(0);

			if (curveLimitBN.gt(virtualReservesBN) && !curve?.isCompleted) {
				const numerator = reserveLamportBN.sub(virtualReservesBN);
				const denominator = curveLimitBN.sub(virtualReservesBN);
				curveProgress = new Decimal(numerator.toString()).mul("100").div(denominator.toString());
			}

			const difference = new Decimal(reserveLamportBN.sub(virtualReservesBN).toString());
			const bondingCurveBalance = difference.div(LAMPORTS_PER_SOL.toString()).toNumber();

			const creator = curve.creator.toBase58();

			const delayForTrade = curve?.delayForTrade ? Number(curve?.delayForTrade) : undefined;
			const createdTime = curve?.createdTime ? Number(curve?.createdTime) : undefined;
			const maxAmount = curve?.maxAmount ? Number(curve?.maxAmount) : undefined;

			return {
				contractAddress: mint,
				bondingCurveAddress,
				maxAmount,
				delayForTrade,
				createdTime,
				creator: creator ? creator : undefined,
				curveCompleted: curve.isCompleted,
				curveProgress: Math.min(Math.max(curveProgress.toNumber(), 0), 100),
				priceLamports: reserveLamport / reserveToken,
				decimals: tokenDecimals,
				virtualReserves,
				bondingCurveBalance,
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
