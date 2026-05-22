import {
	type AgentWalletRegistryRow,
	type Database,
	agentPersonas,
	agentWalletRegistry,
	getDatabase,
} from "@waifufun/db";
import { eq, sql } from "drizzle-orm";
import { NAV_CHAIN_CONFIG, isEvmNavChain } from "./chains.js";
import { enumerateEvmErc20Balances } from "./enumerators/evm-erc20.js";
import { enumerateEvmNativeBalance } from "./enumerators/evm-native.js";
import { fetchCoinGeckoNativePrices, fetchCoinGeckoTokenPrices } from "./pricing/coingecko.js";
import { fetchPcsV3TwapPriceUsd } from "./pricing/pcs-v3-twap.js";
import type {
	Erc20Balance,
	EvmNavChain,
	Holding,
	NativeBalance,
	NavSnapshot,
	NavStaleSource,
	TokenPrice,
} from "./types.js";

export type AgentWalletForNav = Pick<AgentWalletRegistryRow, "id" | "address" | "chain" | "role" | "label">;

type RawHolding = {
	wallet: AgentWalletForNav;
	asset: string;
	contract: string | null;
	balance: number;
	decimals?: number;
};

export type NavAggregatorDeps = {
	db?: Database;
	now?: () => number;
	getAgentTokenAddress?: (db: Database, address: string) => Promise<string | null>;
	listWallets?: (db: Database, agentTokenAddress: string) => Promise<AgentWalletForNav[]>;
	enumerateNative?: (
		walletAddress: string,
		chain: EvmNavChain,
	) => Promise<{ holdings: NativeBalance[]; stale: NavStaleSource[] }>;
	enumerateErc20?: (
		walletAddress: string,
		chain: EvmNavChain,
		agentTokenAddress: string,
	) => Promise<{ holdings: Erc20Balance[]; stale: NavStaleSource[] }>;
	fetchTokenPrices?: (chain: EvmNavChain, contracts: string[]) => Promise<Record<string, TokenPrice>>;
	fetchNativePrices?: (chains: EvmNavChain[]) => Promise<Record<string, TokenPrice>>;
	fetchPcsPrice?: (contract: string, decimals: number, bnbUsd: number | null) => Promise<TokenPrice>;
};

export class AgentNotFoundError extends Error {
	constructor() {
		super("agent not found");
		this.name = "AgentNotFoundError";
	}
}

export function requireNavDb(deps: NavAggregatorDeps = {}): Database | null {
	if (deps.db) return deps.db;
	const url = process.env.DATABASE_URL;
	if (!url) return null;
	return getDatabase(url).db;
}

export async function getAgentTokenAddressForNav(db: Database, address: string): Promise<string | null> {
	const [agent] = await db
		.select({ tokenAddress: agentPersonas.tokenAddress })
		.from(agentPersonas)
		.where(sql`lower(${agentPersonas.tokenAddress}) = ${address}`)
		.limit(1);
	return agent?.tokenAddress ? agent.tokenAddress.toLowerCase() : null;
}

export async function listWalletsForNav(db: Database, agentTokenAddress: string): Promise<AgentWalletForNav[]> {
	return await db
		.select({
			id: agentWalletRegistry.id,
			address: agentWalletRegistry.address,
			chain: agentWalletRegistry.chain,
			role: agentWalletRegistry.role,
			label: agentWalletRegistry.label,
		})
		.from(agentWalletRegistry)
		.where(eq(agentWalletRegistry.agentTokenAddress, agentTokenAddress))
		.orderBy(agentWalletRegistry.role, agentWalletRegistry.label, agentWalletRegistry.address);
}

function addUsd(bucket: Record<string, number>, key: string, value: number | null): void {
	if (value === null) return;
	bucket[key] = Number(((bucket[key] ?? 0) + value).toFixed(8));
}

function staleKey(stale: NavStaleSource): string {
	return `${stale.source}:${stale.reason}`;
}

