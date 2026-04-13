/**
 * Module-level auth token store for the API client.
 *
 * This allows the `fetcher` in api.ts to include an Authorization header
 * without every call site needing to pass tokens manually.
 *
 * The token is set by the `useApiAuth` hook which syncs the Steward JWT
 * into this store whenever the session changes.
 */

type TokenGetter = () => string | null;

let _tokenGetter: TokenGetter | null = null;

/**
 * Register a function that returns the current auth token.
 * Called by useApiAuth to wire the Steward session into API requests.
 */
export function setApiTokenGetter(getter: TokenGetter | null) {
  _tokenGetter = getter;
}

/**
 * Get the current auth token (if any).
 * Used by the fetcher to build Authorization headers.
 */
export function getApiToken(): string | null {
  return _tokenGetter?.() ?? null;
}
