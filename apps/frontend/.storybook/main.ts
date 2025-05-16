import type { StorybookConfig } from "@storybook/nextjs";

const config: StorybookConfig = {
	stories: ["../**/*.stories.@(ts|tsx|js|jsx|mdx)"],
	addons: ["@storybook/addon-essentials", "@storybook/addon-links"],
	framework: {
		name: "@storybook/nextjs",
		options: {},
	},
	core: {
		builder: "@storybook/builder-webpack5",
	},
};

export default config;
