/**
 * BSC Safe deposit watcher for the credits off-ramp.
 *
 * Detects new INBOUND deposits to an agent Safe / Eliza Cloud receive address on
 * BSC. The primary provider is NodeReal MegaNode for canonical BEP20 USDT
 * deposits; legacy Ankr/BscScan native-BNB fallbacks are retained when available.
 * Each qualifying deposit becomes a candidate the off-ramp can turn into a
 * pending conversion intent.
 *
 * IMPORTANT: this watcher only DETECTS and emits candidates. It does NOT move
 * funds and does NOT mint credits on its own. Conversion is gated behind an
 * ops/patron confirmation and a platform session token (see CreditsOffRamp).
 * Idempotency on the deposit tx hash and per-window caps are enforced by the
 * caller that persists the intents.
 */

export const BSC_USDT_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
export type DepositAsset = "BNB" | "USDT";

type InboundTx = {
	hash: string;
	to: string;
	from: string;
	asset: DepositAsset;
	valueBnb: number;
	valueUsd: number;
	timestamp: number;
};

export type DepositWatcherDeps = {
	fetchImpl: typeof fetch;
	now: () => number;
	logger: Pick<Console, "warn">;
};

const BNB_DECIMALS = 18;
const USDT_DECIMALS = 18;

const defaultDeps: DepositWatcherDeps = {
	fetchImpl: fetch,
	now: () => Date.now(),
	logger: console,
};

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

function nodeRealBscUrl(): string | undefined {
	const explicit = env("NODEREAL_BSC_URL") ?? env("NODE_REAL_BSC_URL");
	if (explicit) return explicit;
	const configured = env("ALCHEMY_BSC_URL");
	// The production brief wires the NodeReal MegaNode endpoint through this
	// legacy variable name, but other repo paths also use it for real Alchemy RPCs.
	// Fail closed rather than sending NodeReal-only nr_* methods to Alchemy.
	if (configured && /nodereal/i.test(configured)) return configured;
	return undefined;
}

