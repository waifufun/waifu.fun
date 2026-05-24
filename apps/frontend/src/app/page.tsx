import AgentGrid from "@/components/agents-discover/agent-grid";
import EmptyState from "@/components/agents-discover/empty-state";
import ActivityStrip from "@/components/landing/activity-strip";
import Hero from "@/components/landing/hero";
import LiveLaunchesRail from "@/components/launches-discover/live-launches-rail";
import { fetchAgents } from "@/lib/agents-api";
import type { Metadata } from "next";
import LandingAgentsSection from "./landing-agents-section";

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

			<ActivityStrip />

			<LandingAgentsSection>
				{agents.length === 0 ? <EmptyState /> : <AgentGrid agents={agents} />}
			</LandingAgentsSection>
		</div>
	);
}
