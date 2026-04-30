"use client";

import { InfoIcon } from "../launchpad-icons";

export default function FourMemeRegularConfig() {
	return (
		<div className="flex flex-col gap-6">
			<section>
				<header className="mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">fee summary</h2>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
						four.meme regular has no creator-side configuration. the curve is fixed.
					</p>
				</header>

				<div className="border border-white/8 bg-white/[0.012] divide-y divide-white/5">
					<div className="grid grid-cols-[140px_1fr] py-4 px-4 gap-3 items-center">
						<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">curve phase</dt>
						<dd className="text-sm font-mono text-white tabular-nums">1% trade fee</dd>
					</div>
					<div className="grid grid-cols-[140px_1fr] py-4 px-4 gap-3 items-center">
						<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">post-graduation</dt>
						<dd className="text-sm font-mono text-white tabular-nums">0% trade fee</dd>
					</div>
					<div className="grid grid-cols-[140px_1fr] py-4 px-4 gap-3 items-center">
						<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">platform cut</dt>
						<dd className="text-sm font-mono text-neutral-300 tabular-nums">covered by curve fee</dd>
					</div>
				</div>
			</section>

			<section className="border border-white/8 bg-white/[0.012] p-4 flex gap-3">
				<InfoIcon className="h-4 w-4 text-neutral-500 shrink-0 mt-0.5" />
				<p className="text-xs text-neutral-400 leading-relaxed">
					regular four.meme is the simplest path. no ongoing tax, no holder routing, no agent treasury fed from trades.
					pick this if you want a vanilla curve and plan to fund the agent another way.
				</p>
			</section>
		</div>
	);
}
