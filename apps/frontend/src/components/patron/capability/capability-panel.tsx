/**
 * Generic, schema-driven capability panel.
 *
 * Renders ONE `CapabilityDescriptor` as a card:
 *   - header: name, category badge, maturity + per-agent status pills
 *   - summary line
 *   - requirements (only the unmet ones surfaced, with hints)
 *   - data views (metric-grid / positions-table / line-chart / income-card),
 *     each live-polled from its own endpoint (static-export safe)
 *   - action forms (schema-driven, consent-gated, NO execution wired yet)
 *
 * The whole point: a NEW capability needs ZERO new frontend code. `hyperliquid-
 * perps` renders its real positions/pnl/income through here; `polymarket` and
 * `tax-arb-vault` render as locked roadmap cards automatically.
 *
 * Wave T grammar: dark editorial, mono numbers, #00ff87 accent, lowercase copy,
 * no em-dashes.
 */

"use client";

import { Hairline, Label, Panel, Pulse, StatPill } from "@/components/agent-home/wave-t/_primitives";
import type { CapabilityDescriptor, CapabilityMaturity, CapabilityStatus } from "@/lib/api/capabilities";
import { cn } from "@/lib/utils";

import { CapabilityActionForm } from "./capability-action-form";
import { CapabilityDataView } from "./capability-widgets";

function maturityTone(m: CapabilityMaturity): "accent" | "neutral" | "positive" {
	if (m === "live") return "positive";
	if (m === "experimental") return "accent";
	return "neutral";
}

function statusLabel(s: CapabilityStatus): string {
	switch (s) {
		case "enabled":
			return "enabled";
		case "available":
			return "available";
		default:
			return "locked";
	}
}

function statusTone(s: CapabilityStatus): "positive" | "neutral" | "accent" {
	if (s === "enabled") return "positive";
	if (s === "available") return "accent";
	return "neutral";
}

export function CapabilityPanel({ capability }: { capability: CapabilityDescriptor }) {
	const isLocked = capability.status === "locked" || capability.maturity === "planned";
	// only surface requirements that are required AND unmet (no noise).
	const unmet = capability.requirements.filter((r) => r.required && !r.satisfied);
	// read-mode actions are covered by data views; only render write actions as forms.
	const writeActions = capability.actions.filter((a) => a.mode !== "read");

	return (
		<Panel className={cn(isLocked && "opacity-[0.82]")}>
			<Label
				right={
					<div className="flex items-center gap-1.5">
						<StatPill tone={maturityTone(capability.maturity)}>{capability.maturity}</StatPill>
						<StatPill tone={statusTone(capability.status)}>
							{capability.status === "enabled" ? <Pulse tone="positive" /> : null}
							{statusLabel(capability.status)}
						</StatPill>
					</div>
				}
			>
				<span className="text-[var(--text-primary)]">{capability.name}</span>
				<span className="text-[var(--text-tertiary)]">/ {capability.category}</span>
			</Label>

			<p className="max-w-[68ch] text-[12px] leading-relaxed text-[var(--text-secondary)]">{capability.summary}</p>

			{unmet.length > 0 ? (
				<div className="mt-3 rounded-sm border border-[var(--border-soft)] bg-white/[0.015] p-3">
					<p className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">needs setup</p>
					<ul className="mt-2 space-y-1.5">
						{unmet.map((r) => (
							<li key={r.id} className="flex items-start gap-2 text-[11px] text-[var(--text-secondary)]">
								<span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-[var(--negative)]" />
								<span>
									<span className="text-[var(--text-primary)]">{r.label}</span>
									{r.hint ? <span className="text-[var(--text-tertiary)]"> — {r.hint}</span> : null}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}

			{capability.data.length > 0 ? (
				<>
					<Hairline className="my-4" />
					<div className="grid grid-cols-1 gap-5 md:grid-cols-2">
						{capability.data.map((provider) => (
							<CapabilityDataView key={`${capability.slug}-${provider.view}`} provider={provider} />
						))}
					</div>
				</>
			) : null}

			{writeActions.length > 0 ? (
				<>
					<Hairline className="my-4" />
					<p className="mb-3 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">actions</p>
					<div className="grid grid-cols-1 gap-3">
						{writeActions.map((action) => (
							<CapabilityActionForm key={`${capability.slug}-${action.slug}`} action={action} locked={isLocked} />
						))}
					</div>
				</>
			) : null}

			{capability.data.length === 0 && writeActions.length === 0 ? (
				<p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					planned — no live surface yet
				</p>
			) : null}
		</Panel>
	);
}
