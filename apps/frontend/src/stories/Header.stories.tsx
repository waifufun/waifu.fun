import type { Meta, StoryObj } from "@storybook/react";
import Header from "../components/header";

// Story setup
const meta: Meta<typeof Header> = {
	title: "Components/Header",
	component: Header,
	decorators: [
		(Story) => (
			<div className="bg-gray-100 p-4">
				<Story />
			</div>
		),
	],
};

export default meta;
type Story = StoryObj<typeof Header>;

export const Default: Story = {};
