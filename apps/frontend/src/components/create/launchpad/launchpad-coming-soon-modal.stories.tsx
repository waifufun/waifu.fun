import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { MOCK_LAUNCHPADS } from "@/lib/launchpad/mock-descriptors";
import type { LaunchpadId } from "@/lib/launchpad/types";
import { LaunchpadComingSoonModal } from "./launchpad-coming-soon-modal";

const byId = (id: LaunchpadId) => MOCK_LAUNCHPADS.find((descriptor) => descriptor.id === id)!;

function Harness({ open: initialOpen, launchpadId }: { open: boolean; launchpadId: LaunchpadId }) {
	const [open, setOpen] = useState(initialOpen);
	const descriptor = byId(launchpadId);
	return (
		<div className="bg-[#08080a] min-h-[100dvh] p-5 sm:p-8">
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="h-10 px-4 border border-white/15 text-white text-sm transition-all hover:border-white/30 active:translate-y-[1px]"
			>
				open waitlist
			</button>
			<LaunchpadComingSoonModal descriptor={descriptor} open={open} onClose={() => setOpen(false)} />
		</div>
	);
}

const meta: Meta<typeof Harness> = {
	title: "Wizard/Launchpad/ComingSoonModal",
	component: Harness,
	parameters: { layout: "fullscreen" },
	args: { launchpadId: "pump-fun" },
};

export default meta;
type Story = StoryObj<typeof Harness>;

export const Closed: Story = { args: { open: false } };
export const PumpFunOpen: Story = { args: { open: true, launchpadId: "pump-fun" } };
export const BagsOpen: Story = { args: { open: true, launchpadId: "bags" } };
export const CustomOpen: Story = { args: { open: true, launchpadId: "custom" } };
