import type { Metadata } from "next";
import Hero from "@/components/litepaper/hero";
import Trenches from "@/components/litepaper/trenches";
import Different from "@/components/litepaper/different";
import TheStack from "@/components/litepaper/the-stack";
import TheLoop from "@/components/litepaper/the-loop";
import Tiers from "@/components/litepaper/tiers";
import Closing from "@/components/litepaper/closing";
import SectionDivider from "@/components/litepaper/section-divider";
import LitepaperShell from "@/components/litepaper/litepaper-shell";

export const metadata: Metadata = {
	title: "waifu.fun — the agent launchpad that learns",
	description:
		"Launch tokens with AI agents. Trading fees fine-tune the model. Your waifu gets smarter the more people trade it.",
	openGraph: {
		title: "waifu.fun — the agent launchpad that learns",
		description:
			"Launch tokens with AI agents. Trading fees fine-tune the model. Your waifu gets smarter the more people trade it.",
		type: "website",
		locale: "en_US",
	},
	twitter: {
		card: "summary_large_image",
		title: "waifu.fun — the agent launchpad that learns",
		description:
			"Launch tokens with AI agents. Trading fees fine-tune the model. Your waifu gets smarter the more people trade it.",
	},
};

export default function Home() {
	return (
		<LitepaperShell>
			<div className="relative isolate">
				<Hero />
				<SectionDivider />
				<Trenches />
				<SectionDivider variant="subtle" />
				<Different />
				<SectionDivider />
				<TheStack />
				<SectionDivider variant="subtle" />
				<TheLoop />
				<SectionDivider />
				<Tiers />
				<SectionDivider variant="subtle" />
				<Closing />
			</div>
		</LitepaperShell>
	);
}
