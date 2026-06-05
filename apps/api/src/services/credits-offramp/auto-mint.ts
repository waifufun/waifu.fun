/**
 * Autonomous BNB->credits auto-mint loop (the "last 10%").
 *
 * END-TO-END, NO HUMAN:
 *   1. Watch the Eliza Cloud directWallet BSC RECEIVE ADDRESS for inbound native
 *      BNB (BscDepositWatcher). Each inbound transfer to that address IS already
 *      the directWallet payment leg — its tx hash is exactly what /confirm needs.
 *   2. For each new deposit (idempotent on tx hash): snapshot BNB->USD, run it
 *      through the spend-limit + kill-switch gate, and if allowed, call the REAL
 *      directWallet create+confirm against Eliza Cloud (auth = a self-minted
 *      platform Steward session JWT — verified live to be accepted).
 *   3. Eliza Cloud verifies the tx on-chain and mints credits to the platform
 *      org, then fires `credits.topped_up` -> waifu-core clears the agent's
 *      dormancy. End to end, no dashboard click.
 *
 * WHY THE RECEIVE ADDRESS (not the agent Safe): converting Safe BNB would require
 * a Safe-outbound spend (Steward vault signing), which is trading-scoped and not
 * wired for arbitrary transfers here. Draining trading capital to buy thinking is
 * also exactly what Shadow flagged against. So the autonomous loop funds credits
 * from deposits sent DIRECTLY to the Eliza Cloud receive address (by Shadow, the
 * Sol funding wallet, or an agent owner). No Safe is touched; no funds are moved
 * by this loop beyond confirming an on-chain deposit that already happened.
 *
 * SAFETY RAILS (all enforced before any Eliza Cloud call):
 *   - Global kill-switch: CREDITS_OFFRAMP_AUTO_ENABLED must be true + no pause file.
 *   - Per-tx cap (MAX_AUTO_CREDITS_USD_PER_TX) and per-day cap
 *     (MAX_AUTO_CREDITS_USD_PER_DAY), tracked via the credit_offramp_mints ledger.
 *   - Idempotency: unique index on deposit_tx_hash + ON CONFLICT DO NOTHING.
 *   - Every decision (minted, capped, killed, skipped, failed) is audited.
 */

import type { Database } from "@waifufun/db/client";

import { fetchBnbPriceUsd } from "../nav/pricing/coingecko.js";
import { BscDepositWatcher, type DepositCandidate } from "./deposit-watcher.js";
import { CreditsOffRamp, type OffRampElizaClient } from "./index.js";
import { type OffRampLimitsConfig, evaluateGate, resolveOffRampLimits } from "./limits.js";
import {
	type RecordMintInput,
	claimPendingMint,
	hasActiveDeposit,
	markCapped,
	markCredited,
	markFailed,
	recordAudit,
	sumSpentTodayUsd,
} from "./mint-ledger.js";

/**
 * The ledger surface the minter needs. Defaults bind to the Drizzle-backed
 * `mint-ledger` helpers; tests inject an in-memory implementation so the
 * orchestration logic is verifiable without a database.
 */
export interface MintLedger {
	sumSpentTodayUsd(now: Date): Promise<number>;
	/** True only if an in-flight (pending) or successful (credited) row exists. */
	hasActiveDeposit(depositTxHash: string): Promise<boolean>;
	/** Claim the active-mint slot (partial-unique pending row). Null if lost. */
	claimPendingMint(input: RecordMintInput): Promise<string | null>;
	/** Append a non-blocking refusal/failure audit row (retry-eligible). */
	recordAudit(input: RecordMintInput): Promise<void>;
	markCredited(
		id: string,
		receipt: {
			offrampTxHash?: string | null;
			elizaPaymentId?: string | null;
			creditsAdded?: string | null;
			resultingBalance?: string | null;
		},
	): Promise<void>;
	markFailed(id: string, reason: string): Promise<void>;
	/** Demote a pending row to capped (releases the active slot for retry). */
	markCapped(id: string, reason: string): Promise<void>;
}

function dbLedger(db: Database): MintLedger {
	return {
		sumSpentTodayUsd: (now) => sumSpentTodayUsd(db, now),
		hasActiveDeposit: (hash) => hasActiveDeposit(db, hash),
		claimPendingMint: (input) => claimPendingMint(db, input),
		recordAudit: (input) => recordAudit(db, input),
		markCredited: (id, receipt) => markCredited(db, id, receipt),
		markFailed: (id, reason) => markFailed(db, id, reason),
		markCapped: (id, reason) => markCapped(db, id, reason),
	};
}

export interface AutoMintDeps {
	priceUsd: () => Promise<number | null>;
	now: () => Date;
	logger: Pick<Console, "info" | "warn" | "error">;
}

const defaultDeps: AutoMintDeps = {
	priceUsd: () => fetchBnbPriceUsd(),
	now: () => new Date(),
	logger: console,
};

export interface AutoMintResultRow {
	depositTxHash: string;
	asset: DepositCandidate["asset"];
	valueBnb: number;
	valueUsd: number;
	usd: number | null;
	outcome: "credited" | "capped" | "killed" | "skipped" | "failed" | "duplicate";
	reason?: string;
	paymentId?: string;
	creditsAdded?: number | string;
}

