/**
 * @waifufun/resilience — circuit breaker + bounded retry + Eliza Cloud error
 * classification for guarding calls to Eliza Cloud.
 *
 * Public surface (FROZEN for pr2-impl-integration):
 *   - CircuitBreaker, CircuitState, CircuitBreakerOptions, CIRCUIT_STATE_CODE
 *   - withRetry, RetryOptions, computeBackoffMs
 *   - isRetryableElizaError
 *   - ElizaCloudUnavailableError (httpStatus 503, code "ELIZA_CLOUD_UNAVAILABLE")
 *   - CircuitOpenError
 */

export { CircuitBreaker, CIRCUIT_STATE_CODE } from "./circuit-breaker.js";
export type { CircuitState, CircuitBreakerOptions } from "./circuit-breaker.js";

export { withRetry, computeBackoffMs } from "./retry.js";
export type { RetryOptions } from "./retry.js";

export { CircuitOpenError, ElizaCloudUnavailableError, isRetryableElizaError } from "./errors.js";
