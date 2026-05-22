import type { AgentWallet } from "@waifufun/types";

import { fetchBnbPriceUsd } from "./pricing/coingecko.js";

export type BurnSnapshot = {
	agentTokenAddress: string;
	generatedAt: number;
	burn24hBnb: number;
	burn24hUsd: number | null;
	burn7dBnb: number;
	burn7dUsd: number | null;
	runwayDays: number | null;
	source: "ankr" | "bscscan" | "rpc-direct";
	byWallet: Array<{ walletId: string; address: string; outflow24hBnb: number; outflow7dBnb: number }>;
};

type Tx = { from: string; valueBnb: number; timestamp: number };
type TxSource = Exclude<BurnSnapshot["source"], "rpc-direct">;
type Logger = Pick<Console, "warn">;

type BurnRateDeps = {
	fetchImpl: typeof fetch;
	priceUsd: () => Promise<number | null>;
	now: () => number;
	logger: Logger;
};

const BNB_DECIMALS = 18;
const DAY_SECONDS = 86_400;
const WEEK_SECONDS = DAY_SECONDS * 7;
const TX_CACHE_TTL_MS = 60_000;

const deps: BurnRateDeps = {
	fetchImpl: fetch,
	priceUsd: () => fetchBnbPriceUsd(),
	now: () => Date.now(),
	logger: console,
};

const txCache = new Map<string, { expiresAt: number; txs: Tx[]; source: TxSource }>();

export function __setBurnRateDepsForTest(overrides: Partial<BurnRateDeps>): void {
	if (overrides.fetchImpl) deps.fetchImpl = overrides.fetchImpl;
	if (overrides.priceUsd) deps.priceUsd = overrides.priceUsd;
	if (overrides.now) deps.now = overrides.now;
	if (overrides.logger) deps.logger = overrides.logger;
}

export function __resetBurnRateDepsForTest(): void {
	deps.fetchImpl = fetch;
	deps.priceUsd = () => fetchBnbPriceUsd();
	deps.now = () => Date.now();
	deps.logger = console;
	txCache.clear();
}

function normalizeAddress(value: string): string {
	return value.toLowerCase();
}

function isAgentSpendingWallet(wallet: AgentWallet): boolean {
	return wallet.chain === "bsc" && (wallet.role === "agent-safe" || wallet.role === "agent-hot");
}

function env(name: string): string | undefined {
	const value = process.env[name];
	return value && value.length > 0 ? value : undefined;
}

function ankrApiKey(): string | undefined {
	return env("ANKR_API_KEY") ?? env("ANKR_MULTICHAIN_API_KEY") ?? env("ANKR_RPC_KEY");
}

function bscscanApiKey(): string | undefined {
	return env("BSCSCAN_API_KEY") ?? env("BSC_SCAN_API_KEY") ?? env("BSC_API_KEY");
}