export interface AutoMintSummary {
	scanned: number;
	credited: number;
	capped: number;
	killed: number;
	skipped: number;
	failed: number;
	duplicate: number;
	rows: AutoMintResultRow[];
}

/** Lookback window for the deposit scan (default 1h, generous for cron drift). */
function lookbackSeconds(): number {
	const raw = Number(process.env.CREDITS_OFFRAMP_LOOKBACK_SECONDS);
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 3600;
}

export class CreditsAutoMinter {
	private readonly offRamp: CreditsOffRamp;
	private readonly watcher: BscDepositWatcher;
	private readonly ledger: MintLedger;

	constructor(
		db: Database,
		private readonly eliza: OffRampElizaClient,
		private readonly deps: AutoMintDeps = defaultDeps,
		overrides?: { offRamp?: CreditsOffRamp; watcher?: BscDepositWatcher; ledger?: MintLedger },
	) {
		this.ledger = overrides?.ledger ?? dbLedger(db);
		this.offRamp =
			overrides?.offRamp ??
			new CreditsOffRamp(eliza, {
				priceUsd: () => this.deps.priceUsd(),
				now: () => this.deps.now().getTime(),
			});
		this.watcher =
			overrides?.watcher ??
			new BscDepositWatcher({
				fetchImpl: fetch,
				now: () => this.deps.now().getTime(),
				logger: this.deps.logger,
			});
	}

	/**
	 * One tick: scan the receive address for new deposits, gate each, and mint the
	 * allowed ones. Returns a summary; never throws on a single-deposit failure
	 * (it audits + continues). Safe to run on a cron.
	 */
	async tick(limits: OffRampLimitsConfig = resolveOffRampLimits()): Promise<AutoMintSummary> {
		const summary: AutoMintSummary = {
			scanned: 0,
			credited: 0,
			capped: 0,
			killed: 0,
			skipped: 0,
			failed: 0,
			duplicate: 0,
			rows: [],
		};

		// Resolve the live receive address; if the off-ramp is unavailable, no-op.
		const target = await this.offRamp.resolveBscTarget();
		if (!target?.receiveAddress) {
			this.deps.logger.warn("[offramp-automint] no BSC receive address available; skipping tick");
			return summary;
		}

		const candidates = await this.watcher.detectDeposits({
			safeAddress: target.receiveAddress,
			lookbackSeconds: lookbackSeconds(),
			minDepositBnb: 0,
		});
		summary.scanned = candidates.length;

		for (const candidate of candidates) {
			const row = await this.processCandidate(candidate, target.receiveAddress, limits);
			summary.rows.push(row);
			switch (row.outcome) {
				case "credited":
					summary.credited += 1;
					break;
				case "capped":
					summary.capped += 1;
					break;
				case "killed":
					summary.killed += 1;
					break;
				case "skipped":
					summary.skipped += 1;
					break;
				case "failed":
					summary.failed += 1;
					break;
				case "duplicate":
					summary.duplicate += 1;
					break;
			}
		}

		return summary;
	}

