"use client";

import { useAccount } from "wagmi";
import { cn } from "@/lib/utils";
import { ShieldIcon } from "./wizard-icons";
import { useWizard } from "./wizard-state";

const ADAPTER_PREVIEWS = [
	{
		slug: "pancake" as const,
		name: "PancakeSwap",
		role: "DEX",
		defaults: "0.10 BNB / tx, 1.00 BNB / day",
		blurb: "Swap, supply liquidity, harvest. Capped per-tx and per-day.",
	},
	{
		slug: "venus" as const,
		name: "Venus",
		role: "Lending",
		defaults: "0.10 BNB / tx, 0.50 BNB / day",
		blurb: "Supply or borrow. Health-factor floor enforced before every action.",
	},
];

function shortAddr(addr?: string | null): string {
	if (!addr) return "0x... (connect wallet)";
	if (addr.length < 12) return addr;
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function StepSafe() {
	const { state } = useWizard();
	const { address } = useAccount();

	const agentBps = state.safe.taxAgentBps;
	const patronBps = state.safe.taxPatronBps;
	const agentPct = agentBps / 100;
	const patronPct = patronBps / 100;

	return (
		<div className="flex flex-col gap-10">
			{/* Safe preview */}
			<section>
				<header className="flex items-baseline justify-between mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.18em] text-neutral-400">Safe (1-of-2)</h2>
					<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-600">
						deploys at provision
					</span>
				</header>

				<div className="border border-white/8 bg-white/[0.012] p-5">
					<div className="flex items-start gap-4">
						<span
							className="hidden sm:inline-flex h-9 w-9 items-center justify-center border border-white/10 text-neutral-300 shrink-0"
							aria-hidden
						>
							<ShieldIcon className="h-4 w-4" />
						</span>
						<div className="flex-1 min-w-0">
							<p className="text-sm text-neutral-300 leading-relaxed">
								Two signers. Either can submit. The agent moves fast on routine adapter calls; you stay in control of
								anything that touches the rules.
							</p>
						</div>
					</div>

					<dl className="mt-5 divide-y divide-white/5 border-t border-white/5">
						<div className="grid grid-cols-[140px_1fr] py-3 gap-3 items-center">
							<dt className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">Patron wallet</dt>
							<dd className="text-sm font-mono text-neutral-200 tabular-nums">{shortAddr(address)}</dd>
						</div>
						<div className="grid grid-cols-[140px_1fr] py-3 gap-3 items-center">
							<dt className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">Agent steward</dt>
							<dd className="flex items-center gap-2">
								<span className="text-sm font-mono text-neutral-500">[generated at provision]</span>
								<span className="inline-flex items-center text-[9px] font-mono uppercase tracking-[0.2em] text-accent border border-accent/30 px-1.5 py-0.5">
									Steward key
								</span>
							</dd>
						</div>
						<div className="grid grid-cols-[140px_1fr] py-3 gap-3 items-center">
							<dt className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">Threshold</dt>
							<dd className="text-sm font-mono text-neutral-200">1 of 2</dd>
						</div>
					</dl>
				</div>
			</section>

			{/* Tax split */}
			<section>
				<header className="flex items-baseline justify-between mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.18em] text-neutral-400">Tax routing</h2>
					<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-600">v1 default</span>
				</header>

				<div className="border border-white/8 bg-white/[0.012] p-5">
					<div className="flex items-end gap-2 mb-3">
						<div className="flex-1 min-w-0">
							<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">Agent treasury</p>
							<p className="mt-1 text-2xl font-medium text-white tabular-nums">{agentPct}%</p>
						</div>
						<div className="text-right">
							<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">Patron</p>
							<p className="mt-1 text-2xl font-medium text-neutral-300 tabular-nums">{patronPct}%</p>
						</div>
					</div>

					<div
						className="relative h-2 w-full bg-white/5 overflow-hidden"
						role="img"
						aria-label={`Tax split: ${agentPct}% to agent, ${patronPct}% to patron`}
					>
						<div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${agentPct}%` }} />
						<div className="absolute inset-y-0 bg-white/30" style={{ left: `${agentPct}%`, width: `${patronPct}%` }} />
					</div>

					<p className="mt-3 text-xs text-neutral-500 leading-relaxed">
						Locked to 80/20 for v1. Tax flows on-chain through a CREATE2 splitter. Editable later when v2 ships.
					</p>
				</div>
			</section>

			{/* Adapters */}
			<section>
				<header className="flex items-baseline justify-between mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.18em] text-neutral-400">Adapters</h2>
					<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-600">
						enabled at provision
					</span>
				</header>

				<ul className="border border-white/8 bg-white/[0.012] divide-y divide-white/5">
					{ADAPTER_PREVIEWS.map((a) => {
						const enabled = state.safe.adapters[a.slug];
						return (
							<li key={a.slug} className="flex items-start gap-4 p-5">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<h3 className="text-sm text-white tracking-tight">{a.name}</h3>
										<span className="text-[10px] font-mono uppercase tracking-[0.16em] text-neutral-500 border border-white/10 px-1.5 py-0.5">
											{a.role}
										</span>
									</div>
									<p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">{a.blurb}</p>
									<p className="mt-2 text-[10px] font-mono uppercase tracking-[0.16em] text-neutral-500">
										default cap: {a.defaults}
									</p>
								</div>
								<span
									className={cn(
										"shrink-0 text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-1 border",
										enabled ? "text-accent border-accent/30" : "text-neutral-500 border-white/10",
									)}
								>
									{enabled ? "On" : "Off"}
								</span>
							</li>
						);
					})}
				</ul>

				<p className="mt-3 text-xs text-neutral-500 leading-relaxed max-w-[58ch]">
					Customize policies after provisioning from <span className="text-neutral-300">/patron</span>. Per-tx and daily
					caps, allowlists, target tokens, and max slippage all live there.
				</p>
			</section>
		</div>
	);
}