function dedupeStale(items: NavStaleSource[]): NavStaleSource[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = staleKey(item);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function emptySnapshot(agentTokenAddress: string, now: number, stale: NavStaleSource[] = []): NavSnapshot {
	return {
		agentTokenAddress,
		generatedAt: now,
		navUsd: 0,
		unpriced: { count: 0, assets: [] },
		byChain: {},
		byWallet: {},
		byRole: {},
		holdings: [],
		stale,
	};
}

async function enumerateWallet(
	wallet: AgentWalletForNav,
	agentTokenAddress: string,
	deps: NavAggregatorDeps,
): Promise<{ raw: RawHolding[]; stale: NavStaleSource[] }> {
	if (!isEvmNavChain(wallet.chain))
		return { raw: [], stale: [{ source: `${wallet.chain}:enumerator`, reason: "unsupported-chain" }] };
	const enumerateNative = deps.enumerateNative ?? enumerateEvmNativeBalance;
	const enumerateErc20 = deps.enumerateErc20 ?? enumerateEvmErc20Balances;
	const [native, erc20] = await Promise.all([
		enumerateNative(wallet.address, wallet.chain),
		enumerateErc20(wallet.address, wallet.chain, agentTokenAddress),
	]);
	return {
		raw: [
			...native.holdings.map((item) => ({ wallet, asset: item.asset, contract: null, balance: item.balance })),
			...erc20.holdings.map((item) => ({
				wallet,
				asset: item.symbol,
				contract: item.contract.toLowerCase(),
				balance: item.balance,
				decimals: item.decimals,
			})),
		],
		stale: [...native.stale, ...erc20.stale],
	};
}

export async function buildNavSnapshot(address: string, deps: NavAggregatorDeps = {}): Promise<NavSnapshot> {
	const db = requireNavDb(deps);
	if (!db) throw new Error("database unavailable");
	const normalizedAddress = address.toLowerCase();
	const readAgent = deps.getAgentTokenAddress ?? getAgentTokenAddressForNav;
	const readWallets = deps.listWallets ?? listWalletsForNav;
	const agentTokenAddress = await readAgent(db, normalizedAddress);
	if (!agentTokenAddress) throw new AgentNotFoundError();
	const generatedAt = Math.floor((deps.now?.() ?? Date.now()) / 1000);
	const wallets = await readWallets(db, agentTokenAddress);
	if (wallets.length === 0) return emptySnapshot(agentTokenAddress, generatedAt);

	const enumerated = await Promise.all(wallets.map((wallet) => enumerateWallet(wallet, agentTokenAddress, deps)));
	const rawHoldings = enumerated.flatMap((item) => item.raw).filter((item) => item.balance > 0);
	const stale = dedupeStale(enumerated.flatMap((item) => item.stale));
	if (rawHoldings.length === 0) return emptySnapshot(agentTokenAddress, generatedAt, stale);

	const evmChains = [...new Set(rawHoldings.map((item) => item.wallet.chain).filter(isEvmNavChain))];
	const fetchNativePrices = deps.fetchNativePrices ?? fetchCoinGeckoNativePrices;
	let nativePrices: Record<string, TokenPrice> = {};
	try {
		nativePrices = await fetchNativePrices(evmChains);
	} catch (err) {
		stale.push({ source: "coingecko:native", reason: err instanceof Error ? err.message : String(err) });
	}

	const fetchTokenPrices = deps.fetchTokenPrices ?? fetchCoinGeckoTokenPrices;
	const tokenPricesByChain = new Map<string, Record<string, TokenPrice>>();
	await Promise.all(
		evmChains.map(async (chain) => {
			const contracts = rawHoldings
				.filter((item) => item.wallet.chain === chain && item.contract)
				.map((item) => item.contract as string);
			if (contracts.length === 0) return;
			try {
				tokenPricesByChain.set(chain, await fetchTokenPrices(chain, contracts));
			} catch (err) {
				stale.push({ source: `coingecko:${chain}`, reason: err instanceof Error ? err.message : String(err) });
				tokenPricesByChain.set(chain, {});
			}
		}),
	);

	const fetchPcsPrice = deps.fetchPcsPrice ?? fetchPcsV3TwapPriceUsd;
	const bnbUsd = nativePrices[NAV_CHAIN_CONFIG.bsc.coingeckoNativeId]?.priceUsd ?? null;
	const holdings: Holding[] = [];
	for (const raw of rawHoldings) {
		let price: TokenPrice | undefined;
		if (!raw.contract && isEvmNavChain(raw.wallet.chain)) {
			price = nativePrices[NAV_CHAIN_CONFIG[raw.wallet.chain as EvmNavChain]!.coingeckoNativeId];
		} else if (raw.contract) {
			price = tokenPricesByChain.get(raw.wallet.chain)?.[raw.contract.toLowerCase()];
			if ((!price || !price.priced) && raw.wallet.chain === "bsc")
				price = await fetchPcsPrice(raw.contract, raw.decimals ?? 18, bnbUsd);
		}
		const priceUsd = price?.priced ? price.priceUsd : null;
		const valueUsd = priceUsd === null || priceUsd === undefined ? null : Number((raw.balance * priceUsd).toFixed(8));
		holdings.push({
			walletId: raw.wallet.id,
			walletAddress: raw.wallet.address,
			walletLabel: raw.wallet.label,
			walletRole: raw.wallet.role,
			chain: raw.wallet.chain,
			asset: raw.asset,
			contract: raw.contract,
			balance: raw.balance,
			priceUsd: priceUsd ?? null,
			valueUsd,
			priced: valueUsd !== null,
		});
	}

	const byChain: Record<string, number> = {};
	const byWallet: Record<string, number> = {};
	const byRole: Record<string, number> = {};
	for (const holding of holdings) {
		addUsd(byChain, holding.chain, holding.valueUsd);
		addUsd(byWallet, holding.walletId, holding.valueUsd);
		addUsd(byRole, holding.walletRole, holding.valueUsd);
	}
	const navUsd = Number(holdings.reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0).toFixed(8));
	const unpricedAssets = [...new Set(holdings.filter((holding) => !holding.priced).map((holding) => holding.asset))];
	return {
		agentTokenAddress,
		generatedAt,
		navUsd,
		unpriced: { count: unpricedAssets.length, assets: unpricedAssets },
		byChain,
		byWallet,
		byRole,
		holdings,
		stale: dedupeStale(stale),
	};
}
