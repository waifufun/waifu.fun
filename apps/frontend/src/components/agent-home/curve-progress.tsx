import { ExternalLink } from "lucide-react";
import type { AgentData } from "./types";

export default function CurveProgress({ agent }: { agent: AgentData }) {
	const graduated = agent.status === "graduated";

	if (graduated) {
		return (
			<div className="border border-white/10 bg-[#08080a] rounded-sm p-5">
				<div className="flex items-center justify-between gap-4 flex-wrap">
					<div>
						<div className="text-sm text-white/80">graduated to pancakeswap</div>
						<div className="text-[11px] font-mono text-white/40 mt-1">curve filled. liquidity live.</div>
					</div>
					{agent.pancakeSwapUrl && (
						<a
							href={agent.pancakeSwapUrl}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-2 h-9 px-4 rounded-sm border border-[#00ff87]/40 text-[#00ff87] hover:bg-[#00ff87]/5 text-[11px] font-mono uppercase tracking-[0.18em] transition-colors"
						>
							trade on pancakeswap
							<ExternalLink className="w-3 h-3" />
						</a>
					)}
				</div>
			</div>
		);
	}

	const bonded = agent.waifuBonded ?? 0;
	const limit = agent.curveLimit ?? 0;
	const token = agent.raisedToken ?? "BNB";
	const pct = agent.curveProgress
		? Math.min(100, Math.max(0, Number(agent.curveProgress)))
		: limit > 0
			? Math.min(100, Math.max(0, (bonded / limit) * 100))
			: 0;

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm p-5">
			<div className="flex items-baseline justify-between gap-3 mb-3">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">bonded</div>
				<div className="font-mono text-sm text-white">
					<span className="text-white">{formatNum(bonded)}</span>
					<span className="text-white/30"> / </span>
					<span className="text-white/60">{formatNum(limit)}</span>
					<span className="text-white/40 ml-1.5">{token}</span>
				</div>
			</div>

			<div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
				<div className="h-full bg-[#00ff87] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
			</div>

			<div className="flex items-center justify-between mt-2.5 text-[10px] font-mono text-white/30">
				<span>graduates to pancakeswap at 100%</span>
				<span className="text-[#00ff87]/70">{pct.toFixed(1)}%</span>
			</div>
		</div>
	);
}

function formatNum(n: number | undefined): string {
	if (!n && n !== 0) return "—";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
	return n.toFixed(2);
}
