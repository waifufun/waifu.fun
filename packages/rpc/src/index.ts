import type { AddressLike, EvmAddressLike, EvmChainIds, TURLLike } from "@autofun/types";
import {
	createPublicClient,
	erc20Abi,
	fallback,
	getAddress,
	http,
	type PublicClient,
	type ReadContractParameters,
} from "viem";
import { CHAINID_TO_VIEM_CHAIN, EVM_RPC_URLS, SOLANA_RPC_URLS } from "@autofun/constants";
import type { SolanaNetworkIds } from "@autofun/types";
import { createSolanaRpc } from "@solana/kit";
import { Metaplex } from "@metaplex-foundation/js";
import { Program, AnchorProvider, type Idl } from "@coral-xyz/anchor";
import idl from "./idls/autofun.json";
import { Connection, PublicKey } from "@solana/web3.js";
import { updateCryptoPrices } from "@autofun/utils";

type Erc20FunctionName = ReadContractParameters<typeof erc20Abi>["functionName"];
type Erc20Args = ReadContractParameters<typeof erc20Abi>["args"];

export class EVMRpcProvider {
	public client: PublicClient;

	constructor(chainId: EvmChainIds) {
		if (!CHAINID_TO_VIEM_CHAIN[chainId]) throw new Error("ChainId does not exist in CHAINID_TO_VIEM_CHAIN");
		if (!EVM_RPC_URLS?.[chainId] || EVM_RPC_URLS?.[chainId]?.length === 0) {
			throw new Error(`No RPC provider configured for EVM: ${chainId}`);
		}

		this.client = createPublicClient({
			batch: {
				multicall: true,
			},
			chain: CHAINID_TO_VIEM_CHAIN[chainId],
			transport: fallback([...EVM_RPC_URLS[chainId].map((rpcUrl: string) => http(rpcUrl))]),
		});
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
}

export class SolanaRpcProvider {
	public connection;
	public client;
	private program;
	public networkId: SolanaNetworkIds;

	constructor(networkId: SolanaNetworkIds) {
		const rpc = SOLANA_RPC_URLS?.[networkId]?.[0];
		if (!rpc) throw new Error(`No RPC provider configured for Solana: ${networkId}`);
		this.connection = new Connection(rpc);
		this.client = createSolanaRpc(rpc);
		this.networkId = networkId;

		const dummyWallet = {
			publicKey: new PublicKey("11111111111111111111111111111111"),
			// biome-ignore lint/suspicious/noExplicitAny: spoofing wallet
			signTransaction: async (tx: any) => tx,
			// biome-ignore lint/suspicious/noExplicitAny: spoofing wallet
			signAllTransactions: async (txs: any[]) => txs,
		};

		// biome-ignore lint/suspicious/noExplicitAny: spoofing wallet
		const provider = new AnchorProvider(this.connection, dummyWallet as any, {});
		this.program = new Program(idl as Idl, provider);
	}

	getTokenMetadata = async (contractAddress: string) => {
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
	};

	private getTokenSupplies = async (mintAddresses: PublicKey[]) => {
		const tokenAccounts = await this.connection.getMultipleAccountsInfo(mintAddresses);
		return tokenAccounts.map((acc, i) => {
			if (!acc) return { mint: mintAddresses[i], supply: 0, decimals: 0 };
			const data = acc.data;
			const supply = Number(data.readBigUInt64LE(36));
			const decimals = data.readUInt8(44);
			return { mint: mintAddresses[i], supply, decimals };
		});
	};

	getBondingCurveInfo = async (contractAddresses: string[]) => {
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
				console.error("Failed to decode bonding curve for", tokenMints?.[i].toBase58(), err);
				return null;
			}
		});

		return bondingCurves.map((curve, i) => {
			const mint = tokenMints?.[i].toBase58();
			const bondingCurveAddress = bondingCurvePDAs[i]?.toBase58();
			const supplyInfo = supplies[i];

			if (!supplyInfo) throw new Error(`Unable to determine supplyInfo for token: ${mint}`);

			if (!curve || !curve.reserveToken || curve.reserveToken.toNumber() === 0) {
				return {
					tokenMint: mint,
					curveCompleted: null,
					priceLamports: null,
					priceSOL: null,
					marketCapSOL: null,
					marketCapUSD: null,
					exists: false,
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
				priceSOL,
				priceUsd,
				totalSupply,
				marketCapSOL,
				marketCapUSD,
				exists: true,
			};
		});
	};

	getTokenBalance = async (contractAddress: AddressLike, owner: AddressLike, raw?: boolean) => {
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
	};
}
