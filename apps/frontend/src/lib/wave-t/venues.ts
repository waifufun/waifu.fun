/**
 * Venue logo mapping for the Wave T agent home panels.
 *
 * Logos live in `apps/frontend/public/venue-logos/{id}.svg`. The marks are
 * simplified house-drawn renditions of each venue's brand color and primary
 * letterform, kept small and license-safe. If a venue rebrands or wants their
 * official mark used, swap the SVG in place; no code changes needed.
 *
 * Real brand assets (apple-touch-icon.png at 180×180+) from each venue's
 * official site, downloaded 2026-05-21. Drift kept as SVG (their favicon is
 * a real SVG with the D-arrow mark). FLAP is the in-house waifu green mark.
 * If a venue rebrands, just swap the file in place; no code changes needed.
 *
 * Adding a venue:
 *   1. drop `apps/frontend/public/venue-logos/{id}.svg`
 *   2. append `{ id, label, color, accent }` to VENUES below
 *   3. callers get `getVenueLogo(id)` and `getVenueMeta(id)` for free
 */

export type VenueId = "pancakeswap" | "hyperliquid" | "polymarket" | "drift" | "aevo" | "gmx" | "four-meme" | "flap";

export type VenueMeta = {
	id: VenueId;
	label: string;
	/** Primary brand color, used as fallback tint when the SVG fails to load. */
	color: string;
	/** Secondary accent color, used for text/ring next to the logo. */
	accent: string;
	/** Public path to the SVG (or PNG) brand mark. */
	logo: string;
};

const VENUES: Record<VenueId, VenueMeta> = {
	pancakeswap: {
		id: "pancakeswap",
		label: "PancakeSwap",
		color: "#D1884F",
		accent: "#FEDC90",
		logo: "/venue-logos/pancakeswap.png",
	},
	hyperliquid: {
		id: "hyperliquid",
		label: "Hyperliquid",
		color: "#97FCE4",
		accent: "#0F1B1A",
		logo: "/venue-logos/hyperliquid.png",
	},
	polymarket: {
		id: "polymarket",
		label: "Polymarket",
		color: "#2D9CDB",
		accent: "#2D9CDB",
		logo: "/venue-logos/polymarket.png",
	},
	drift: {
		id: "drift",
		label: "Drift",
		color: "#9261FF",
		accent: "#9261FF",
		logo: "/venue-logos/drift.svg",
	},
	aevo: {
		id: "aevo",
		label: "Aevo",
		color: "#F5F5F7",
		accent: "#F5F5F7",
		logo: "/venue-logos/aevo.png",
	},
	gmx: {
		id: "gmx",
		label: "GMX",
		color: "#4FA3E3",
		accent: "#4FA3E3",
		logo: "/venue-logos/gmx.png",
	},
	"four-meme": {
		id: "four-meme",
		label: "four.meme",
		color: "#FACC15",
		accent: "#FACC15",
		logo: "/venue-logos/four-meme.png",
	},
	flap: {
		id: "flap",
		label: "FLAP",
		color: "#00FF87",
		accent: "#00FF87",
		logo: "/venue-logos/flap.svg",
	},
};

const ALIASES: Record<string, VenueId> = {
	pancake: "pancakeswap",
	pancakeswap: "pancakeswap",
	"pancake-v3": "pancakeswap",
	"pancake v3": "pancakeswap",
	"pancake v3 lp": "pancakeswap",
	pcs: "pancakeswap",
	hyperliquid: "hyperliquid",
	hl: "hyperliquid",
	"hl perp": "hyperliquid",
	"hyperliquid perp": "hyperliquid",
	polymarket: "polymarket",
	poly: "polymarket",
	drift: "drift",
	"drift perp": "drift",
	aevo: "aevo",
	gmx: "gmx",
	"four.meme": "four-meme",
	"four-meme": "four-meme",
	fourmeme: "four-meme",
	flap: "flap",
};

/** Normalize a free-form venue string (case insensitive, alias aware). */
export function venueIdOf(input: string | null | undefined): VenueId | null {
	if (!input) return null;
	const v = input.toLowerCase().trim();
	if (v in ALIASES) return ALIASES[v] as VenueId;
	// substring fallback so "spot bsc via pancakeswap" still resolves
	for (const key of Object.keys(ALIASES)) {
		if (v.includes(key)) return ALIASES[key] as VenueId;
	}
	return null;
}

/** Sync resolve: returns the public path or null if not a known venue. */
export function getVenueLogo(venue: string | VenueId): string | null {
	const id = (venue in VENUES ? (venue as VenueId) : venueIdOf(venue)) ?? null;
	if (!id) return null;
	return VENUES[id].logo;
}

/** Get full venue metadata. */
export function getVenueMeta(venue: string | VenueId): VenueMeta | null {
	const id = (venue in VENUES ? (venue as VenueId) : venueIdOf(venue)) ?? null;
	if (!id) return null;
	return VENUES[id];
}

/** All known venues, useful for legends or pickers. */
export function listVenues(): VenueMeta[] {
	return Object.values(VENUES);
}
