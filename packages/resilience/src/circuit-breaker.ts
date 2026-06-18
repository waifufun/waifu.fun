/**
 * Circuit breaker state machine for guarding Eliza Cloud calls.
 *
 * States:
 *   closed    — calls flow through. N *consecutive* failures trip it to open.
 *   open      — calls are rejected immediately (CircuitOpenError) until the
 *               half-open delay elapses, then the next call becomes a probe.
 *   half-open — a single probe call is allowed through. Other concurrent calls
 *               are rejected. M consecutive probe successes close the circuit;
 *               any failure re-opens it and restarts the delay.
 */

import { CircuitOpenError } from "./errors.js";

export type CircuitState = "closed" | "open" | "half-open";

/** Numeric encoding for the metrics gauge: closed=0, open=1, half-open=2. */
export const CIRCUIT_STATE_CODE: Readonly<Record<CircuitState, 0 | 1 | 2>> = {
	closed: 0,
	open: 1,
	"half-open": 2,
};

export interface CircuitBreakerOptions {
	/** Human-readable circuit name, used in errors and metrics labels. */
	name: string;
	/** Consecutive failures in `closed` that trip the circuit to `open`. Default 5. */
	failureThreshold?: number;
	/** Consecutive successes in `half-open` that close the circuit. Default 2. */
	successThreshold?: number;
	/** Milliseconds the circuit stays `open` before allowing a half-open probe. Default 30_000. */
	halfOpenAfterMs?: number;
	/** Injectable clock for deterministic tests. Defaults to Date.now. */
	now?: () => number;
	/** Invoked on every state transition. Use for metrics gauge updates. */
	onStateChange?: (next: CircuitState, prev: CircuitState, circuitName: string) => void;
}

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_SUCCESS_THRESHOLD = 2;
const DEFAULT_HALF_OPEN_AFTER_MS = 30_000;

export class CircuitBreaker {
	readonly name: string;
	private readonly failureThreshold: number;
	private readonly successThreshold: number;
	private readonly halfOpenAfterMs: number;
	private readonly now: () => number;
	private readonly onStateChange: CircuitBreakerOptions["onStateChange"];

	private state: CircuitState = "closed";
	/** Consecutive failures while closed. Reset on any success. */
	private consecutiveFailures = 0;
	/** Consecutive probe successes while half-open. */
	private probeSuccesses = 0;
	/** Epoch ms after which an open circuit may accept a half-open probe. */
	private openUntilMs = 0;
	/** True while a half-open probe is in flight (single-probe gate). */
	private probeInFlight = false;

	constructor(options: CircuitBreakerOptions) {
		this.name = options.name;
		this.failureThreshold = options.failureThreshold ?? DEFAULT_FAILURE_THRESHOLD;
		this.successThreshold = options.successThreshold ?? DEFAULT_SUCCESS_THRESHOLD;
		this.halfOpenAfterMs = options.halfOpenAfterMs ?? DEFAULT_HALF_OPEN_AFTER_MS;
		this.now = options.now ?? Date.now;
		this.onStateChange = options.onStateChange;

		if (this.failureThreshold < 1 || this.successThreshold < 1) {
			throw new Error("circuit breaker thresholds must be >= 1");
		}
	}

	/** Current state, after lazily promoting open → half-open if the delay has elapsed. */
	getState(): CircuitState {
		this.refreshOpenToHalfOpen();
		return this.state;
	}

	/**
	 * Run `fn` through the breaker. Rejects with CircuitOpenError without calling
	 * `fn` when the circuit is open (or a probe is already in flight in half-open).
	 * On the wrapped call's outcome, advances the state machine.
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		this.refreshOpenToHalfOpen();

		if (this.state === "open") {
			throw new CircuitOpenError(this.name);
		}

		if (this.state === "half-open") {
			if (this.probeInFlight) {
				// Only one probe at a time; everyone else fails fast.
				throw new CircuitOpenError(this.name);
			}
			this.probeInFlight = true;
			try {
				const result = await fn();
				this.onSuccess();
				return result;
			} catch (err) {
				this.onFailure();
				throw err;
			} finally {
				this.probeInFlight = false;
			}
		}

		// closed
		try {
			const result = await fn();
			this.onSuccess();
			return result;
		} catch (err) {
			this.onFailure();
			throw err;
		}
	}

	private onSuccess(): void {
		if (this.state === "half-open") {
			this.probeSuccesses += 1;
			if (this.probeSuccesses >= this.successThreshold) {
				this.transitionTo("closed");
			}
			return;
		}
		// closed: a success clears any accumulated consecutive-failure count.
		this.consecutiveFailures = 0;
	}

	private onFailure(): void {
		if (this.state === "half-open") {
			// Any probe failure re-opens and restarts the cooldown.
			this.openCircuit();
			return;
		}
		// closed
		this.consecutiveFailures += 1;
		if (this.consecutiveFailures >= this.failureThreshold) {
			this.openCircuit();
		}
	}

	private openCircuit(): void {
		this.openUntilMs = this.now() + this.halfOpenAfterMs;
		this.transitionTo("open");
	}

	/** Promote open → half-open once the cooldown has elapsed. */
	private refreshOpenToHalfOpen(): void {
		if (this.state === "open" && this.now() >= this.openUntilMs) {
			this.transitionTo("half-open");
		}
	}

	private transitionTo(next: CircuitState): void {
		const prev = this.state;
		if (prev === next) {
			return;
		}
		this.state = next;
		if (next === "half-open") {
			this.probeSuccesses = 0;
			this.probeInFlight = false;
		} else if (next === "closed") {
			this.consecutiveFailures = 0;
			this.probeSuccesses = 0;
			this.probeInFlight = false;
		}
		this.onStateChange?.(next, prev, this.name);
	}
}
