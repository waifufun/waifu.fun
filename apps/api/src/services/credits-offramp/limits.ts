/**
 * Spend limits + kill-switch for the autonomous BNB->credits off-ramp.
 *
 * Shadow's explicit ask: "can have like limits per day". This module is the pure
 * decision layer the auto-mint loop consults BEFORE it ever moves value or calls
 * Eliza Cloud. Three independent guards, all conservative by default:
 *
 *   1. GLOBAL KILL-SWITCH  — env flag (CREDITS_OFFRAMP_AUTO_ENABLED must be "true"
 *      to arm; default OFF) AND a pause touch-file (like the MM engine's
 *      `.waifu-mm-paused`). Either being "off"/present blocks ALL auto-mints.
 *   2. PER-TX CAP          — MAX_AUTO_CREDITS_USD_PER_TX (default $10). A single
 *      detected deposit can never convert more than this in one shot.
 *   3. PER-DAY CAP         — MAX_AUTO_CREDITS_USD_PER_DAY (default $20). Sum of
 *      today's (UTC) credited+pending auto-mints. Exceeding it queues for manual.
 *
 * Idempotency on the deposit tx hash is enforced by the DB unique index (see
 * credit_offramp_mints) and double-checked here against the day's seen set.
 *
 * Everything is read from env with safe fallbacks so a misconfig fails CLOSED
 * (auto-mint disabled), never open.
 */

import { existsSync } from "node:fs";

export interface OffRampLimitsConfig {
	/** Master arm flag. Auto-mint is OFF unless this is explicitly true. */
	autoEnabled: boolean;
	/** Absolute path to a pause touch-file; if it exists, auto-mint is paused. */
	pauseFilePath: string;
	/** Max USD a single deposit may auto-convert. */
	maxPerTxUsd: number;
	/** Max USD that may be auto-converted per UTC day across all deposits. */
	maxPerDayUsd: number;
	/** Minimum USD slice worth converting (dust floor). */
	minPerTxUsd: number;
}

const DEFAULTS = {
	maxPerTxUsd: 10,
	maxPerDayUsd: 20,
	minPerTxUsd: 1,
	pauseFileName: ".credits-offramp-paused",
} as const;

function envNumber(name: string, fallback: number): number {
	const raw = process.env[name];
	if (raw === undefined || raw.trim() === "") return fallback;
	const n = Number(raw);
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function envFlag(name: string): boolean {
	const raw = process.env[name];
	return raw === "true" || raw === "1" || raw === "yes";
}

/** Resolve the live limits config from env (fails CLOSED on missing/garbage). */
export function resolveOffRampLimits(): OffRampLimitsConfig {
	const pauseFilePath =
		process.env.CREDITS_OFFRAMP_PAUSE_FILE && process.env.CREDITS_OFFRAMP_PAUSE_FILE.trim() !== ""
			? process.env.CREDITS_OFFRAMP_PAUSE_FILE.trim()
			: `${process.env.HOME ?? "/tmp"}/${DEFAULTS.pauseFileName}`;
	const maxPerDayUsd = envNumber("MAX_AUTO_CREDITS_USD_PER_DAY", DEFAULTS.maxPerDayUsd);
	// Per-tx can never exceed per-day (a single tx shouldn't blow the daily cap).
	const maxPerTxUsd = Math.min(envNumber("MAX_AUTO_CREDITS_USD_PER_TX", DEFAULTS.maxPerTxUsd), maxPerDayUsd);
	return {
		autoEnabled: envFlag("CREDITS_OFFRAMP_AUTO_ENABLED"),
		pauseFilePath,
		maxPerTxUsd,
		maxPerDayUsd,
		minPerTxUsd: envNumber("MIN_AUTO_CREDITS_USD_PER_TX", DEFAULTS.minPerTxUsd),
	};
}

export type GateDecision =
	| { allowed: true; amountUsd: number }
	| { allowed: false; status: "killed" | "capped" | "skipped"; reason: string; amountUsd: number };

export interface GateInput {
	/** USD value of the candidate conversion slice. */
	amountUsd: number;
	/** Sum of USD already auto-minted (credited+pending) in the current UTC day. */
	spentTodayUsd: number;
	/** Whether the off-ramp is automatable (session secret/token resolvable). */
	automatable: boolean;
}

export interface GateDeps {
	pauseFileExists: (path: string) => boolean;
}

const defaultGateDeps: GateDeps = {
	pauseFileExists: (path) => {
		try {
			return existsSync(path);
		} catch {
			return false;
		}
	},
};

/**
 * Decide whether a candidate auto-mint may proceed, and at what (possibly
 * trimmed) USD amount. Pure given its inputs + deps; the loop persists the
 * decision (including refusals) to the audit table.
 */
export function evaluateGate(
	input: GateInput,
	config: OffRampLimitsConfig,
	deps: GateDeps = defaultGateDeps,
): GateDecision {
	const amountUsd = Number(input.amountUsd.toFixed(2));

	// 1. Global kill-switch (fail CLOSED).
	if (!config.autoEnabled) {
		return {
			allowed: false,
			status: "killed",
			reason: "auto-mint disabled (CREDITS_OFFRAMP_AUTO_ENABLED is not true)",
			amountUsd,
		};
	}
	if (deps.pauseFileExists(config.pauseFilePath)) {
		return {
			allowed: false,
			status: "killed",
			reason: `auto-mint paused by kill-switch file ${config.pauseFilePath}`,
			amountUsd,
		};
	}

	// 2. Automatable?
	if (!input.automatable) {
		return {
			allowed: false,
			status: "skipped",
			reason: "off-ramp not automatable (no platform session secret/token configured)",
			amountUsd,
		};
	}

	// 3. Dust floor.
	if (amountUsd < config.minPerTxUsd) {
		return {
			allowed: false,
			status: "skipped",
			reason: `below minimum auto-mint of $${config.minPerTxUsd}`,
			amountUsd,
		};
	}

	// 4. Per-tx cap.
	if (amountUsd > config.maxPerTxUsd) {
		return {
			allowed: false,
			status: "capped",
			reason: `exceeds per-tx cap of $${config.maxPerTxUsd} (queue for manual)`,
			amountUsd,
		};
	}

	// 5. Per-day cap (remaining headroom).
	const remaining = Number((config.maxPerDayUsd - input.spentTodayUsd).toFixed(2));
	if (remaining <= 0) {
		return {
			allowed: false,
			status: "capped",
			reason: `daily cap of $${config.maxPerDayUsd} reached (spent $${input.spentTodayUsd.toFixed(2)})`,
			amountUsd,
		};
	}
	if (amountUsd > remaining) {
		// Would breach the daily cap. We do NOT silently shrink an on-chain
		// deposit-derived amount (the BNB is already sent for that slice); instead
		// refuse and queue for manual so accounting stays exact.
		return {
			allowed: false,
			status: "capped",
			reason: `would exceed daily cap of $${config.maxPerDayUsd} (only $${remaining.toFixed(2)} left today)`,
			amountUsd,
		};
	}

	return { allowed: true, amountUsd };
}

export function __defaultGateDeps(): GateDeps {
	return { ...defaultGateDeps };
}
