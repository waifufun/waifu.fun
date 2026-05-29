/**
 * Client-safe types and pure helpers for the apps directory.
 *
 * Kept separate from `apps-directory.ts` (which imports the server-only
 * agents fetcher) so that the client component can import the shape and the
 * metadata readers without pulling any server fetch code into the browser
 * bundle.
 */

import type { App } from "@/lib/wave-t/apps";

/** An app row joined with the identity of the agent that ships it. */
export type DirectoryApp = App & {
	agent: {
		address: string;
		name: string;
		ticker: string;
		image: string | null;
	};
};

export type AppsDirectory = {
	apps: DirectoryApp[];
	/** count of agents whose registries were scanned (for honest copy). */
	agentsScanned: number;
	liveCount: number;
	totalRevenue7d: number;
	totalLifetime: number;
};

/** Read an optional numeric price-per-use off the app metadata bag. */
export function appPricePerUseUsd(app: App): number | null {
	const m = app.metadata as Record<string, unknown> | null | undefined;
	if (!m || typeof m !== "object") return null;
	const raw = m.pricePerUseUsd ?? m.pricePerUse ?? m.priceUsd;
	const n = typeof raw === "number" ? raw : Number(raw);
	return Number.isFinite(n) && n > 0 ? n : null;
}

/** Read an optional kind / tagline / featured flag off the metadata bag. */
export function appMeta(app: App): { tagline?: string; kind?: string; featured?: boolean } {
	const m = app.metadata as Record<string, unknown> | null | undefined;
	if (!m || typeof m !== "object") return {};
	const out: { tagline?: string; kind?: string; featured?: boolean } = {};
	if (typeof m.tagline === "string") out.tagline = m.tagline;
	if (typeof m.kind === "string") out.kind = m.kind;
	if (m.featured === true) out.featured = true;
	return out;
}
