import { http, type Address, type PublicClient, createPublicClient, parseAbi } from "viem";
import { bsc } from "viem/chains";

export const DEFAULT_ERC8004_REPUTATION_REGISTRY: Address = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

export const ERC8004_REPUTATION_ABI = parseAbi([
	"function getClients(uint256 agentId) view returns (address[] clients)",
	"function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
]);

export interface Erc8004ReputationSummary {
	agentId: string;
	registry: Address;
	clients: Address[];
	count: string;
	summaryValue: string;
	summaryValueDecimals: number;
	tag1: string;
	tag2: string;
}

interface ReadContractClient {
	readContract(input: Parameters<PublicClient["readContract"]>[0]): Promise<unknown>;
}

export interface ReadReputationOptions {
	client?: ReadContractClient;
	rpcUrl?: string;
	registry?: Address;
	tag1?: string;
	tag2?: string;
}

function createDefaultClient(rpcUrl?: string): PublicClient {
	return createPublicClient({
		chain: bsc,
		transport: http(rpcUrl ?? process.env.BSC_RPC_URL ?? bsc.rpcUrls.default.http[0]),
	});
}

export async function readReputation(
	agentId: bigint | number | string,
	options: ReadReputationOptions = {},
): Promise<Erc8004ReputationSummary> {
	const id = BigInt(agentId);
	const registry = options.registry ?? DEFAULT_ERC8004_REPUTATION_REGISTRY;
	const client: ReadContractClient = options.client ?? createDefaultClient(options.rpcUrl);
	const tag1 = options.tag1 ?? "";
	const tag2 = options.tag2 ?? "";

	const clients = (await client.readContract({
		address: registry,
		abi: ERC8004_REPUTATION_ABI,
		functionName: "getClients",
		args: [id],
	})) as Address[];

	const [count, summaryValue, summaryValueDecimals] = (await client.readContract({
		address: registry,
		abi: ERC8004_REPUTATION_ABI,
		functionName: "getSummary",
		args: [id, clients, tag1, tag2],
	})) as readonly [bigint, bigint, number];

	return {
		agentId: id.toString(),
		registry,
		clients,
		count: count.toString(),
		summaryValue: summaryValue.toString(),
		summaryValueDecimals,
		tag1,
		tag2,
	};
}
