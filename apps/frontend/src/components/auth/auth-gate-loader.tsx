"use client";

/**
 * Tiny monochrome placeholder shown while the auth gate is resolving
 * (Steward context still loading, or in-page redirect in flight).
 *
 * Intentionally minimal — no spinner, no animation. The point is to
 * NOT flash protected page chrome at an anonymous visitor for the
 * 50–200ms it takes the auth state to hydrate.
 */
export function AuthGateLoader() {
	return (
		<div className="min-h-[100dvh] flex items-center justify-center bg-[#08080a]">
			<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">verifying session…</div>
		</div>
	);
}
