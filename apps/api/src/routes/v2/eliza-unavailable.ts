/**
 * Shared translation of the resilience layer's {@link ElizaCloudUnavailableError}
 * (raised when the circuit breaker is open) into a machine-readable HTTP 503 body.
 *
 * Every consuming route returns the SAME shape — `{ error, code, remediation }`
 * plus a `retryAfterSeconds` hint — differing only by the per-surface code so
 * clients can branch on which capability degraded (chat vs runtime control vs
 * credits vs crypto off-ramp). A 503 is honest here: the request never reached
 * Eliza Cloud, so retrying shortly is the correct client behaviour. 4xx (incl.
 * 409 adoption / 429 rate limit) is NEVER funneled through this helper.
 */

import { ElizaCloudUnavailableError } from "@waifufun/resilience";

/** Per-route error codes surfaced when Eliza Cloud is unavailable (circuit open). */
export type ElizaUnavailableCode =
	| "ELIZA_CLOUD_UNAVAILABLE"
	| "RUNTIME_CONTROL_UNAVAILABLE"
	| "CRYPTO_UNAVAILABLE"
	| "CREDITS_UNAVAILABLE";

/** Default seconds a client should wait before retrying — matches the breaker half-open delay. */
const DEFAULT_RETRY_AFTER_SECONDS = 30;

const REMEDIATION: Record<ElizaUnavailableCode, string> = {
	ELIZA_CLOUD_UNAVAILABLE:
		"Agent cloud is temporarily unavailable. Try sending your message again in about 30 seconds.",
	RUNTIME_CONTROL_UNAVAILABLE:
		"Agent runtime controls are temporarily unavailable. Your agent is unaffected; retry the action in about 30 seconds.",
	CRYPTO_UNAVAILABLE:
		"The crypto credit off-ramp is temporarily unavailable. Your funds are safe; retry in about 30 seconds or use the manual payout instructions.",
	CREDITS_UNAVAILABLE:
		"Agent credit operations are temporarily unavailable. No charge was made; retry in about 30 seconds.",
};

export interface ElizaUnavailableBody {
	ok: false;
	error: ElizaUnavailableCode;
	code: ElizaUnavailableCode;
	remediation: string;
	retryAfterSeconds: number;
}

/** True when `err` is the open-circuit terminal error from the resilience layer. */
export function isElizaCloudUnavailable(err: unknown): err is ElizaCloudUnavailableError {
	return err instanceof ElizaCloudUnavailableError;
}

/**
 * Build the canonical 503 body for an open-circuit failure. Callers pass the
 * per-surface code; the remediation string and retry hint are filled in here so
 * the shape stays identical across every route.
 */
export function elizaUnavailableBody(code: ElizaUnavailableCode): ElizaUnavailableBody {
	return {
		ok: false,
		error: code,
		code,
		remediation: REMEDIATION[code],
		retryAfterSeconds: DEFAULT_RETRY_AFTER_SECONDS,
	};
}
