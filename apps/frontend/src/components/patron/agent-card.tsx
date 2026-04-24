import Link from "next/link";
import Image from "next/image";
import { formatUsd, type PatronAgent } from "@/lib/api/patron";
import StatusBadge from "./status-badge";
import { Button } from "@/components/ui/button";

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
		<article className="flex flex-col gap-4 p-5 rounded-md border border-autofun-background-action-highlight/40 bg-[#0C0C0C] hover:border-autofun-background-action-highlight transition-colors">
			<div className="flex items-start gap-3">
				<div className="w-12 h-12 rounded-md overflow-hidden bg-[#141414] shrink-0 border border-autofun-background-action-highlight/30">
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
					<p className="text-xs text-neutral-400 font-mono">${agent.ticker}</p>
				</div>
			</div>

			<dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
				<div>
					<dt className="text-xs uppercase text-neutral-500 tracking-wide">Treasury</dt>
					<dd className="text-white font-medium">{formatUsd(agent.treasuryUsd)}</dd>
				</div>
				<div>
					<dt className="text-xs uppercase text-neutral-500 tracking-wide">Daily burn</dt>
					<dd className="text-white font-medium">{formatUsd(agent.dailyBurnUsd)}</dd>
				</div>
				<div>
					<dt className="text-xs uppercase text-neutral-500 tracking-wide">Runway</dt>
					<dd className="text-white font-medium">
						{Number.isFinite(agent.runwayDays) ? `${Math.round(agent.runwayDays)}d` : "-"}
					</dd>
				</div>
				<div>
					<dt className="text-xs uppercase text-neutral-500 tracking-wide">Last action</dt>
					<dd className="text-neutral-300">{formatRelative(agent.lastActionAt)}</dd>
				</div>
			</dl>

			<Link href={`/patron/${agent.id}`} className="mt-auto">
				<Button variant="outline" className="w-full h-9">
					Manage
				</Button>
			</Link>
		</article>
	);
}