function weiToBnb(value: string | number | bigint | null | undefined): number {
	if (value === null || value === undefined) return 0;
	if (typeof value === "number") return value / 10 ** BNB_DECIMALS;
	try {
		const raw = typeof value === "bigint" ? value : BigInt(String(value));
		const base = 10n ** BigInt(BNB_DECIMALS);
		const whole = raw / base;
		const fraction = raw % base;
		return Number(whole) + Number(fraction) / 10 ** BNB_DECIMALS;
	} catch {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
}

function parseTimestampSeconds(value: unknown): number {
	if (typeof value === "number") return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
	if (typeof value === "string") {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return parseTimestampSeconds(numeric);
		const parsed = Date.parse(value);
		return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : 0;
	}
	return 0;
}

function parseMaybeBnbValue(value: unknown): number {
	if (typeof value === "number") return value;
	if (typeof value !== "string") return 0;
	if (value.includes(".")) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return weiToBnb(value);
}

async function fetchAnkrTransactions(address: string, fromTimestamp: number, toTimestamp: number): Promise<Tx[]> {
	const key = ankrApiKey();
	if (!key) throw new Error("ANKR_KEY_MISSING");
	const res = await deps.fetchImpl(`https://rpc.ankr.com/multichain/${key}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "ankr_getTransactionsByAddress",
			params: { blockchain: "bsc", address, pageSize: 100, descOrder: true, fromTimestamp, toTimestamp },
		}),
	});
	if (res.status === 429) throw new Error("ANKR_RATE_LIMITED");
	if (!res.ok) throw new Error(`ANKR_HTTP_${res.status}`);
	const payload = (await res.json()) as { result?: { transactions?: unknown[] }; error?: unknown };
	if (payload.error) throw new Error("ANKR_ERROR");
	return (payload.result?.transactions ?? []).map((item) => {
		const tx = item as Record<string, unknown>;
		return {
			from: String(tx.from ?? tx.fromAddress ?? ""),
			valueBnb: parseMaybeBnbValue(tx.value ?? tx.valueWei ?? tx.nativeValue),
			timestamp: parseTimestampSeconds(tx.timestamp ?? tx.timeStamp ?? tx.blockTimestamp),
		};
	});
}

async function fetchBscScanTransactions(address: string): Promise<Tx[]> {
	const key = bscscanApiKey();
	if (!key) throw new Error("BSCSCAN_KEY_MISSING");
	const url = new URL("https://api.bscscan.com/api");
	url.searchParams.set("module", "account");
	url.searchParams.set("action", "txlist");
	url.searchParams.set("address", address);
	url.searchParams.set("startblock", "0");
	url.searchParams.set("endblock", "99999999");
	url.searchParams.set("sort", "desc");
	url.searchParams.set("apikey", key);
	const res = await deps.fetchImpl(url);
	if (res.status === 429) throw new Error("BSCSCAN_RATE_LIMITED");
	if (!res.ok) throw new Error(`BSCSCAN_HTTP_${res.status}`);
	const payload = (await res.json()) as { result?: unknown };
	if (!Array.isArray(payload.result)) throw new Error("BSCSCAN_BAD_RESULT");
	return payload.result.map((item) => {
		const tx = item as Record<string, unknown>;
		return {
			from: String(tx.from ?? ""),
			valueBnb: weiToBnb(tx.value as string),
			timestamp: parseTimestampSeconds(tx.timeStamp),
		};
	});
}

async function fetchWalletTransactions(
	address: string,
	fromTimestamp: number,
	toTimestamp: number,
): Promise<{ txs: Tx[]; source: BurnSnapshot["source"] }> {
	const key = `${normalizeAddress(address)}:${fromTimestamp}:${toTimestamp}`;
	const now = deps.now();
	const cached = txCache.get(key);
	if (cached && cached.expiresAt > now) return { txs: cached.txs, source: cached.source };

	if (!ankrApiKey() && !bscscanApiKey()) {
		deps.logger.warn("[burn-rate] no Ankr or BscScan API key configured; returning zero rpc-direct stub", { address });
		return { txs: [], source: "rpc-direct" };
	}

	try {
		const txs = await fetchAnkrTransactions(address, fromTimestamp, toTimestamp);
		txCache.set(key, { txs, source: "ankr", expiresAt: now + TX_CACHE_TTL_MS });
		return { txs, source: "ankr" };
	} catch (err) {
		if (!bscscanApiKey()) {
			deps.logger.warn(
				"[burn-rate] Ankr transaction history failed and BscScan key is missing; returning zero rpc-direct stub",
				{
					address,
					err,
				},
			);
			return { txs: [], source: "rpc-direct" };
		}
	}

	try {
		const txs = await fetchBscScanTransactions(address);
		txCache.set(key, { txs, source: "bscscan", expiresAt: now + TX_CACHE_TTL_MS });
		return { txs, source: "bscscan" };
	} catch (err) {
		deps.logger.warn("[burn-rate] transaction history providers failed; returning zero rpc-direct stub", {
			address,
			err,
		});
		return { txs: [], source: "rpc-direct" };
	}
}

function roundBnb(value: number): number {
	return Number(value.toFixed(12));
}

function roundUsd(value: number): number {
	return Number(value.toFixed(2));
}

export async function computeBurnRate(
	agentTokenAddress: string,
	wallets: AgentWallet[],
	navUsd: number,
): Promise<BurnSnapshot> {
	const generatedAt = Math.floor(deps.now() / 1000);
	const from7d = generatedAt - WEEK_SECONDS;
	const spendingWallets = wallets.filter(isAgentSpendingWallet);
	const byWallet: BurnSnapshot["byWallet"] = [];
	let burn24hBnb = 0;
	let burn7dBnb = 0;
	let source: BurnSnapshot["source"] = "rpc-direct";

	for (const wallet of spendingWallets) {
		const { txs, source: walletSource } = await fetchWalletTransactions(wallet.address, from7d, generatedAt);
		if (source === "rpc-direct" && walletSource !== "rpc-direct") source = walletSource;
		const walletAddress = normalizeAddress(wallet.address);
		let outflow24hBnb = 0;
		let outflow7dBnb = 0;
		for (const tx of txs) {
			if (normalizeAddress(tx.from) !== walletAddress) continue;
			if (tx.timestamp < from7d || tx.timestamp > generatedAt) continue;
			outflow7dBnb += tx.valueBnb;
			if (tx.timestamp >= generatedAt - DAY_SECONDS) outflow24hBnb += tx.valueBnb;
		}
		outflow24hBnb = roundBnb(outflow24hBnb);
		outflow7dBnb = roundBnb(outflow7dBnb);
		burn24hBnb += outflow24hBnb;
		burn7dBnb += outflow7dBnb;
		byWallet.push({ walletId: wallet.id, address: wallet.address, outflow24hBnb, outflow7dBnb });
	}

	burn24hBnb = roundBnb(burn24hBnb);
	burn7dBnb = roundBnb(burn7dBnb);
	const bnbUsd = await deps.priceUsd();
	const burn24hUsd = bnbUsd === null ? null : roundUsd(burn24hBnb * bnbUsd);
	const burn7dUsd = bnbUsd === null ? null : roundUsd(burn7dBnb * bnbUsd);
	const runwayDays =
		burn24hUsd && burn24hUsd > 0 && Number.isFinite(navUsd) && navUsd > 0 ? roundUsd(navUsd / burn24hUsd) : null;

	return {
		agentTokenAddress: normalizeAddress(agentTokenAddress),
		generatedAt,
		burn24hBnb,
		burn24hUsd,
		burn7dBnb,
		burn7dUsd,
		runwayDays,
		source,
		byWallet,
	};
}
