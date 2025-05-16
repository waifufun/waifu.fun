import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
	stories: ['../**/*.stories.@(ts|tsx|js|jsx|mdx)'],
	// stories: ["../stories/**/*.stories.@(ts|tsx)"],
	// addons: ["@storybook/addon-links", "@storybook/addon-essentials"],
	framework: {
		name: "@storybook/nextjs",
		options: {},
	},
};

export default config;
