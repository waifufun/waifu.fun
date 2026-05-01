import { MOCK_LAUNCHPADS } from "@/lib/launchpad/mock-descriptors";
import type { LaunchpadDescriptor, LaunchpadId } from "@/lib/launchpad/types";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { LaunchpadCard } from "./launchpad-card";

const byId = (id: LaunchpadId) => MOCK_LAUNCHPADS.find((descriptor) => descriptor.id === id)!;

const Wrapper = ({
	descriptor,
	defaultSelected = false,
}: {
	descriptor: LaunchpadDescriptor;
	defaultSelected?: boolean;
}) => {
	const [selected, setSelected] = useState<LaunchpadId | null>(defaultSelected ? descriptor.id : null);
	return (
		<div className="bg-[#08080a] p-8 max-w-[430px]">
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

export const Live: Story = { args: { descriptor: byId("four-meme-regular") } };
export const Recommended: Story = { args: { descriptor: byId("four-meme-tax") } };
export const Advanced: Story = { args: { descriptor: byId("flap") } };
export const PumpFunComingSoon: Story = { args: { descriptor: byId("pump-fun") } };
export const BagsComingSoon: Story = { args: { descriptor: byId("bags") } };
export const CustomComingSoon: Story = { args: { descriptor: byId("custom") } };
export const Selected: Story = { args: { descriptor: byId("four-meme-tax"), defaultSelected: true } };
