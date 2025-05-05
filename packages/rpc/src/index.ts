import type { EvmAddressLike, EvmChainIds, SolanaAddressLike } from "@autofun/types";
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
import { createSolanaRpc, getPublicKeyFromAddress } from "@solana/kit";

type Erc20FunctionName = ReadContractParameters<typeof erc20Abi>["functionName"];
type Erc20Args = ReadContractParameters<typeof erc20Abi>["args"];

export class EVMRpcProvider {
	client: PublicClient;

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
	client;

	constructor(networkId: SolanaNetworkIds) {
		const rpc = SOLANA_RPC_URLS?.[networkId]?.[0];
		if (!rpc) throw new Error(`No RPC provider configured for Solana: ${networkId}`);
		this.client = createSolanaRpc(rpc);
	}

	async getTokenMetadata(contractAddress: SolanaAddressLike) {
		const mintAddress = getPublicKeyFromAddress(contractAddress);

		return true;
	}
}
