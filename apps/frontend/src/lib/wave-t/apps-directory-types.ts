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

/**
 * App category. Drives the grouping on the directory page so apps with the
 * same job sit together (chat, trading, content, image, infra). Inferred from
 * an explicit metadata `category`/`kind` first, then from the appId, then a
 * keyword scan of name/description. Never throws, always returns a bucket.
 */
export type AppCategory = "chat" | "trading" | "content" | "image" | "infra" | "other";

export const CATEGORY_LABEL: Record<AppCategory, string> = {
	chat: "chat",
	trading: "trading",
	content: "content",
	image: "image",
	infra: "infra",
	other: "apps",
};

/** Order categories render in on the page (most product-facing first). */
export const CATEGORY_ORDER: AppCategory[] = ["chat", "trading", "content", "image", "infra", "other"];

const CATEGORY_BY_APP_ID: Record<string, AppCategory> = {
	waifu: "chat",
	"waifu-terminal": "chat",
	terminal: "chat",
	steward: "infra",
	"trading-perps": "trading",
	perps: "trading",
	trading: "trading",
	predictions: "trading",
	"twitter-replies": "content",
	content: "content",
	posts: "content",
	"image-gen": "image",
	image: "image",
	"image-generation": "image",
};

function asCategory(value: unknown): AppCategory | null {
	if (typeof value !== "string") return null;
	const c = value.toLowerCase();
	if (c === "chat" || c === "trading" || c === "content" || c === "image" || c === "infra") return c;
	return null;
}

export function appCategory(app: App): AppCategory {
	const m = app.metadata as Record<string, unknown> | null | undefined;
	// explicit source of truth: metadata.category first, then metadata.kind.
	// kind is often a producer label like "platform-product" that is not a
	// category, so only honor it when it actually names a known bucket.
	if (m && typeof m === "object") {
		const explicit = asCategory(m.category) ?? asCategory(m.kind);
		if (explicit) return explicit;
	}
	const byId = CATEGORY_BY_APP_ID[app.appId];
	if (byId) return byId;
	const hay = `${app.appId} ${app.name} ${app.description ?? ""}`.toLowerCase();
	if (/(image|render|art|diffus|pixel|avatar)/.test(hay)) return "image";
	if (/(trade|perp|hyperliquid|predict|polymarket|position|swap)/.test(hay)) return "trading";
	if (/(reply|repl|post|tweet|content|write|thread)/.test(hay)) return "content";
	if (/(chat|talk|message|companion|terminal)/.test(hay)) return "chat";
	if (/(infra|steward|billing|treasury|ledger)/.test(hay)) return "infra";
	return "other";
}
