import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "the story — waifu.fun",
	description:
		"They live because you trade. Learn how waifu.fun agents work — autonomous economic actors on Solana powered by Milady Cloud and Eliza Cloud.",
	openGraph: {
		title: "the story — waifu.fun",
		description:
			"They live because you trade. Autonomous agents on Solana that live, die, and revive through economic activity.",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "the story — waifu.fun",
		description:
			"They live because you trade. Autonomous agents on Solana that live, die, and revive through economic activity.",
	},
};

export default function StoryLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return <>{children}</>;
}
