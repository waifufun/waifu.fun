import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DEFAULT_FOUR_MEME_TAX } from "@/lib/launchpad/fee-defaults";
import { DEFAULT_PLATFORM_CUT_BPS, type FourMemeTaxFeeConfig } from "@/lib/launchpad/types";
import FourMemeTaxConfig from "./four-meme-tax-config";

function Harness({ initial }: { initial: FourMemeTaxFeeConfig }) {
	const [value, setValue] = useState<FourMemeTaxFeeConfig>(initial);
	return (
		<div className="bg-[#08080a] min-h-screen p-8">
			<div className="max-w-[640px] mx-auto">
				<FourMemeTaxConfig value={value} onChange={setValue} />
			</div>
		</div>
	);
}

const meta: Meta<typeof Harness> = {
	title: "Wizard/Launchpad/FeeConfig/FourMemeTax",
	component: Harness,
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Harness>;

export const Default: Story = { args: { initial: DEFAULT_FOUR_MEME_TAX } };

export const HighTax: Story = {
	args: {
		initial: {
			kind: "four-meme-tax",
			taxBps: 500,
			platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
			// 25% platform cut → 75% remaining → 50/30/10/10 of remaining
			allocation: { founderBps: 3750, holderBps: 2250, burnBps: 750, liquidityBps: 750 },
			minHolderBalance: "10000",
		},
	},
};

export const SumValidationError: Story = {
	args: {
		initial: {
			kind: "four-meme-tax",
			taxBps: 300,
			platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
			// Intentionally off, sums to 10000 instead of 7500
			allocation: { founderBps: 4000, holderBps: 4000, burnBps: 1500, liquidityBps: 1500 },
			minHolderBalance: "10000",
		},
	},
};

export const PlatformCutAtFloor: Story = {
	args: {
		initial: {
			kind: "four-meme-tax",
			taxBps: 300,
			platformCutBps: 1000, // 10%, minimum allowed in prod
			allocation: { founderBps: 4500, holderBps: 2700, burnBps: 900, liquidityBps: 900 },
			minHolderBalance: "10000",
		},
	},
};

export const PlatformCutAtCeiling: Story = {
	args: {
		initial: {
			kind: "four-meme-tax",
			taxBps: 300,
			platformCutBps: 5000, // 50%, maximum allowed in prod
			allocation: { founderBps: 2500, holderBps: 1500, burnBps: 500, liquidityBps: 500 },
			minHolderBalance: "10000",
		},
	},
};