	private async processCandidate(
		candidate: DepositCandidate,
		receiveAddress: string,
		limits: OffRampLimitsConfig,
	): Promise<AutoMintResultRow> {
		const depositTxHash = candidate.depositTxHash.toLowerCase();

		// Idempotency precheck: only an in-flight (pending) or successful (credited)
		// row blocks. Prior refusal/failure rows do NOT — the deposit stays retryable
		// (the partial unique index is the hard guarantee on the claim below).
		if (await this.ledger.hasActiveDeposit(depositTxHash)) {
			return this.row(candidate, null, "duplicate");
		}

		// USD value of the full deposit. USDT is USD-native; BNB keeps the existing
		// price snapshot semantics.
		const bnbPriceUsd = candidate.asset === "BNB" ? await this.deps.priceUsd() : null;
		const usd =
			candidate.asset === "USDT"
				? Number(candidate.valueUsd.toFixed(2))
				: bnbPriceUsd && bnbPriceUsd > 0
					? Number((candidate.valueBnb * bnbPriceUsd).toFixed(2))
					: null;
		if (usd === null) {
			await this.audit(candidate, receiveAddress, null, bnbPriceUsd, "skipped", "BNB price unavailable");
			return this.row(candidate, null, "skipped", "no price");
		}

		// Gate: kill-switch + automatable + per-tx + per-day caps.
		const spentTodayUsd = await this.ledger.sumSpentTodayUsd(this.deps.now());
		const decision = evaluateGate(
			{ amountUsd: usd, spentTodayUsd, automatable: this.eliza.hasCryptoSession() },
			limits,
		);

		if (!decision.allowed) {
			await this.audit(candidate, receiveAddress, usd, bnbPriceUsd, decision.status, decision.reason);
			return this.row(candidate, usd, decision.status, decision.reason);
		}

		// Claim a PENDING row first (the partial-unique index makes this atomic:
		// only one tick can hold the active slot for this deposit). The pending row
		// counts toward the daily cap immediately.
		const id = await this.ledger.claimPendingMint({
			depositTxHash,
			safeAddress: receiveAddress,
			asset: candidate.asset,
			depositBnb: candidate.asset === "BNB" ? candidate.valueBnb : null,
			convertBnb: candidate.asset === "BNB" ? candidate.valueBnb : null,
			usdAmount: decision.amountUsd,
			bnbPriceUsd: bnbPriceUsd ?? null,
			status: "pending",
		});
		if (!id) {
			// Lost the claim race; another tick already holds the active mint slot.
			return this.row(candidate, usd, "duplicate");
		}

		// Post-claim daily-cap RECHECK (closes the read-then-write race across
		// concurrent ticks): now that our pending row is counted, re-sum today's
		// spend. If our own row pushed the total past the cap, a concurrent tick
		// claimed the headroom first — demote ourselves to `capped` (releases the
		// slot, keeps the deposit retryable) rather than over-mint.
		const spentAfterClaim = await this.ledger.sumSpentTodayUsd(this.deps.now());
		if (spentAfterClaim > limits.maxPerDayUsd) {
			const reason = `daily cap of $${limits.maxPerDayUsd} would be exceeded after concurrent claims (now $${spentAfterClaim.toFixed(2)})`;
			await this.ledger.markCapped(id, reason);
			return this.row(candidate, usd, "capped", reason);
		}

		// Execute the REAL directWallet confirm: the deposit IS the transfer to the
		// receive address, so we create a payment for the USD value and confirm it
		// with this deposit's tx hash. Auth = self-minted platform session JWT.
		try {
			const result = await this.offRamp.convert({
				usd: decision.amountUsd,
				transactionHash: depositTxHash,
				payCurrency: candidate.asset === "USDT" ? "USDT" : "BNB",
			});
			if (result.automatable === true) {
				let resultingBalance: string | null = null;
				try {
					const bal = await this.readBalance();
					resultingBalance = bal != null ? String(bal) : null;
				} catch {
					/* balance read is best-effort audit only */
				}
				await this.ledger.markCredited(id, {
					offrampTxHash: depositTxHash,
					elizaPaymentId: result.paymentId,
					creditsAdded: result.creditsAdded != null ? String(result.creditsAdded) : null,
					resultingBalance,
				});
				this.deps.logger.info("[offramp-automint] minted credits from deposit", {
					depositTxHash,
					asset: candidate.asset,
					usd: decision.amountUsd,
					paymentId: result.paymentId,
					creditsAdded: result.creditsAdded,
					resultingBalance,
				});
				return this.row(candidate, decision.amountUsd, "credited", undefined, {
					paymentId: result.paymentId,
					...(result.creditsAdded != null ? { creditsAdded: result.creditsAdded } : {}),
				});
			}
			// convert() returned manual instructions (not automatable) — mark failed
			// so it's retried once auth is configured, with a clear reason.
			await this.ledger.markFailed(id, result.reason);
			return this.row(candidate, usd, "failed", result.reason);
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			await this.ledger.markFailed(id, reason);
			this.deps.logger.error("[offramp-automint] convert failed", { depositTxHash, asset: candidate.asset, reason });
			return this.row(candidate, usd, "failed", reason);
		}
	}

	private row(
		candidate: DepositCandidate,
		usd: number | null,
		outcome: AutoMintResultRow["outcome"],
		reason?: string,
		extra: Partial<Pick<AutoMintResultRow, "paymentId" | "creditsAdded">> = {},
	): AutoMintResultRow {
		return {
			depositTxHash: candidate.depositTxHash.toLowerCase(),
			asset: candidate.asset,
			valueBnb: candidate.valueBnb,
			valueUsd: candidate.valueUsd,
			usd,
			outcome,
			...(reason ? { reason } : {}),
			...extra,
		};
	}

	private async readBalance(): Promise<number | null> {
		const withBalance = this.eliza as OffRampElizaClient & {
			getCreditBalance?: (agentId?: string) => Promise<{ balance: number }>;
		};
		if (typeof withBalance.getCreditBalance !== "function") return null;
		const res = await withBalance.getCreditBalance();
		return typeof res.balance === "number" ? res.balance : null;
	}

	private async audit(
		candidate: DepositCandidate,
		receiveAddress: string,
		usd: number | null,
		bnbPriceUsd: number | null,
		status: "capped" | "killed" | "skipped",
		reason: string,
	): Promise<void> {
		// recordAudit appends a NON-blocking row (outside the partial unique index),
		// so a killed/capped/skipped deposit can be retried on a later tick.
		await this.ledger.recordAudit({
			depositTxHash: candidate.depositTxHash,
			safeAddress: receiveAddress,
			asset: candidate.asset,
			depositBnb: candidate.asset === "BNB" ? candidate.valueBnb : null,
			convertBnb: candidate.asset === "BNB" ? candidate.valueBnb : null,
			usdAmount: usd ?? 0,
			bnbPriceUsd,
			status,
			reason,
		});
	}
}

export function __defaultAutoMintDeps(): AutoMintDeps {
	return { ...defaultDeps };
}
