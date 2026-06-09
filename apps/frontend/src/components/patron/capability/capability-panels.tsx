/**
 * Capability section for the Patron page.
 *
 * Fetches `GET /v2/agents/:id/capabilities` (#998) and renders one
 * `<CapabilityPanel>` per descriptor. This is the schema-driven payoff: the HL
 * capability renders its real live positions/pnl/income through the generic
 * panel, and planned capabilities (polymarket, tax-arb-vault) auto-render as
 * locked roadmap cards with ZERO bespoke code.
 *
 * Ordering: enabled first, then available, then locked — and within each, live
 * maturity before planned. So the agent's working powers sit up top and the
 * roadmap settles to the bottom.
 *
 * Lives alongside (not replacing) the existing bespoke HL/fund/policy panels for
 * now; ripping those out is a follow-up once Shadow signs off on this renderer.
 */

"use client";

import { Label, Panel, Pulse } from "@/components/agent-home/wave-t/_primitives";
import { errorText } from "@/lib/api/_fetcher";
import { type CapabilityDescriptor, useAgentCapabilities } from "@/lib/api/capabilities";

import { CapabilityPanel } from "./capability-panel";

const STATUS_ORDER: Record<CapabilityDescriptor["status"], number> = {
	enabled: 0,
	available: 1,
	locked: 2,
};

const MATURITY_ORDER: Record<CapabilityDescriptor["maturity"], number> = {
	live: 0,
	experimental: 1,
	planned: 2,
	deprecated: 3,
};

function sortCapabilities(caps: CapabilityDescriptor[]): CapabilityDescriptor[] {
	return [...caps].sort((a, b) => {
		const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
		if (s !== 0) return s;
		return MATURITY_ORDER[a.maturity] - MATURITY_ORDER[b.maturity];
	});
}

export function CapabilityPanels({ agentId }: { agentId: string }) {
	const { data, isLoading, error } = useAgentCapabilities(agentId);
	const caps = data?.capabilities ?? [];

	return (
		<section className="space-y-3">
			<div className="flex items-center justify-between">
				<h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--text-secondary)]">capabilities</h2>
				<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
					schema-driven
				</span>
			</div>

			{error ? (
				<Panel>
					<p className="text-[12px] text-[var(--negative)]">couldn't load capabilities. {errorText(error)}</p>
				</Panel>
			) : isLoading && caps.length === 0 ? (
				<Panel>
					<Label>
						<Pulse /> loading capabilities
					</Label>
					<p className="font-mono text-[11px] text-[var(--text-tertiary)]">resolving agent powers...</p>
				</Panel>
			) : caps.length === 0 ? (
				<Panel>
					<p className="font-mono text-[11px] text-[var(--text-tertiary)]">
						no capabilities registered for this agent.
					</p>
				</Panel>
			) : (
				<div className="space-y-4">
					{sortCapabilities(caps).map((cap) => (
						<CapabilityPanel key={cap.slug} capability={cap} />
					))}
				</div>
			)}
		</section>
	);
}