function normalizeAddress(value: string): string {
	return value.toLowerCase();
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

function unitsToNumber(value: string | number | bigint | null | undefined, decimals: number): number {
	if (value === null || value === undefined) return 0;
	if (typeof value === "number") return value / 10 ** decimals;
	try {
		const raw = typeof value === "bigint" ? value : BigInt(String(value));
		const base = 10n ** BigInt(decimals);
		const whole = raw / base;
		const fraction = raw % base;
		return Number(whole) + Number(fraction) / 10 ** decimals;
	} catch {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
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

export interface DepositCandidate {
	depositTxHash: string;
	from: string;
	safeAddress: string;
	asset: DepositAsset;
	valueBnb: number;
	valueUsd: number;
	timestamp: number;
}

export class BscDepositWatcher {
	constructor(private readonly deps: DepositWatcherDeps = defaultDeps) {}

	private async fetchAnkrInbound(address: string, fromTimestamp: number, toTimestamp: number): Promise<InboundTx[]> {
		const key = ankrApiKey();
		if (!key) throw new Error("ANKR_KEY_MISSING");
		const res = await this.deps.fetchImpl(`https://rpc.ankr.com/multichain/${key}`, {
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
			const valueBnb = parseMaybeBnbValue(tx.value ?? tx.valueWei ?? tx.nativeValue);
			return {
				hash: String(tx.hash ?? tx.transactionHash ?? ""),
				to: String(tx.to ?? tx.toAddress ?? ""),
				from: String(tx.from ?? tx.fromAddress ?? ""),
				asset: "BNB" as const,
				valueBnb,
				valueUsd: 0,
				timestamp: parseTimestampSeconds(tx.timestamp ?? tx.timeStamp ?? tx.blockTimestamp),
			};
		});
	}

	private async fetchNodeRealUsdtInbound(address: string, fromTimestamp: number, toTimestamp: number): Promise<InboundTx[]> {
		const url = nodeRealBscUrl();
		if (!url) throw new Error("NODEREAL_BSC_URL_MISSING");
		const out: InboundTx[] = [];
		let pageKey: string | undefined;
		for (let page = 0; page < 20; page += 1) {
			const query: Record<string, unknown> = {
				category: ["20"],
				addressType: "to",
				address,
				order: "desc",
				maxCount: "0x64",
			};
			if (pageKey) query.pageKey = pageKey;
			const res = await this.deps.fetchImpl(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "nr_getTransactionByAddress",
					params: [query],
				}),
			});
			if (res.status === 429) throw new Error("NODEREAL_RATE_LIMITED");
			if (!res.ok) throw new Error(`NODEREAL_HTTP_${res.status}`);
			const payload = (await res.json()) as {
				result?: { transfers?: unknown[]; pageKey?: string; nextPageKey?: string };
				error?: unknown;
			};
			if (payload.error) throw new Error("NODEREAL_ERROR");
			const transfers = payload.result?.transfers ?? [];
			let oldestTimestamp = Number.POSITIVE_INFINITY;
			for (const item of transfers) {
				const tx = item as Record<string, unknown>;
				const timestamp = parseTimestampSeconds(tx.blockTimeStamp ?? tx.timestamp ?? tx.timeStamp);
				oldestTimestamp = Math.min(oldestTimestamp, timestamp);
				if (String(tx.contractAddress ?? "").toLowerCase() !== BSC_USDT_CONTRACT) continue;
				const decimal = tx.decimal == null ? USDT_DECIMALS : Number(tx.decimal);
				if (decimal !== USDT_DECIMALS) continue;
				if (timestamp < fromTimestamp || timestamp > toTimestamp) continue;
				const valueUsd = unitsToNumber(tx.value as string, USDT_DECIMALS);
				out.push({
					hash: String(tx.hash ?? tx.transactionHash ?? ""),
					to: String(tx.to ?? tx.toAddress ?? ""),
					from: String(tx.from ?? tx.fromAddress ?? ""),
					asset: "USDT",
					valueBnb: 0,
					valueUsd,
					timestamp,
				});
			}
			pageKey = payload.result?.nextPageKey ?? payload.result?.pageKey;
			if (!pageKey || transfers.length === 0 || oldestTimestamp < fromTimestamp) break;
		}
		return out;
	}

	private async fetchBscScanInbound(address: string): Promise<InboundTx[]> {
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
		const res = await this.deps.fetchImpl(url);
		if (res.status === 429) throw new Error("BSCSCAN_RATE_LIMITED");
		if (!res.ok) throw new Error(`BSCSCAN_HTTP_${res.status}`);
		const payload = (await res.json()) as { result?: unknown };
		if (!Array.isArray(payload.result)) throw new Error("BSCSCAN_BAD_RESULT");
		return payload.result.map((item) => {
			const tx = item as Record<string, unknown>;
			const valueBnb = weiToBnb(tx.value as string);
			return {
				hash: String(tx.hash ?? ""),
				to: String(tx.to ?? ""),
				from: String(tx.from ?? ""),
				asset: "BNB" as const,
				valueBnb,
				valueUsd: 0,
				timestamp: parseTimestampSeconds(tx.timeStamp),
			};
		});
	}

	private async fetchInbound(address: string, fromTimestamp: number, toTimestamp: number): Promise<InboundTx[]> {
		const nodeRealTxs: InboundTx[] = [];
		let nodeRealSucceeded = false;
		if (nodeRealBscUrl()) {
			try {
				nodeRealTxs.push(...(await this.fetchNodeRealUsdtInbound(address, fromTimestamp, toTimestamp)));
				nodeRealSucceeded = true;
			} catch (err) {
				this.deps.logger.warn("[offramp-watcher] NodeReal USDT provider failed; trying fallbacks", { address, err });
			}
		}
		if (!ankrApiKey() && !bscscanApiKey()) {
			if (nodeRealSucceeded) return nodeRealTxs;
			this.deps.logger.warn("[offramp-watcher] no NodeReal/Ankr/BscScan provider configured; no deposits detected", {
				address,
			});
			return [];
		}
		try {
			return this.mergeInbound(nodeRealTxs, await this.fetchAnkrInbound(address, fromTimestamp, toTimestamp));
		} catch (err) {
			if (!bscscanApiKey()) {
				if (nodeRealSucceeded) return nodeRealTxs;
				this.deps.logger.warn("[offramp-watcher] Ankr failed and no BscScan key; no deposits detected", {
					address,
					err,
				});
				return [];
			}
		}
		try {
			return this.mergeInbound(nodeRealTxs, await this.fetchBscScanInbound(address));
		} catch (err) {
			if (nodeRealSucceeded) return nodeRealTxs;
			this.deps.logger.warn("[offramp-watcher] deposit providers failed; no deposits detected", { address, err });
			return [];
		}
	}

	private mergeInbound(primary: InboundTx[], fallback: InboundTx[]): InboundTx[] {
		const seen = new Set<string>();
		const out: InboundTx[] = [];
		for (const tx of [...primary, ...fallback]) {
			const key = tx.hash.toLowerCase();
			if (key && seen.has(key)) continue;
			if (key) seen.add(key);
			out.push(tx);
		}
		return out;
	}

	/**
	 * Detect inbound BSC deposits to `safeAddress` within the lookback window.
	 * Native-BNB candidates honor `minDepositBnb`; USDT is USD-native and is gated
	 * later by the USD off-ramp limits. Already-seen tx hashes are skipped (the
	 * caller owns persistence/idempotency).
	 */
	async detectDeposits(input: {
		safeAddress: string;
		lookbackSeconds: number;
		minDepositBnb?: number;
		seenTxHashes?: ReadonlySet<string>;
	}): Promise<DepositCandidate[]> {
		const safe = normalizeAddress(input.safeAddress);
		const to = Math.floor(this.deps.now() / 1000);
		const from = to - Math.max(0, Math.floor(input.lookbackSeconds));
		const minBnb = input.minDepositBnb ?? 0;
		const seen = input.seenTxHashes ?? new Set<string>();
		const txs = await this.fetchInbound(safe, from, to);
		const out: DepositCandidate[] = [];
		for (const tx of txs) {
			if (normalizeAddress(tx.to) !== safe) continue;
			if (normalizeAddress(tx.from) === safe) continue; // ignore self-transfers
			if (tx.timestamp < from || tx.timestamp > to) continue;
			if (tx.asset === "BNB" && (tx.valueBnb <= 0 || tx.valueBnb < minBnb)) continue;
			if (tx.asset === "USDT" && tx.valueUsd <= 0) continue;
			if (!tx.hash || seen.has(tx.hash.toLowerCase())) continue;
			out.push({
				depositTxHash: tx.hash,
				from: tx.from,
				safeAddress: input.safeAddress,
				asset: tx.asset,
				valueBnb: tx.valueBnb,
				valueUsd: tx.asset === "USDT" ? Number(tx.valueUsd.toFixed(2)) : 0,
				timestamp: tx.timestamp,
			});
		}
		return out;
	}
}

export function __defaultDepositWatcherDeps(): DepositWatcherDeps {
	return { ...defaultDeps };
}
