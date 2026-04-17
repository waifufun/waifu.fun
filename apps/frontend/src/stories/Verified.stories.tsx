import Verified from "@/components/verified";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Verified> = {
	title: "Components/Verified",
	component: Verified,
};
export default meta;

type Story = StoryObj<typeof Verified>;

export const VerifiedTrue: Story = {
	args: {
		isVerified: true,
	},
};

export const VerifiedFalse: Story = {
	args: {
		isVerified: false,
	},
};
