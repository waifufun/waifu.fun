import { Button } from "@/components/ui/button";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof Button> = {
	title: "Components/Button",
	component: Button,
	args: {
		children: "Click me",
	},
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const Destructive: Story = {
	args: {
		variant: "destructive",
	},
};

export const Outline: Story = {
	args: {
		variant: "outline",
	},
};

export const Ghost: Story = {
	args: {
		variant: "ghost",
	},
};

export const Link: Story = {
	args: {
		variant: "link",
	},
};

export const Small: Story = {
	args: {
		size: "sm",
	},
};

export const Large: Story = {
	args: {
		size: "lg",
	},
};

export const Icon: Story = {
	args: {
		size: "icon",
		children: "🔍",
	},
};
