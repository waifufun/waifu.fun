/**
 * Service-view projection of an apps-registry `App` row.
 *
 * The agent page now treats a registered app as a callable SERVICE: a
 * mini-app other agents/users can invoke, billed per call. The pricing,
 * billing reality, and provider live in the app's free-form
 * `metadata` jsonb (set by the register route in
 * `apps/api/src/routes/v2/apps.ts`), not in typed columns. This module
 * reads that bag defensively and exposes a small, presence-honest view
 * model the `ServicesSection` component renders.
 *
 * Honesty rules (mirrors the rest of wave-T):
 *   - Unknown / missing fields are `null`, never a fabricated number or
 *     a misleading `$0`. The UI renders an em-free dash for nulls.
 *   - We never invent a per-call price. The image-gen app is metered by
 *     Eliza Cloud at call time, so a fixed sticker price does not exist.
 *     When the metadata carries an explicit `pricePerCallUsd` we surface
 *     it; otherwise price is `null` and the row shows "metered".
 *   - Settlement mode defaults to "credits" (the only live rail today).
 *     A future on-chain escrow rail sets `metadata.settlementMode =
 *     "escrow"`; we read it but never assume it.
 */

import type { App } from "./apps";

export type SettlementMode = "credits" | "escrow";

export interface AppServiceView {
	/** Registry app id, e.g. "image-gen". Stable key. */
	appId: string;
	/** Display name. */
	name: string;
	/** One-line description, when present. */
	description: string | null;
	/** Live / paused / scheduled. */
	status: App["status"];
	/** Service category, e.g. "image-generation". Null when absent. */
	category: string | null;
	/**
	 * Coarse service type label for the type pill. Derived from
	 * `metadata.category` (preferred) or the appId. Lowercased.
	 */
	typeLabel: string;
	/** Billing unit, e.g. "image", "call". Null when absent. */
	unit: string | null;
	/**
	 * Explicit per-call price in USD when the producer set one. `null`
	 * means the call is metered at runtime (no fixed sticker price), which
	 * the UI renders as "metered" rather than a fake number.
	 */
	pricePerCallUsd: number | null;
	/**
	 * Creator markup percentage on top of the underlying inference cost.
	 * `null` when the metadata does not declare it.
	 */
	markupPercentage: number | null;
	/** Settlement rail. Defaults to "credits" (the only live rail today). */
	settlementMode: SettlementMode;
	/** Provider label, e.g. "eliza-cloud". Null when absent. */
	provider: string | null;
	/** Underlying model label, when the producer attached one. */
	model: string | null;
	/** Invoke endpoint URL, when present. */
	endpoint: string | null;
	/** Lifetime revenue (USD), straight from the registry row. */
	revenueLifetimeUsd: number;
	/** 7d revenue (USD), straight from the registry row. */
	revenue7dUsd: number;
}

function metaRecord(metadata: unknown): Record<string, unknown> {
	return metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
}

function metaString(meta: Record<string, unknown>, key: string): string | null {
	const v = meta[key];
	return typeof v === "string" && v.trim() ? v.trim() : null;
}

function metaNumber(meta: Record<string, unknown>, key: string): number | null {
	const v = meta[key];
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim()) {
		const n = Number(v);
		if (Number.isFinite(n)) return n;
	}
	return null;
}

function resolveSettlementMode(meta: Record<string, unknown>): SettlementMode {
	const raw = metaString(meta, "settlementMode");
	if (raw === "escrow") return "escrow";
	// Everything else (including the metered Eliza Cloud rail) settles in
	// credits today. We deliberately do not infer escrow from anything.
	return "credits";
}

/**
 * Project an apps-registry row into the service view model. Pure and
 * total: never throws, returns presence-honest nulls for missing data.
 */
export function toAppServiceView(app: App): AppServiceView {
	const meta = metaRecord(app.metadata);
	const category = metaString(meta, "category");
	const typeLabel = (category ?? app.appId ?? "service").toLowerCase();
	return {
		appId: app.appId,
		name: app.name,
		description: app.description,
		status: app.status,
		category,
		typeLabel,
		unit: metaString(meta, "unit"),
		pricePerCallUsd: metaNumber(meta, "pricePerCallUsd"),
		markupPercentage: metaNumber(meta, "inferenceMarkupPercentage"),
		settlementMode: resolveSettlementMode(meta),
		provider: metaString(meta, "provider"),
		model: metaString(meta, "model"),
		// Invoke endpoint is the explicit metadata.endpoint ONLY. We do NOT
		// fall back to app.appUrl: appUrl is a storefront/landing page, not an
		// invoke route, and the invoke surface is POST-only (a GET on it would
		// fail). Surfacing appUrl here would mislabel a marketing link as a
		// callable endpoint.
		endpoint: metaString(meta, "endpoint"),
		revenueLifetimeUsd: app.revenueLifetimeUsd,
		revenue7dUsd: app.revenue7dUsd,
	};
}

/**
 * Select the apps that should render as SERVICES on the agent page.
 *
 * A service is a callable mini-app: it has an invoke endpoint and a
 * service category/provider. We exclude the platform-product rows that
 * the persona endpoint synthesizes for the "apps shipped" panel
 * (`metadata.kind === "platform-product"`), since those are storefront
 * links, not invocable services.
 *
 * A row qualifies as a service ONLY on an explicit invoke signal:
 *   - `metadata.kind === "agent-mini-app"` (set by the register route), OR
 *   - `metadata.endpoint` is present (an explicit invoke route), OR
 *   - `metadata.cloudCallable === true`.
 *
 * We deliberately do NOT qualify on `app.appUrl`: appUrl can be a generic
 * storefront/landing page (e.g. the live-demo fixture's "https://example.com"),
 * not an invoke route, so a bare appUrl must not promote an app into the
 * billed-services catalog.
 *
 * Returns [] when nothing qualifies so the section renders nothing.
 */
export function selectServiceApps(apps: App[]): AppServiceView[] {
	const views: AppServiceView[] = [];
	for (const app of apps) {
		const meta = metaRecord(app.metadata);
		const kind = metaString(meta, "kind");
		if (kind === "platform-product") continue;
		const isMiniApp = kind === "agent-mini-app";
		const hasEndpoint = Boolean(metaString(meta, "endpoint"));
		const isCallable = meta.cloudCallable === true;
		if (!isMiniApp && !hasEndpoint && !isCallable) continue;
		views.push(toAppServiceView(app));
	}
	return views;
}
