import type { Metadata } from "next";
import StakingDashboard from "@/components/staking/staking-dashboard";

export const metadata: Metadata = {
	title: "stake | waifu.fun",
	description: "Stake WAIFU to earn fees from the entire agent economy. veWAIFU governance.",
};

export default function StakePage() {
	return <StakingDashboard />;
}
