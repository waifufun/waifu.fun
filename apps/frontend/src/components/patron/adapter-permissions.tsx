"use client";

import type { AgentAdapter, AgentDetail } from "@/lib/api/patron";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
	agent: AgentDetail | undefined;
	isLoading: boolean;
};

function AdapterRow({ adapter }: { adapter: AgentAdapter }) {
	const enabled = Boolean(adapter.enabled);
	return (
		<li className="flex items-start justify-between gap-3 py-3">
			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium text-white">{adapter.name}</div>
				{adapter.description ? (
					<p className="text-xs text-neutral-500 mt-0.5 break-words">{adapter.description}</p>
				) : null}
			</div>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						disabled
						aria-disabled="true"
						aria-label={`${adapter.name} is ${enabled ? "enabled" : "disabled"}. Read-only in v1.`}
						className={cn(
							"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors cursor-not-allowed",
							enabled ? "bg-[#00ff87]/40 border border-[#00ff87]/40" : "bg-neutral-800 border border-neutral-700",
						)}
					>
						<span
							className={cn(
								"inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
								enabled ? "translate-x-[18px]" : "translate-x-[2px]",
							)}
						/>
					</button>
				</TooltipTrigger>
				<TooltipContent side="left">Read-only in v1. Patron-side toggles ship in v2.</TooltipContent>
			</Tooltip>
		</li>
	);
}

export default function AdapterPermissions({ agent, isLoading }: Props) {
	const adapters = agent?.adapters ?? [];

	return (
		<section aria-label="Adapter permissions" className="p-5 rounded-sm border border-stroke-strong bg-[#0C0C0C]">
			<header className="flex items-center justify-between mb-4">
				<h2 className="text-sm font-medium text-white uppercase tracking-wide">Adapters</h2>
				<span className="text-xs text-neutral-500">Read-only</span>
			</header>

			{isLoading ? (
				<ul className="divide-y divide-stroke">
					{[0, 1, 2].map((i) => (
						<li key={i} className="py-3 flex items-center justify-between gap-3">
							<div className="flex-1 space-y-2">
								<div className="h-4 w-32 rounded bg-[#141414] animate-pulse" />
								<div className="h-3 w-48 rounded bg-[#141414] animate-pulse" />
							</div>
							<div className="h-5 w-9 rounded-full bg-[#141414] animate-pulse" />
						</li>
					))}
				</ul>
			) : adapters.length === 0 ? (
				<p className="text-sm text-neutral-500">No adapters configured.</p>
			) : (
				<ul className="divide-y divide-stroke">
					{adapters.map((adapter) => (
						<AdapterRow key={adapter.id} adapter={adapter} />
					))}
				</ul>
			)}
		</section>
	);
}
