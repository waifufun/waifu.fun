/**
 * Error types and classification for the Eliza Cloud resilience layer.
 *
 * The classifier is the single source of truth for "is this failure transient
 * and therefore safe to retry?". It must return true ONLY for 5xx responses and
 * timeouts, and false for every 4xx (including 409 adoption and 429 rate limit)
 * so that non-idempotent mutations and conflict/adoption paths are never retried.
 */

/**
 * Raised when a circuit breaker is open (or its half-open probe slot is already
 * taken) and the wrapped call is rejected without touching the upstream.
 */
export class CircuitOpenError extends Error {
	readonly circuitName: string;

	constructor(circuitName: string) {
		super(`circuit "${circuitName}" is open`);
		this.name = "CircuitOpenError";
		this.circuitName = circuitName;
	}
}

/**
 * Terminal error surfaced to consuming routes when Eliza Cloud is unavailable
 * (circuit open). Carries an HTTP 503 status and a machine-readable code so
 * route handlers can translate it into an honest 503 + remediation hint.
 */
export class ElizaCloudUnavailableError extends Error {
	readonly httpStatus: 503;
	readonly code: "ELIZA_CLOUD_UNAVAILABLE";
	readonly circuitName: string | undefined;
	override readonly cause: unknown;

	constructor(
		message = "Eliza Cloud is temporarily unavailable",
		opts: { circuitName?: string; cause?: unknown } = {},
	) {
		super(message);
		this.name = "ElizaCloudUnavailableError";
		this.httpStatus = 503;
		this.code = "ELIZA_CLOUD_UNAVAILABLE";
		this.circuitName = opts.circuitName;
		this.cause = opts.cause;
	}
}

/**
 * Minimal shape the classifier needs from an Eliza Cloud HTTP error. `ElizaApiError`
 * in apps/api satisfies this structurally (it exposes a numeric `status`). We avoid a
 * package dependency on apps/api by matching on the field rather than the class.
 */
interface HttpStatusError {
	status: number;
}

function hasNumericStatus(error: unknown): error is HttpStatusError {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		typeof (error as { status: unknown }).status === "number"
	);
}

function isTimeoutError(error: unknown): boolean {
	// Native fetch AbortSignal.timeout() rejects with a DOMException named "TimeoutError".
	// DOMException is not always present in every runtime's global scope, so match by shape.
	return (
		typeof error === "object" &&
		error !== null &&
		"name" in error &&
		(error as { name: unknown }).name === "TimeoutError"
	);
}

/**
 * Returns true only for transient Eliza Cloud failures that are safe to retry on
 * idempotent operations: any 5xx status (incl. the 504 our client raises on
 * fetch timeout) and raw timeout errors. Returns false for every 4xx — including
 * 409 (provisioning adoption) and 429 (rate limit) — and for any unrecognized
 * error (fail closed: do not retry what we cannot classify).
 */
export function isRetryableElizaError(error: unknown): boolean {
	if (error instanceof CircuitOpenError || error instanceof ElizaCloudUnavailableError) {
		// An open circuit is not a transient upstream blip the retry loop should hammer.
		return false;
	}
	if (isTimeoutError(error)) {
		return true;
	}
	if (hasNumericStatus(error)) {
		const { status } = error;
		// 5xx only. 4xx (incl. 409 adoption, 429 rate-limit) is never retryable.
		return status >= 500 && status <= 599;
	}
	return false;
}
