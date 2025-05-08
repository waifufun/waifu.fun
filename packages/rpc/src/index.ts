import type { EvmAddressLike, EvmChainIds, TURLLike } from "@autofun/types";
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
import { Connection, PublicKey } from "@solana/web3.js";

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
}

export class SolanaRpcProvider {
	public connection;
	public client;

	constructor(networkId: SolanaNetworkIds) {
		const rpc = SOLANA_RPC_URLS?.[networkId]?.[0];
		if (!rpc) throw new Error(`No RPC provider configured for Solana: ${networkId}`);
		this.connection = new Connection(rpc);
		this.client = createSolanaRpc(rpc);
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
}
