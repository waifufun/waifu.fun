import type { Metadata } from "next";
import Hero from "@/components/landing/hero";
import WhatIs from "@/components/landing/what-is";
import HowItWorks from "@/components/landing/how-it-works";
import FeaturedAgents from "@/components/landing/featured-agents";
import SkillSystem from "@/components/landing/skill-system";
import Economics from "@/components/landing/economics";
import CTA from "@/components/landing/cta";

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: "waifu.fun — Autonomous AI Agents on Solana",
		description:
			"Launch autonomous AI agents that trade, build skills, and pay their own bills. Not chatbots — economic actors on Solana.",
		openGraph: {
			title: "waifu.fun — Your AI Trades While You Sleep",
			description:
				"Launch autonomous AI agents that trade, build skills, and pay their own bills on Solana.",
			type: "website",
			locale: "en_US",
		},
		twitter: {
			card: "summary_large_image",
			title: "waifu.fun — Your AI Trades While You Sleep",
			description:
				"Launch autonomous AI agents that trade, build skills, and pay their own bills on Solana.",
		},
	};
};

export default function Home() {
	return (
		<div className="w-full">
			<Hero />
			<WhatIs />
			<HowItWorks />
			<FeaturedAgents />
			<SkillSystem />
			<Economics />
			<CTA />
		</div>
	);
}
