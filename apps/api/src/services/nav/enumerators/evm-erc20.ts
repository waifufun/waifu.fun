import { type Address, type PublicClient, erc20Abi, formatUnits, getAddress } from "viem";
import { getNavPublicClient } from "../chains.js";
import type { EnumerationResult, Erc20Balance, EvmNavChain, NavStaleSource } from "../types.js";

export type EvmErc20EnumeratorDeps = {
	fetch?: typeof fetch;
	getClient?: (chain: EvmNavChain) => PublicClient;
	manualAllowlist?: Record<string, CuratedToken[]>;
};

type CuratedToken = { contract: string; symbol: string; decimals: number };

type TokenTx = {
	contractAddress?: string;
	tokenSymbol?: string;
	tokenDecimal?: string;
};

const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955";
const BSC_USDC = "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d";
const BUSD = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
const CAKE = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82";
const BTCB = "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c";
const WETH_ETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const ETH_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const ETH_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const DEFAULT_ALLOWLIST: Record<string, CuratedToken[]> = {
	bsc: [
		{ contract: WBNB, symbol: "WBNB", decimals: 18 },
		{ contract: BSC_USDT, symbol: "USDT", decimals: 18 },
		{ contract: BSC_USDC, symbol: "USDC", decimals: 18 },
		{ contract: BUSD, symbol: "BUSD", decimals: 18 },
		{ contract: CAKE, symbol: "CAKE", decimals: 18 },
		{ contract: BTCB, symbol: "BTCB", decimals: 18 },
	],
	eth: [
		{ contract: WETH_ETH, symbol: "WETH", decimals: 18 },
		{ contract: ETH_USDT, symbol: "USDT", decimals: 6 },
		{ contract: ETH_USDC, symbol: "USDC", decimals: 6 },
	],
};

function scannerBase(chain: EvmNavChain): string | null {
	if (chain === "bsc") return "https://api.bscscan.com/api";
	if (chain === "eth") return "https://api.etherscan.io/api";
	return null;
}

function scannerKey(chain: EvmNavChain): string | undefined {
	if (chain === "bsc") return process.env.BSCSCAN_API_KEY?.trim() || process.env.BSC_SCAN_API_KEY?.trim();
	if (chain === "eth") return process.env.ETHERSCAN_API_KEY?.trim();
	return undefined;
}

async function fetchScannerTokenContracts(
	walletAddress: string,
	chain: EvmNavChain,
	fetchImpl: typeof fetch,
): Promise<{ tokens: CuratedToken[]; stale: NavStaleSource[]; rateLimited: boolean }> {
	const base = scannerBase(chain);
	if (!base) return { tokens: [], stale: [], rateLimited: false };
	const url = new URL(base);
	url.searchParams.set("module", "account");
	url.searchParams.set("action", "tokentx");
	url.searchParams.set("address", walletAddress);
	url.searchParams.set("page", "1");
	url.searchParams.set("offset", "10000");
	url.searchParams.set("sort", "desc");
	const key = scannerKey(chain);
	if (key) url.searchParams.set("apikey", key);

	const res = await fetchImpl(url);
	if (res.status === 429) {
		return { tokens: [], stale: [{ source: `${chain}:scanner`, reason: "rate-limit" }], rateLimited: true };
	}
	if (!res.ok) {
		return { tokens: [], stale: [{ source: `${chain}:scanner`, reason: `http-${res.status}` }], rateLimited: false };
	}
	const json = (await res.json()) as { status?: string; message?: string; result?: TokenTx[] | string };
	if (typeof json.result === "string") {
		const lower = json.result.toLowerCase();
		return {
			tokens: [],
			stale: [{ source: `${chain}:scanner`, reason: lower.includes("rate") ? "rate-limit" : json.result }],
			rateLimited: lower.includes("rate"),
		};
	}
	if (!Array.isArray(json.result)) return { tokens: [], stale: [], rateLimited: false };
	const byContract = new Map<string, CuratedToken>();
	for (const row of json.result) {
		if (!row.contractAddress) continue;
		try {
			const contract = getAddress(row.contractAddress).toLowerCase();
			byContract.set(contract, {
				contract,
				symbol: row.tokenSymbol || contract.slice(0, 8),
				decimals: Number(row.tokenDecimal ?? 18),
			});
		} catch {}
	}
	return { tokens: [...byContract.values()], stale: [], rateLimited: false };
}

