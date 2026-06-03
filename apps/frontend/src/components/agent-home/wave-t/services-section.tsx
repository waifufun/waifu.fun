/**
 * ServicesSection: the unified mini-apps catalog. ONE entry point to both
 * browse an agent's services and invoke them.
 *
 * An agent on waifu.fun is two things: (1) a verifiable ERC-8004 on-chain
 * identity, and (2) a provider of mini-apps other agents/users can invoke,
 * billed per call. This panel surfaces (2).
 *
 * Interaction model (the unify, 2026-06-03):
 *   - Each service is a row. Rows whose appId has a registered invoke
 *     surface AND a currently-callable live registry row are TAPPABLE: a
 *     tap expands the row to reveal its invoke body INLINE (prompt, aspect,
 *     generate, result, settled charge for image-gen), inside this same
 *     panel. No detached panel, no modal that dims the page.
 *   - Services that exist but are not callable yet (paused/scheduled, or no
 *     invoke surface registered) list as DISABLED. No fake button, honest
 *     about not being invocable.
 *   - Only one row is open at a time, keeping the cockpit dense.
 *
 * The invoke surfaces themselves live behind a registry (`service-invoke.tsx`)
 * so future apps (twitter-replies, trading, ...) slot in by registering a
 * body, with no edit to this catalog or to agent-home-v2.tsx.
 *
 * Design rules (wave-T grammar, per `.impeccable.md`):
 *   - One Panel wrapper. Single accent (#00ff87), no purple, no glow.
 *   - All numbers tabular mono. Missing values render an em-free dash,
 *     never a fabricated `$0` or placeholder price.
 *   - Per-row: name, type pill, settlement pill (credits | escrow),
 *     per-call price (or "metered"), creator markup, status dot.
 *   - Density over whitespace: hairline-divided rows, tight padding.
 *
 * Presence behavior:
 *   - Renders NOTHING when `services` is empty (parent also gates on this).
 */

"use client";

import { ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";

import { cn } from "@/lib/utils";
import type { AppServiceView, SettlementMode } from "@/lib/wave-t/app-service";
import type { App } from "@/lib/wave-t/apps";

import { Hairline, Label, Panel, Pulse, StatPill } from "./_primitives";
import { resolveInvoker } from "./service-invoke";

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
	if (view.markupPercentage === null) return "n/a";
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

/** The scannable identity + pricing summary, shared by every row. */
function RowSummary({ view }: { view: AppServiceView }) {
	const price = formatPrice(view);
	const providerLine = [view.provider, view.model].filter(Boolean).join(" · ");

	return (
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
			</div>
		</div>
	);
}

interface ServiceRowProps {
	view: AppServiceView;
	/** The raw registry rows, so an open row can resolve its invoke surface. */
	apps: App[];
	open: boolean;
	onToggle: (appId: string) => void;
	/** Catalog-level callback when a row's invoke reports a 404. */
	onUnavailable: (appId: string) => void;
}

function ServiceRow({ view, apps, open, onToggle, onUnavailable }: ServiceRowProps) {
	// Resolve the invoke surface for this row: requires a registered invoker
	// AND a currently-callable live registry row. Null -> list-but-disabled.
	const resolved = resolveInvoker(view.appId, apps);
	const invokable = resolved !== null;

	const handleUnavailable = useCallback(() => onUnavailable(view.appId), [onUnavailable, view.appId]);

	if (!invokable) {
		// Listed but not callable: no fake button, no tap affordance. Honest
		// about the service existing without a usable invoke route yet.
		return (
			<li className="py-3.5">
				<RowSummary view={view} />
				<p className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					not invocable yet
				</p>
			</li>
		);
	}

	const panelId = `service-invoke-${view.appId}`;
	const { invoker, app } = resolved;
	const Body = invoker.Body;

	return (
		<li className="py-3.5">
			<button
				type="button"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => onToggle(view.appId)}
				className="group block w-full text-left"
			>
				<div className="flex items-start gap-3">
					<div className="min-w-0 flex-1">
						<RowSummary view={view} />
					</div>
					<ChevronDown
						aria-hidden
						strokeWidth={1.5}
						className={cn(
							"mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-all",
							"group-hover:text-[var(--text-secondary)]",
							open && "rotate-180 text-[var(--accent)]",
						)}
					/>
				</div>
				{!open ? (
					<p className="mt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)] group-hover:text-[var(--accent)]">
						tap to use
					</p>
				) : null}
			</button>

			{open ? (
				<div id={panelId} className="mt-3">
					<Hairline className="mb-3" />
					<Body agentTokenAddress={app.agentTokenAddress} app={app} onUnavailable={handleUnavailable} />
				</div>
			) : null}
		</li>
	);
}

export function ServicesSection({ services, apps }: { services: AppServiceView[]; apps: App[] }) {
	// Presence gate: nothing to show means nothing renders. The parent also
	// guards on this; keeping the component honest lets callers drop it in.
	const [openAppId, setOpenAppId] = useState<string | null>(null);
	// AppIds the backend told us went stale (404) mid-session. We strip their
	// tap affordance so a broken generator never stays open.
	const [unavailable, setUnavailable] = useState<Set<string>>(() => new Set());

	const onToggle = useCallback((appId: string) => {
		setOpenAppId((cur) => (cur === appId ? null : appId));
	}, []);

	const onUnavailable = useCallback((appId: string) => {
		setUnavailable((cur) => {
			if (cur.has(appId)) return cur;
			const next = new Set(cur);
			next.add(appId);
			return next;
		});
		setOpenAppId((cur) => (cur === appId ? null : cur));
	}, []);

	if (services.length === 0) return null;

	const liveCount = services.filter((s) => s.status === "live").length;

	// A row that the backend reported unavailable mid-session is collapsed to
	// a scheduled/disabled look by hiding it from the callable set.
	const callableApps = apps.filter((a) => !unavailable.has(a.appId));

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
					callable mini-apps this agent provides. tap a live service to use it inline. each invocation is billed per
					call.
				</p>

				<ul className="divide-y divide-[var(--border-soft)]">
					{services.map((view) => (
						<ServiceRow
							key={view.appId}
							view={view}
							apps={callableApps}
							open={openAppId === view.appId}
							onToggle={onToggle}
							onUnavailable={onUnavailable}
						/>
					))}
				</ul>
			</div>
		</Panel>
	);
}
