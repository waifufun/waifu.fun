import type { EvmAddressLike, EvmChainIds } from "@autofun/types";
import { createPublicClient, erc20Abi, getAddress, http, type PublicClient, type ReadContractParameters } from "viem";
import { CHAINID_TO_VIEM_CHAIN } from "@autofun/constants";
import type { SolanaNetworkIds } from "@autofun/types";
import { NETWORKID_TO_SOLANA_CLUSTER } from "@autofun/constants";
import { createSolanaRpc, createSolanaRpcApi } from "@solana/kit";

type Erc20FunctionName = ReadContractParameters<typeof erc20Abi>["functionName"];
type Erc20Args = ReadContractParameters<typeof erc20Abi>["args"];

export class EVMRpcProvider {
	client: PublicClient;

	constructor(chainId: EvmChainIds) {
		if (!CHAINID_TO_VIEM_CHAIN[chainId]) throw new Error("ChainId does not exist in CHAINID_TO_VIEM_CHAIN");
		this.client = createPublicClient({
			batch: {
				multicall: true,
			},
			chain: CHAINID_TO_VIEM_CHAIN[chainId],
			transport: http(),
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
		if (!NETWORKID_TO_SOLANA_CLUSTER[networkId]) throw new Error("NetworkId does not exist in NETWORKID_TO_CLUSTER");
		this.client = createSolanaRpc("https://api.mainnet-beta.solana.com");
	}
}
