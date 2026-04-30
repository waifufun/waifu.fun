import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { LaunchpadDescriptor, LaunchpadId } from "@/lib/launchpad/types";
import { LaunchpadCard } from "./launchpad-card";

const FOUR_MEME_TAX: LaunchpadDescriptor = {
	id: "four-meme-tax",
	status: "live",
	chain: "bsc",
	displayName: "four.meme tax",
	shortDescription: "configurable trade tax that funds the agent's treasury, holders, burn, and LP.",
	feeSummary: "1 / 3 / 5 / 10% trade tax. you split it.",
	graduationTarget: "24 BNB → PancakeSwap V3",
	badges: ["recommended"],
};

const FOUR_MEME_REGULAR: LaunchpadDescriptor = {
	id: "four-meme-regular",
	status: "live",
	chain: "bsc",
	displayName: "four.meme regular",
	shortDescription: "no creator-side tax. simple bonding curve, no ongoing routing.",
	feeSummary: "1% during curve, 0% post-graduation.",
	graduationTarget: "24 BNB → PancakeSwap V3",
};

const FLAP: LaunchpadDescriptor = {
	id: "flap",
	status: "live",
	chain: "bsc",
	displayName: "flap",
	shortDescription: "tax on every trade, curve and post-grad. routes to agent treasury or a custom vault.",
	feeSummary: "configurable tax, curve + post-grad.",
	graduationTarget: "PancakeSwap V3",
	badges: ["advanced"],
};

const PUMP: LaunchpadDescriptor = {
	id: "pump-fun",
	status: "coming-soon",
	chain: "solana",
	displayName: "pump.fun",
	shortDescription: "solana's largest launchpad. requires solana wallet integration.",
	feeSummary: "1% trade fee.",
	graduationTarget: "Raydium",
	expectedAvailability: "Wave 4",
};

const Wrapper = ({
	descriptor,
	defaultSelected = false,
}: {
	descriptor: LaunchpadDescriptor;
	defaultSelected?: boolean;
}) => {
	const [selected, setSelected] = useState<LaunchpadId | null>(defaultSelected ? descriptor.id : null);
	return (
		<div className="bg-[#08080a] p-8 max-w-[400px]">
			<LaunchpadCard
				descriptor={descriptor}
				selected={selected === descriptor.id}
				onSelect={() => setSelected((s) => (s === descriptor.id ? null : descriptor.id))}
			/>
		</div>
	);
};

const meta: Meta<typeof Wrapper> = {
	title: "Wizard/Launchpad/Card",
	component: Wrapper,
	parameters: { layout: "fullscreen", backgrounds: { default: "dark" } },
};

export default meta;
type Story = StoryObj<typeof Wrapper>;

export const Live: Story = { args: { descriptor: FOUR_MEME_REGULAR } };
export const Recommended: Story = { args: { descriptor: FOUR_MEME_TAX } };
export const Advanced: Story = { args: { descriptor: FLAP } };
export const ComingSoon: Story = { args: { descriptor: PUMP } };
export const Selected: Story = { args: { descriptor: FOUR_MEME_TAX, defaultSelected: true } };
