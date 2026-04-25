// Centralized motion tokens. All site-wide easing lives here.

export const EASE_HERO = [0.22, 1, 0.36, 1] as const;
// Used by: landing/hero, magnetic CTAs, three-runtime-options, page transitions on landing.

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
// Used by: dialogs, modals, overlays, litepaper reveals, in-card transitions.

export const EASE_OUT_QUART = [0.32, 0.72, 0, 1] as const;
// Used by: CTA hover states.

export const DUR = {
	fast: 0.2,
	normal: 0.32,
	reveal: 0.6,
	hero: 0.8,
} as const;
