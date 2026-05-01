import type { LaunchpadId } from "@/lib/launchpad/types";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import LaunchpadPicker from "./launchpad-picker";

function PickerHarness() {
	const [selected, setSelected] = useState<LaunchpadId | null>(null);
	return (
		<div className="bg-[#08080a] min-h-screen p-8">
			<div className="max-w-[1100px] mx-auto">
				<LaunchpadPicker selectedId={selected} onSelect={(descriptor) => setSelected(descriptor.id)} />
			</div>
		</div>
	);
}

const meta: Meta<typeof PickerHarness> = {
	title: "Wizard/Launchpad/Picker",
	component: PickerHarness,
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof PickerHarness>;

export const Default: Story = {};
