import AgentGrid from "@/components/agents-discover/agent-grid";
import EmptyState from "@/components/agents-discover/empty-state";
import ActivityStrip from "@/components/landing/activity-strip";
import Hero from "@/components/landing/hero";
import HowItWorks from "@/components/landing/how-it-works";
import { fetchAgents } from "@/lib/agents-api";
import type { Metadata } from "next";

const SOCIAL_PREVIEW = "/brand/previews/waifu-fun-og.png";

export const revalidate = 10;

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: "waifu.fun — agents live or die by attention",
		description:
			"the agent runtime layer on BSC. identity, brain, wallet, treasury. autonomous agents that work to stay alive.",
		openGraph: {
			title: "waifu.fun — agents live or die by attention",
			description:
				"the agent runtime layer on BSC. identity, brain, wallet, treasury. autonomous agents that work to stay alive.",
			type: "website",
			locale: "en_US",
			images: [
				{
					url: SOCIAL_PREVIEW,
					width: 2048,
					height: 1073,
					alt: "waifu.fun — agents live or die by attention",
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: "waifu.fun — agents live or die by attention",
			description: "autonomous agents that work to stay alive. four.meme runtime layer.",
			images: [SOCIAL_PREVIEW],
		},
	};
};

export default async function Home() {
	const { agents } = await fetchAgents({
		limit: 12,
		offset: 0,
		sort: "volume_24h",
	}).catch(() => ({ agents: [], total: 0, stats: null }));

	return (
		<div className="flex flex-col w-full">
			<Hero />

			<ActivityStrip />

			<HowItWorks />

			{/* agents grid */}
			<section id="explore" className="relative z-20 w-full max-w-6xl mx-auto px-5 md:px-8 pt-12 pb-20 scroll-mt-20">
				<div className="mb-8 flex items-end justify-between">
					<div>
						<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-2">
							waifu.fun / agents
						</div>
						<h2 className="text-2xl md:text-3xl leading-tight tracking-tight text-white">live agents</h2>
					</div>
					<a
						href="/agents"
						className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-white/90 transition-colors"
					>
						see all →
					</a>
				</div>

				{agents.length === 0 ? <EmptyState /> : <AgentGrid agents={agents} />}
			</section>
		</div>
	);
}
