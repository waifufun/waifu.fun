import type { EvmAddressLike, EvmChainIds } from "@autofun/types";
import { createPublicClient, erc20Abi, getAddress, http, type PublicClient, type ReadContractParameters } from "viem";
import { CHAINID_TO_VIEM_CHAIN } from "@autofun/constants";

type Erc20FunctionName = ReadContractParameters<typeof erc20Abi>["functionName"];
type Erc20Args = ReadContractParameters<typeof erc20Abi>["args"];

export class EVMRpcProvider {
	client: PublicClient;

	constructor(chainId: EvmChainIds) {
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
}
