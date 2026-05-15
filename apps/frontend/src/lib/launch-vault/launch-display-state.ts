/**
 * Display-state machine for the launch round page under the Wave H
 * Flap-native flow.
 *
 * We have two inputs and one output:
 *
 *   inputs:
 *     - on-chain vault state (0=OPEN, 1=CLOSED, 2=LAUNCHED, 3=REFUND) via `VaultState`
 *     - off-chain backend status (`PublicLaunchExtended.status`):
 *         "draft" | "provisioned" | "queued" | "launching" | "live" | "failed"
 *     - extras: `closeTimestamp`, `predictedTokenAddress`, `tokenAddress`
 *
 *   output: a single `LaunchDisplayState` enum that the hero / status
 *   page maps to copy + UI.
 *
 * The six display states (per the Wave H frontend spec):
 *
 *   created    — agent provisioned, presale opens at `closeTimestamp`
 *   presale    — presale is open, deposits + withdraws live
 *   closed     — presale closed, awaiting bundle
 *   bundling   — bundle submitted to puissant, watching for inclusion
 *   launched   — bundle confirmed, token live on flap + pcs v2
 *   refunding  — bundle reverted / abandoned; depositors can claim refunds
 *
 * The mapper is deliberately defensive about ambiguous inputs (e.g.
 * vault still OPEN but backend says "live") and prefers the on-chain
 * state when it's more definitive.
 */

import { VaultState, type VaultStateValue } from "./abi";

export type LaunchDisplayState = "created" | "presale" | "closed" | "bundling" | "launched" | "refunding";

export type LaunchBackendStatus = "draft" | "provisioned" | "queued" | "launching" | "live" | "failed" | (string & {});

export type LaunchDisplayInputs = {
	/** On-chain `LaunchVault.state()`. Null when the vault address isn't known yet. */
	vaultState: VaultStateValue | number | null;
	/** Off-chain status from the API. Null when the API hasn't responded. */
	backendStatus: LaunchBackendStatus | null | undefined;
	/** Unix seconds when presale closes. Used to flip created → presale. */
	closeTimestamp: bigint | number | null;
	/** Real token address from the indexer after the bundle confirms. */
	tokenAddress: string | null | undefined;
	/** "now" override for tests. Defaults to `Date.now()`. */
	nowSeconds?: number;
};

function toUnix(value: bigint | number | null): number | null {
	if (value === null) return null;
	if (typeof value === "bigint") return Number(value);
	return value;
}

/**
 * Pure mapper from on-chain + off-chain inputs to a display state.
 *
 * Priority order (most authoritative first):
 *   1. Vault state is `REFUND` (3) → `refunding` (most definitive)
 *   2. Backend says `failed` → `refunding`
 *   3. Backend says `live` AND token address known → `launched`
 *   4. Vault state is `LAUNCHED` (2) → `launched` (even if backend is laggy)
 *   5. Backend says `launching` OR vault state is `CLOSED` (1) → `bundling`
 *      - unless the close timestamp is in the future, in which case `closed`
 *        (vault is CLOSED but bundle bot hasn't picked it up yet)
 *   6. Vault state `OPEN` (0):
 *      - if `closeTimestamp` is in the past → `closed` (waiting for bundle)
 *      - else → `presale`
 *   7. Default → `created`
 */
export function deriveLaunchDisplayState(inputs: LaunchDisplayInputs): LaunchDisplayState {
	const now = inputs.nowSeconds ?? Math.floor(Date.now() / 1000);
	const close = toUnix(inputs.closeTimestamp);
	const status = (inputs.backendStatus ?? "").toLowerCase();

	if (inputs.vaultState === VaultState.REFUND) return "refunding";

	if (status === "failed") return "refunding";

	if (status === "live" && inputs.tokenAddress) return "launched";

	if (inputs.vaultState === VaultState.LAUNCHED) return "launched";

	if (status === "launching") return "bundling";

	if (inputs.vaultState === VaultState.CLOSED) {
		// Bundle bot picks up shortly after close; "closed" is the brief
		// gap state where the cap was hit or the timer elapsed but the
		// bundle hasn't been signed yet.
		return "bundling";
	}

	if (inputs.vaultState === VaultState.OPEN) {
		if (close !== null && close > 0 && now >= close) return "closed";
		return "presale";
	}

	// No vault state at all means we're in the pre-presale lobby: agent
	// provisioned, presale hasn't opened. The hero shows "presale opens
	// at X" copy here.
	return "created";
}

/**
 * Headline copy for each display state. Keep these short — the hero
 * surface uses them as the single-line status badge subtitle.
 */
export function displayStateHeadline(state: LaunchDisplayState): string {
	switch (state) {
		case "created":
			return "agent provisioned. presale opens shortly.";
		case "presale":
			return "presale open. deposit bnb to claim allocation.";
		case "closed":
			return "presale closed. bundle preparing.";
		case "bundling":
			return "submitting bundle to puissant. ~1-2 blocks.";
		case "launched":
			return "live on flap. graduated to pcs v2.";
		case "refunding":
			return "bundle failed. claim refunds inside the window.";
	}
}

/** Short label used in chips / badges (4-8 chars typically). */
export function displayStateLabel(state: LaunchDisplayState): string {
	switch (state) {
		case "created":
			return "created";
		case "presale":
			return "live";
		case "closed":
			return "closed";
		case "bundling":
			return "bundling";
		case "launched":
			return "launched";
		case "refunding":
			return "refunding";
	}
}

/** Tone class hint for the hero badge. Maps to existing accent colors. */
export function displayStateTone(state: LaunchDisplayState): "accent" | "warn" | "info" | "danger" {
	switch (state) {
		case "presale":
			return "accent";
		case "launched":
			return "info";
		case "refunding":
			return "danger";
		case "closed":
		case "bundling":
		case "created":
			return "warn";
	}
}
