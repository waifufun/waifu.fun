/**
 * Agent dropdown for the top bar. Today there is only sol; the
 * popover is built future-ready (list rows + status dot) so when
 * other agents launch we just append to AGENTS.
 */

"use client";

import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Agent = {
	id: string;
	name: string;
	handle: string;
	avatar: string;
	online: boolean;
};

const SOL_AGENT: Agent = {
	id: "sol",
	name: "sol",
	handle: "$WAIFU",
	avatar: "/brand/agents/waifu/portrait-amber.webp",
	online: true,
};
const AGENTS: Agent[] = [SOL_AGENT];

type AgentPickerProps = {
	activeId?: string;
	onSelect?: (id: string) => void;
};

export function AgentPicker({ activeId = "sol", onSelect }: AgentPickerProps) {
	const [open, setOpen] = useState(false);
	const active = AGENTS.find((a) => a.id === activeId) ?? SOL_AGENT;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<button
					aria-label="Switch agent"
					className={cn(
						"inline-flex h-8 items-center gap-2 rounded-md border bg-[var(--bg-panel)] pr-2 pl-1.5 transition-colors",
						"border-[var(--border-mid)] hover:border-[var(--accent)]/40",
					)}
					type="button"
				>
					<span className="relative inline-flex h-5 w-5 overflow-hidden rounded-full border border-[var(--border-mid)]">
						<img alt={active.name} className="h-full w-full object-cover" height={20} src={active.avatar} width={20} />
					</span>
					<span className="flex items-baseline gap-1.5">
						<span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.18em]">Agent</span>
						<span className="font-mono text-[12px] text-[var(--text-primary)] lowercase">{active.name}</span>
					</span>
					<ChevronDownIcon
						className={cn(
							"h-3.5 w-3.5 text-[var(--text-tertiary)] transition-transform",
							open ? "rotate-180" : "rotate-0",
						)}
						strokeWidth={1.8}
					/>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-60 rounded-md border-[var(--border-mid)] bg-[var(--bg-panel-hi)] p-1"
				sideOffset={6}
			>
				<div className="px-2 pt-1 pb-2">
					<div className="font-mono text-[9px] text-[var(--text-tertiary)] uppercase tracking-[0.22em]">
						Active agent
					</div>
				</div>
				<ul className="flex flex-col gap-0.5">
					{AGENTS.map((agent) => {
						const isActive = agent.id === active.id;
						return (
							<li key={agent.id}>
								<button
									className={cn(
										"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
										isActive ? "bg-white/[0.04]" : "hover:bg-white/[0.03]",
									)}
									onClick={() => {
										onSelect?.(agent.id);
										setOpen(false);
									}}
									type="button"
								>
									<span className="relative inline-flex h-6 w-6 overflow-hidden rounded-full border border-[var(--border-mid)]">
										<img
											alt={agent.name}
											className="h-full w-full object-cover"
											height={24}
											src={agent.avatar}
											width={24}
										/>
										{agent.online ? (
											<span
												aria-hidden
												className="absolute right-0 bottom-0 h-1.5 w-1.5 rounded-full border border-[var(--bg-panel-hi)]"
												style={{ backgroundColor: "var(--positive)" }}
											/>
										) : null}
									</span>
									<span className="flex min-w-0 flex-1 flex-col">
										<span className="font-mono text-[12px] text-[var(--text-primary)] lowercase">{agent.name}</span>
										<span className="font-mono text-[10px] text-[var(--text-tertiary)] uppercase tracking-[0.18em]">
											{agent.handle}
										</span>
									</span>
									{isActive ? <CheckIcon className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2} /> : null}
								</button>
							</li>
						);
					})}
					<li className="mt-1 border-[var(--border-soft)] border-t px-2 pt-2 pb-1">
						<span className="font-mono text-[9px] text-[var(--text-tertiary)] uppercase tracking-[0.22em]">
							More agents soon
						</span>
					</li>
				</ul>
			</PopoverContent>
		</Popover>
	);
}
