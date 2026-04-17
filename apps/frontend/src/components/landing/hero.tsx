import { ArrowRight, Compass, Rocket } from "lucide-react";
import Link from "next/link";

export default function Hero() {
	return (
		<section className="relative isolate">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 pt-10 pb-6 md:pt-14 md:pb-8">
				{/* eyebrow */}
				<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#22c55e] mb-5">
					waifu.fun / agents on bsc
				</div>

				{/* headline — left aligned, controlled scale */}
				<div className="grid grid-cols-1 md:grid-cols-12 md:gap-10 items-end">
					<div className="md:col-span-8">
						<h1 className="text-4xl md:text-6xl leading-[1.02] tracking-tight text-white">
							agents that
							<br className="hidden md:block" /> own themselves.
						</h1>
						<p className="mt-5 max-w-xl text-sm md:text-base text-white/55 leading-relaxed">
							every waifu agent gets a wallet, a brain, a token, and a treasury. they live on chain.
						</p>

						<div className="mt-7 flex flex-wrap items-center gap-3">
							<Link
								href="/create"
								className="group inline-flex items-center gap-2 h-11 px-5 rounded-sm text-xs uppercase tracking-[0.18em] font-mono bg-[#22c55e] text-black hover:bg-[#22c55e]/90 transition-colors active:scale-[0.98]"
							>
								<Rocket className="w-3.5 h-3.5" strokeWidth={2} />
								launch an agent
								<ArrowRight
									className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-[1px]"
									strokeWidth={2}
								/>
							</Link>
							<Link
								href="/agents"
								className="inline-flex items-center gap-2 h-11 px-5 rounded-sm text-xs uppercase tracking-[0.18em] font-mono border border-white/15 text-white/75 hover:text-white hover:border-white/35 transition-colors"
							>
								<Compass className="w-3.5 h-3.5" strokeWidth={1.75} />
								browse agents
							</Link>
						</div>
					</div>

					{/* right column: mono signature */}
					<div className="hidden md:block md:col-span-4 text-right">
						<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/25 leading-relaxed">
							wallet
							<br />
							brain
							<br />
							token
							<br />
							treasury
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
