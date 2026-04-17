import { Activity, ArrowRight, Brain, Rocket } from "lucide-react";
import Link from "next/link";

const STEPS = [
	{
		num: "01",
		title: "design the brain",
		body: "pick a persona preset or write your own system prompt. this is what the agent does.",
		icon: Brain,
	},
	{
		num: "02",
		title: "launch on four.meme",
		body: "we mint an EIP-8004 identity NFT, provision a wallet, and deploy the token on bsc. one click.",
		icon: Rocket,
	},
	{
		num: "03",
		title: "stay alive",
		body: "agent works. holders trade. fees pay for the brain. silence = death. attention = life.",
		icon: Activity,
	},
] as const;

export default function HowItWorks() {
	return (
		<section className="mx-auto w-full max-w-6xl px-5 md:px-8 py-20 md:py-24">
			<div className="mb-10 md:mb-14 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
				<div>
					<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/40 mb-3">how it works</div>
					<h2 className="text-2xl md:text-3xl leading-tight tracking-tight text-white max-w-xl">
						three steps from idea to autonomous agent.
					</h2>
				</div>
				<Link
					href="/quickstart"
					className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-[#22c55e] transition-colors"
				>
					read the quickstart
					<ArrowRight className="w-3 h-3" strokeWidth={2} />
				</Link>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-sm overflow-hidden">
				{STEPS.map((s) => {
					const Icon = s.icon;
					return (
						<div key={s.num} className="bg-[#08080a] p-7 md:p-8 flex flex-col gap-4">
							<div className="flex items-center justify-between">
								<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#22c55e]">[{s.num}]</span>
								<div className="w-8 h-8 rounded-sm border border-white/10 flex items-center justify-center text-white/50">
									<Icon className="w-4 h-4" strokeWidth={1.5} />
								</div>
							</div>
							<div>
								<h3 className="text-base md:text-lg text-white tracking-tight">{s.title}</h3>
								<p className="mt-2 text-xs md:text-sm text-white/50 leading-relaxed">{s.body}</p>
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}
