/**
 * Module-level auth token store for the API client.
 *
 * This allows fetchers (legacy `lib/api.ts` and the canonical
 * `lib/api/_fetcher.ts`) to include an Authorization header without every
 * call site needing to pass tokens manually.
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
 * Used by the legacy fetcher in `lib/api.ts` to build Authorization headers.
 */
export function getApiToken(): string | null {
	return _tokenGetter?.() ?? null;
}

/**
 * Get the current Steward JWT (if any).
 *
 * Alias of `getApiToken()` named for the canonical Wave 9 fetcher in
 * `lib/api/_fetcher.ts`. Both names point at the same module-global the
 * `useApiAuth` hook populates from `@stwd/react`.
 */
export function getStewardJwt(): string | null {
	return _tokenGetter?.() ?? null;
}
