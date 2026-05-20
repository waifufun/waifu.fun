import { Button } from "@/components/ui/button";
import { type PatronAgent, formatUsd } from "@/lib/api/patron";
import Image from "next/image";
import Link from "next/link";
import StatusBadge from "./status-badge";

function formatRelative(iso: string | null | undefined): string {
	if (!iso) return "never";
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return "never";
	const diffMs = Date.now() - t;
	const sec = Math.floor(diffMs / 1000);
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	return `${day}d ago`;
}

export default function AgentCard({ agent }: { agent: PatronAgent }) {
	return (
		<article className="flex flex-col gap-4 p-5 rounded-sm border border-stroke-strong bg-[#0C0C0C] hover:border-stroke-intense transition-colors">
			<div className="flex items-start gap-3">
				<div className="w-12 h-12 rounded-sm overflow-hidden bg-[#141414] shrink-0 border border-stroke">
					{agent.avatar ? (
						<Image
							src={agent.avatar}
							alt={`${agent.name} avatar`}
							width={48}
							height={48}
							className="object-cover w-full h-full"
							unoptimized
						/>
					) : (
						<div className="w-full h-full flex items-center justify-center text-neutral-500 text-lg">
							{agent.ticker?.[0] ?? "?"}
						</div>
					)}
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center justify-between gap-2">
						<h3 className="text-white font-medium truncate">{agent.name}</h3>
						<StatusBadge status={agent.status} />
					</div>
					<div className="flex items-center gap-2 mt-0.5 min-w-0">
						<p className="text-xs text-neutral-400 font-mono truncate">${agent.ticker}</p>
						{agent.xHandle ? (
							<span
								className="inline-flex items-center gap-1 text-[10px] font-mono text-neutral-400 border border-stroke-strong rounded px-1.5 py-0.5 truncate"
								title={`X handle @${agent.xHandle.replace(/^@/, "")}`}
							>
								<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5">
									<path d="M18.244 2H21.5l-7.42 8.482L23 22h-6.828l-5.35-6.99L4.6 22H1.34l7.94-9.075L1 2h6.99l4.84 6.398L18.244 2Zm-2.395 18h1.88L7.25 4H5.24l10.61 16Z" />
								</svg>
								<span className="truncate">@{agent.xHandle.replace(/^@/, "")}</span>
							</span>
						) : null}
					</div>
				</div>
			</div>

			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm tabular-nums">
				<div>
					<dt className="text-[10px] uppercase text-neutral-500 tracking-[0.2em] font-mono">treasury</dt>
					<dd className="text-white font-medium mt-1">{formatUsd(agent.treasuryUsd)}</dd>
				</div>
				<div>
					<dt className="text-[10px] uppercase text-neutral-500 tracking-[0.2em] font-mono">daily burn</dt>
					<dd className="text-white font-medium mt-1">{formatUsd(agent.dailyBurnUsd)}</dd>
				</div>
				<div>
					<dt className="text-[10px] uppercase text-neutral-500 tracking-[0.2em] font-mono">runway</dt>
					<dd className="text-white font-medium mt-1">
						{Number.isFinite(agent.runwayDays) ? `${Math.round(agent.runwayDays)}d` : "-"}
					</dd>
				</div>
				<div>
					<dt className="text-[10px] uppercase text-neutral-500 tracking-[0.2em] font-mono">last action</dt>
					<dd className="text-neutral-300 mt-1">{formatRelative(agent.lastActionAt)}</dd>
				</div>
			</dl>

			<Link href={`/patron/${agent.id}`} className="mt-auto">
				<Button variant="outline" className="w-full h-9 text-[11px] font-mono uppercase tracking-[0.2em]">
					manage
				</Button>
			</Link>
		</article>
	);
}
