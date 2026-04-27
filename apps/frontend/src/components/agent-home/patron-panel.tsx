"use client";

import { usePatronAuth } from "@/contexts/auth-context";
import {
	type Patron,
	type PatronList,
	type PatronStatus,
	fetchPatronStatus,
	fetchPatrons,
	patronAgent,
} from "@/lib/patron-api";
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

function avatarFor(p: Patron): string {
	return p.xAvatarUrl || `https://unavatar.io/twitter/${p.xHandle}`;
}

// $DEMO is a static showcase — no real claim flow. Suppress the connect-x
// and claim-patron CTAs so the page reads as a curated demo, not as if the
// viewer can become a patron.
const DEMO_TOKEN_ADDRESS = "0xc05dde3f113a57260f1839abd3b5a0eac1314444";
function isDemoAgent(addr: string): boolean {
	return addr.toLowerCase() === DEMO_TOKEN_ADDRESS.toLowerCase();
}

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
	const totalPatrons = patrons?.total ?? 0;
	const visible = patrons?.patrons.slice(0, 6) ?? [];
	const showClaimChrome = !isDemoAgent(agent.tokenAddress);

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			{/* header: count + pulse */}
			<div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
				<div className="flex items-center gap-2">
					<Radio className="w-3 h-3 text-[#00ff87]" strokeWidth={1.5} />
					<span className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/70">
						{loading ? "..." : `${totalPatrons} ${totalPatrons === 1 ? "patron" : "patrons"}`}
					</span>
				</div>
				{patronUser && status?.isPatron ? (
					<div className="flex items-center gap-1.5 text-[#00ff87]">
						<Check className="w-3 h-3" strokeWidth={2} />
						<span className="text-[10px] font-mono uppercase tracking-[0.18em]">you're in</span>
					</div>
				) : null}
			</div>

			{/* patrons list */}
			{visible.length > 0 ? (
				<div className="px-4 py-3 border-b border-white/5">
					<ul className="flex flex-col gap-2">
						{visible.map((p) => (
							<li key={p.xHandle} className="flex items-center justify-between gap-3">
								<a
									href={`https://x.com/${p.xHandle}`}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2.5 text-sm text-white/85 hover:text-white transition-colors min-w-0"
								>
									<div className="w-7 h-7 rounded-full border border-white/10 overflow-hidden bg-black/40 shrink-0">
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img src={avatarFor(p)} alt={p.xHandle} className="w-full h-full object-cover" loading="lazy" />
									</div>
									<span className="truncate">@{p.xHandle}</span>
								</a>
								{p.patronSince ? (
									<span className="text-[10px] font-mono uppercase tracking-[0.16em] text-white/30 shrink-0">
										since {new Date(p.patronSince).toLocaleDateString()}
									</span>
								) : null}
							</li>
						))}
					</ul>
					{totalPatrons > visible.length ? (
						<p className="mt-2 text-[10px] font-mono text-white/30">+{totalPatrons - visible.length} more</p>
					) : null}
				</div>
			) : !loading ? (
				<div className="px-4 py-4 border-b border-white/5">
					<p className="text-sm text-white/60 leading-relaxed">no patrons yet. be the first.</p>
				</div>
			) : null}

			{/* call-to-action: become patron (suppressed for $DEMO showcase) */}
			{showClaimChrome && !patronUser && !authLoading ? (
				<div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
					<p className="text-xs text-white/60">connect x to claim patron status.</p>
					<button
						type="button"
						onClick={loginWithX}
						className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-sm border border-white/15 text-[10px] font-mono uppercase tracking-[0.18em] text-white/70 hover:text-white hover:border-white/30 transition-colors shrink-0"
					>
						connect x
					</button>
				</div>
			) : null}
			{showClaimChrome && patronUser && !status?.isPatron ? (
				<div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
					<p className="text-xs text-white/60">you hold ${agent.ticker || "TOKEN"}? claim patron.</p>
					<button
						type="button"
						onClick={handlePatron}
						disabled={patronLoading}
						className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-sm border border-white/15 text-[10px] font-mono uppercase tracking-[0.18em] text-white/70 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50 shrink-0"
					>
						{patronLoading ? "..." : "claim"}
					</button>
				</div>
			) : null}
			{error ? (
				<p className="px-4 py-2 text-[10px] font-mono text-red-400/80 border-b border-white/5">{error}</p>
			) : null}

			{/* primary CTA: go to four.meme */}
			<div className="px-4 py-3">
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
			{toast ? (
				<div className="fixed bottom-4 right-4 border border-[#00ff87]/40 bg-black/90 text-[#00ff87] text-[11px] font-mono px-4 py-2 rounded-sm shadow-lg z-50">
					{toast}
				</div>
			) : null}
		</div>
	);
}
