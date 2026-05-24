import GiveSkillClient from "@/components/give-skill/give-skill-client";
import type { Metadata } from "next";

const TITLE = "give your agent the skill";
const DESCRIPTION = "paste this prompt to your agent. it knows what to do.";

export const metadata: Metadata = {
	title: `${TITLE} · waifu.fun`,
	description: DESCRIPTION,
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
	},
};

export default function GiveSkillPage() {
	return <GiveSkillClient />;
}
