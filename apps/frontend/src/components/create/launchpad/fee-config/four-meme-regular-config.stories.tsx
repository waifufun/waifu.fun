import type { Meta, StoryObj } from "@storybook/react";
import FourMemeRegularConfig from "./four-meme-regular-config";

const meta: Meta<typeof FourMemeRegularConfig> = {
	title: "Wizard/Launchpad/FeeConfig/FourMemeRegular",
	component: FourMemeRegularConfig,
	parameters: { layout: "fullscreen" },
	decorators: [
		(Story) => (
			<div className="bg-[#08080a] min-h-screen p-8">
				<div className="max-w-[640px] mx-auto">
					<Story />
				</div>
			</div>
		),
	],
};

export default meta;
type Story = StoryObj<typeof FourMemeRegularConfig>;

export const Default: Story = {};
