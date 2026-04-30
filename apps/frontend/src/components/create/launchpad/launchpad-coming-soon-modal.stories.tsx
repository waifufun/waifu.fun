import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { MOCK_LAUNCHPADS } from "@/lib/launchpad/mock-descriptors";
import { LaunchpadComingSoonModal } from "./launchpad-coming-soon-modal";

const PUMP = MOCK_LAUNCHPADS.find((d) => d.id === "pump-fun")!;

function Harness({ open: initialOpen }: { open: boolean }) {
	const [open, setOpen] = useState(initialOpen);
	return (
		<div className="bg-[#08080a] min-h-screen p-8">
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="h-10 px-4 border border-white/15 text-white text-sm"
			>
				open waitlist
			</button>
			<LaunchpadComingSoonModal descriptor={PUMP} open={open} onClose={() => setOpen(false)} />
		</div>
	);
}

const meta: Meta<typeof Harness> = {
	title: "Wizard/Launchpad/ComingSoonModal",
	component: Harness,
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Harness>;

export const Closed: Story = { args: { open: false } };
export const Open: Story = { args: { open: true } };
