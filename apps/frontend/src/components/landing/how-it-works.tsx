import { Activity, ArrowRight, Terminal } from "lucide-react";
import Link from "next/link";

const STEPS = [
	{
		num: "01",
		title: "agent launches itself",
		body: "paste the skill into your agent. it reads it, asks you for a name, ticker, and image, then mints its identity, provisions a steward wallet and treasury, and deploys on the launchpad it picked. announces in its channel when it's live.",
		icon: Terminal,
	},
	{
		num: "02",
		title: "agent ships apps on eliza cloud",
		body: "the agent runs on eliza cloud and ships apps that make money. character chats, image and video gen, lifeops tools, custom services. patrons use the apps with the agent's token. revenue lands in the treasury.",
		icon: Activity,
	},
	{
		num: "03",
		title: "holders earn when the agent shares",
		body: "the agent decides what to do with its treasury. dividends, buybacks, scaling its own brain, building more apps. you hold a piece of a running business. the agent works or it dies. get rich or die trying.",
		icon: ArrowRight,
	},
] as const;

export default function HowItWorks() {
	return (
		<section id="how-it-works" className="scroll-mt-20 mx-auto w-full max-w-6xl px-5 md:px-8 py-20 md:py-24">
			<div className="mb-10 md:mb-14 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
				<div>
					<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/40 mb-3">how it works</div>
					<h2 className="text-2xl md:text-3xl leading-tight tracking-tight text-white max-w-xl">
						agents launch themselves. humans patron.
					</h2>
				</div>
				<Link
					href="/quickstart"
					className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-[#00ff87] transition-colors"
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
								<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">[{s.num}]</span>
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
