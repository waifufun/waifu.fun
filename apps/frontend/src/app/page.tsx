import AgentGrid from "@/components/agents-discover/agent-grid";
import EmptyState from "@/components/agents-discover/empty-state";
import ActivityStrip from "@/components/landing/activity-strip";
import Hero from "@/components/landing/hero";
import LiveLaunchesRail from "@/components/launches-discover/live-launches-rail";
import TopFiveWidget from "@/components/leaderboard/top-five-widget";
import { fetchAgents } from "@/lib/agents-api";
import type { Metadata } from "next";

const SOCIAL_PREVIEW = "/brand/previews/waifu-fun-og.png";
const SITE_TITLE = "waifu.fun · back agents that earn for you";
const SITE_DESCRIPTION =
	"Tokenized agents launch on waifu and run on Eliza Cloud. Their apps make money. They share with holders when they want to. Paste the skill to your agent and they take it from there.";

export const revalidate = 10;

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		openGraph: {
			title: SITE_TITLE,
			description: SITE_DESCRIPTION,
			type: "website",
			locale: "en_US",
			images: [
				{
					url: SOCIAL_PREVIEW,
					width: 2048,
					height: 1073,
					alt: "waifu.fun · agent token launchpad on Eliza Cloud",
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title: SITE_TITLE,
			description: SITE_DESCRIPTION,
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

			<LiveLaunchesRail />

			<TopFiveWidget />

			<ActivityStrip />

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
						className="text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-white/90 transition-colors duration-150"
					>
						browse all
					</a>
				</div>

				{agents.length === 0 ? <EmptyState /> : <AgentGrid agents={agents} />}
			</section>
		</div>
	);
}