async function fetchAnkrTokenContracts(
	walletAddress: string,
	chain: EvmNavChain,
	fetchImpl: typeof fetch,
): Promise<{ balances: Erc20Balance[]; stale: NavStaleSource[] }> {
	const rpcUrl =
		process.env.ANKR_RPC_URL?.trim() ||
		(process.env.ANKR_API_KEY ? `https://rpc.ankr.com/multichain/${process.env.ANKR_API_KEY}` : undefined);
	if (!rpcUrl) return { balances: [], stale: [{ source: `${chain}:ankr`, reason: "not-configured" }] };
	const ankrBlockchain: Record<string, string> = {
		bsc: "bsc",
		eth: "eth",
		arb: "arbitrum",
		base: "base",
		op: "optimism",
		polygon: "polygon",
	};
	const res = await fetchImpl(rpcUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "ankr_getAccountBalance",
			params: { walletAddress, blockchain: [ankrBlockchain[chain]], onlyWhitelisted: false },
		}),
	});
	if (!res.ok) return { balances: [], stale: [{ source: `${chain}:ankr`, reason: `http-${res.status}` }] };
	const json = (await res.json()) as {
		result?: {
			assets?: Array<{
				tokenType?: string;
				contractAddress?: string;
				tokenSymbol?: string;
				tokenDecimals?: number;
				balance?: string;
			}>;
		};
	};
	const balances = (json.result?.assets ?? [])
		.filter((asset) => asset.tokenType === "ERC20" && asset.contractAddress && Number(asset.balance ?? 0) > 0)
		.map((asset) => ({
			contract: getAddress(asset.contractAddress as string).toLowerCase(),
			symbol: asset.tokenSymbol || (asset.contractAddress as string).slice(0, 8),
			decimals: Number(asset.tokenDecimals ?? 18),
			balance: Number(asset.balance ?? 0),
			raw: "",
		}));
	return { balances, stale: [] };
}

async function readBalances(
	walletAddress: string,
	chain: EvmNavChain,
	tokens: CuratedToken[],
	client: PublicClient,
): Promise<Erc20Balance[]> {
	const deduped = new Map<string, CuratedToken>();
	for (const token of tokens) {
		try {
			deduped.set(getAddress(token.contract).toLowerCase(), {
				...token,
				contract: getAddress(token.contract).toLowerCase(),
			});
		} catch {}
	}
	if (deduped.size === 0) return [];
	const contracts = [...deduped.values()].map((token) => ({
		address: getAddress(token.contract) as Address,
		abi: erc20Abi,
		functionName: "balanceOf" as const,
		args: [getAddress(walletAddress) as Address],
	}));
	const results = await client.multicall({ contracts, allowFailure: true });
	return [...deduped.values()].flatMap((token, index) => {
		const result = results[index];
		if (!result || result.status !== "success") return [];
		const raw = result.result as bigint;
		if (raw <= 0n) return [];
		return [
			{
				contract: token.contract,
				symbol: token.symbol,
				decimals: token.decimals,
				balance: Number(formatUnits(raw, token.decimals)),
				raw: raw.toString(),
			},
		];
	});
}

export async function enumerateEvmErc20Balances(
	walletAddress: string,
	chain: EvmNavChain,
	agentTokenAddress?: string,
	deps: EvmErc20EnumeratorDeps = {},
): Promise<EnumerationResult<Erc20Balance>> {
	const stale: NavStaleSource[] = [];
	try {
		const fetchImpl = deps.fetch ?? fetch;
		const client = deps.getClient?.(chain) ?? getNavPublicClient(chain);
		const allowlist = deps.manualAllowlist ?? DEFAULT_ALLOWLIST;
		const manualTokens = [...(allowlist[chain] ?? [])];
		if (chain === "bsc" && agentTokenAddress)
			manualTokens.push({ contract: agentTokenAddress, symbol: "WAIFU", decimals: 18 });

		const scanner = await fetchScannerTokenContracts(walletAddress, chain, fetchImpl);
		stale.push(...scanner.stale);
		if (scanner.rateLimited) {
			const ankr = await fetchAnkrTokenContracts(walletAddress, chain, fetchImpl);
			if (ankr.balances.length > 0)
				return {
					holdings: ankr.balances,
					stale: [...stale, ...ankr.stale.filter((s) => s.reason !== "not-configured")],
				};
			stale.push(...ankr.stale);
		}
		const holdings = await readBalances(walletAddress, chain, [...scanner.tokens, ...manualTokens], client);
		return { holdings, stale };
	} catch (err) {
		return {
			holdings: [],
			stale: [...stale, { source: `${chain}:evm-erc20`, reason: err instanceof Error ? err.message : String(err) }],
		};
	}
}

export const __privateEvmErc20 = { DEFAULT_ALLOWLIST, fetchScannerTokenContracts, fetchAnkrTokenContracts };
