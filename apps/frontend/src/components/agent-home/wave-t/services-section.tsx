/**
 * ServicesSection: the agent's registered mini-apps, framed as callable
 * SERVICES.
 *
 * An agent on waifu.fun is now two things: (1) a verifiable ERC-8004
 * on-chain identity, and (2) a provider of mini-apps other agents/users
 * can invoke, billed per call. This panel surfaces (2): the catalog of
 * services this agent offers.
 *
 * Design rules (wave-T grammar, per `.impeccable.md`):
 *   - One Panel wrapper. Single accent (#00ff87), no purple, no glow.
 *   - All numbers tabular mono. Missing values render an em-free dash,
 *     never a fabricated `$0` or placeholder price.
 *   - Per-row: name, type pill, settlement pill (credits | escrow),
 *     per-call price (or "metered" when no fixed sticker price exists),
 *     creator markup, and a status dot.
 *   - Premium / calm / spacious: generous row padding, hairline
 *     dividers, no card-in-card nesting.
 *
 * Presence behavior:
 *   - Renders NOTHING when `services` is empty. The agent page gates on
 *     this (no empty shell, no "no services yet" card cluttering the
 *     surface for agents that have not registered any).
 *
 * NOTE (backend): there is no dedicated read endpoint that projects the
 * service view; we derive it client-side from the existing
 * `/v2/agents/:address/apps` registry rows (see
 * `lib/wave-t/app-service.ts#selectServiceApps`). A future
 * `/v2/agents/:address/services` endpoint could return the projected
 * shape directly, including a real `pricePerCallUsd` and an explicit
 * `settlementMode` once on-chain escrow ships. Until then price is
 * "metered" for the Eliza Cloud rail and settlement defaults to credits.
 */

"use client";

import { cn } from "@/lib/utils";

import type { AppServiceView, SettlementMode } from "@/lib/wave-t/app-service";
import { Label, Panel, Pulse, StatPill } from "./_primitives";

function formatPrice(view: AppServiceView): { value: string; muted: boolean } {
	if (view.pricePerCallUsd === null) {
		// No fixed sticker price: the call is metered at invocation time.
		// We say so honestly rather than printing a fake number.
		return { value: "metered", muted: true };
	}
	const unit = view.unit ? ` / ${view.unit}` : "";
	const price = view.pricePerCallUsd;
	const formatted =
		price >= 1 ? `$${price.toFixed(2)}` : price > 0 ? `$${price.toFixed(price >= 0.01 ? 4 : 6)}` : "$0.00";
	return { value: `${formatted}${unit}`, muted: false };
}

function formatMarkup(view: AppServiceView): string {
	if (view.markupPercentage === null) return "–";
	// Whole numbers render clean; fractional markups keep one decimal.
	const m = view.markupPercentage;
	return Number.isInteger(m) ? `+${m}%` : `+${m.toFixed(1)}%`;
}

function SettlementPill({ mode }: { mode: SettlementMode }) {
	// Both rails read as neutral chrome; the accent is reserved for the
	// verified-identity treatment and live pulses, not billing labels.
	const label = mode === "escrow" ? "escrow" : "credits";
	const hint = mode === "escrow" ? "on-chain escrow settlement" : "credit-metered settlement";
	return (
		<span title={hint}>
			<StatPill tone="neutral">{label}</StatPill>
		</span>
	);
}

function StatusDot({ status }: { status: AppServiceView["status"] }) {
	if (status === "live") {
		return (
			<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--positive)]">
				<Pulse tone="positive" />
				live
			</span>
		);
	}
	if (status === "paused") {
		return (
			<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-secondary)]">paused</span>
		);
	}
	return (
		<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">scheduled</span>
	);
}

function ServiceRow({ view }: { view: AppServiceView }) {
	const price = formatPrice(view);
	const providerLine = [view.provider, view.model].filter(Boolean).join(" · ");

	return (
		<li className="py-3.5">
			<div className="flex items-start justify-between gap-4">
				{/* Identity: name + type pill + provider/model subline. */}
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="truncate text-[13px] text-[var(--text-primary)]">{view.name}</span>
						<StatPill tone="neutral">{view.typeLabel}</StatPill>
						<SettlementPill mode={view.settlementMode} />
					</div>
					{view.description ? (
						<p className="mt-1 line-clamp-2 max-w-[44ch] font-mono text-[10.5px] leading-relaxed text-[var(--text-tertiary)]">
							{view.description}
						</p>
					) : null}
					{providerLine ? (
						<p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
							{providerLine}
						</p>
					) : null}
				</div>

				{/* Pricing + status, right-aligned mono. */}
				<div className="flex shrink-0 flex-col items-end gap-1">
					<StatusDot status={view.status} />
					<span
						className={cn(
							"font-mono text-[13px] tabular-nums",
							price.muted ? "text-[var(--text-secondary)]" : "text-[var(--text-primary)]",
						)}
					>
						{price.value}
					</span>
					<span className="font-mono text-[10px] tabular-nums text-[var(--text-tertiary)]">
						markup {formatMarkup(view)}
					</span>
					{/* No clickable invoke link: the invoke route is POST-only and a
					    GET click would fail. The invoke surface lives in a separate
					    panel; this catalog is read-only. */}
				</div>
			</div>
		</li>
	);
}

export function ServicesSection({ services }: { services: AppServiceView[] }) {
	// Presence gate: nothing to show means nothing renders. The parent
	// also guards on this, but keeping the component honest lets callers
	// drop it in without a wrapper conditional.
	if (services.length === 0) return null;

	const liveCount = services.filter((s) => s.status === "live").length;

	return (
		<Panel className="scroll-mt-4" noPad>
			<div id="services" aria-hidden="true" />
			<div className="p-4 md:p-5">
				<Label
					right={
						<span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] tabular-nums">
							{liveCount} live · {services.length} total
						</span>
					}
				>
					services · mini-apps
				</Label>

				<p className="mb-3 max-w-[64ch] font-mono text-[10.5px] leading-relaxed text-[var(--text-tertiary)]">
					callable mini-apps this agent provides. each invocation is billed per call.
				</p>

				<ul className="divide-y divide-[var(--border-soft)]">
					{services.map((view) => (
						<ServiceRow key={view.appId} view={view} />
					))}
				</ul>
			</div>
		</Panel>
	);
}
