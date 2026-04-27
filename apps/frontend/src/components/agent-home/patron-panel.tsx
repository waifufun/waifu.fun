"use client";

import { usePatronAuth } from "@/contexts/auth-context";
import { type PatronList, type PatronStatus, fetchPatronStatus, fetchPatrons, patronAgent } from "@/lib/patron-api";
import { ArrowUpRight, Check, Radio } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type AgentLite = {
	tokenAddress: string;
	name: string;
	ticker: string;
};

type Props = {
	agent: AgentLite;
};

export default function PatronPanel({ agent }: Props) {
	const { patronUser, isLoading: authLoading, loginWithX } = usePatronAuth();
	const [patrons, setPatrons] = useState<PatronList | null>(null);
	const [status, setStatus] = useState<PatronStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [patronLoading, setPatronLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [toast, setToast] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		setLoading(true);
		const [p, s] = await Promise.all([
			fetchPatrons(agent.tokenAddress),
			patronUser ? fetchPatronStatus(agent.tokenAddress) : Promise.resolve(null),
		]);
		setPatrons(p);
		setStatus(s);
		setLoading(false);
	}, [agent.tokenAddress, patronUser]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const handlePatron = useCallback(async () => {
		setPatronLoading(true);
		setError(null);
		const result = await patronAgent(agent.tokenAddress);
		if (result.ok) {
			setToast(`you're now a patron of ${agent.name}`);
			setTimeout(() => setToast(null), 3000);
			refresh();
		} else {
			setError(result.error || "failed");
		}
		setPatronLoading(false);
	}, [agent.tokenAddress, agent.name, refresh]);

	const fourMemeUrl = `https://four.meme/token/${agent.tokenAddress}`;

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			{/* header: count + pulse */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
				<div className="flex items-center gap-2">
					<Radio className="w-3 h-3 text-[#00ff87]" strokeWidth={1.5} />
					<span className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/70">
						{loading
							? "..."
							: patrons
								? `${patrons.total} ${patrons.total === 1 ? "patron" : "patrons"}`
								: "no patrons yet"}
					</span>
				</div>
			</div>

			{/* avatar rail */}
			{patrons && patrons.patrons.length > 0 && (
				<div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
					{patrons.patrons.slice(0, 5).map((p) => (
						<div
							key={p.xHandle}
							className="w-6 h-6 rounded-full border border-white/10 overflow-hidden bg-black/40 shrink-0"
							title={`@${p.xHandle}`}
						>
							{p.xAvatarUrl ? (
								// eslint-disable-next-line @next/next/no-img-element
								<img src={p.xAvatarUrl} alt={p.xHandle} className="w-full h-full object-cover" />
							) : (
								<div className="w-full h-full flex items-center justify-center text-[9px] text-white/40">
									{p.xHandle[0]?.toUpperCase()}
								</div>
							)}
						</div>
					))}
					{patrons.total > 5 && <span className="text-[10px] font-mono text-white/40">+{patrons.total - 5}</span>}
				</div>
			)}

			{/* state block */}
			<div className="px-4 py-4">
				{!patronUser && !authLoading && (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-white/70 leading-relaxed">connect x to patron this agent.</p>
						<button
							type="button"
							onClick={loginWithX}
							className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-sm border border-white/15 text-[11px] font-mono uppercase tracking-[0.18em] text-white/70 hover:text-white hover:border-white/30 transition-colors"
						>
							connect x
						</button>
						<p className="text-[10px] font-mono text-white/30 leading-relaxed">patron tracking requires an x handle.</p>
					</div>
				)}

				{patronUser && status?.isPatron && (
					<div className="flex flex-col gap-3">
						<div className="flex items-center gap-2 text-[#00ff87]">
							<Check className="w-3 h-3" strokeWidth={2} />
							<span className="text-[11px] font-mono uppercase tracking-[0.18em]">you're a patron</span>
						</div>
						<p className="text-[11px] font-mono text-white/40">
							@{patronUser.xHandle}
							{status.patronSince && <span> · since {new Date(status.patronSince).toLocaleDateString()}</span>}
						</p>
					</div>
				)}

				{patronUser && !status?.isPatron && (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-white/70 leading-relaxed">
							buy ${agent.ticker || agent.name} on four.meme to patron this agent.
						</p>
						<button
							type="button"
							onClick={handlePatron}
							disabled={patronLoading}
							className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-sm border border-white/15 text-[11px] font-mono uppercase tracking-[0.18em] text-white/60 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50"
						>
							{patronLoading ? "..." : "i'm a patron"}
						</button>
						{error && <p className="text-[10px] font-mono text-red-400/80">{error}</p>}
					</div>
				)}
			</div>

			{/* primary CTA: go to four.meme */}
			<div className="px-4 py-3 border-t border-white/5">
				<a
					href={fourMemeUrl}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center justify-center gap-2 w-full h-10 px-4 rounded-sm bg-[#00ff87] text-black text-[11px] font-mono uppercase tracking-[0.18em] hover:bg-[#00ff87]/90 transition-colors"
				>
					buy ${agent.ticker || "TOKEN"} on four.meme
					<ArrowUpRight className="w-3 h-3" />
				</a>
			</div>

			{/* disclaimer */}
			<div className="px-4 py-3 border-t border-white/5">
				<p className="text-[10px] font-mono text-white/30 leading-relaxed">
					not trading advice. buy at your own risk. agent survival depends on sustained activity.
				</p>
			</div>

			{/* toast */}
			{toast && (
				<div className="fixed bottom-4 right-4 border border-[#00ff87]/40 bg-black/90 text-[#00ff87] text-[11px] font-mono px-4 py-2 rounded-sm shadow-lg z-50">
					{toast}
				</div>
			)}
		</div>
	);
}
