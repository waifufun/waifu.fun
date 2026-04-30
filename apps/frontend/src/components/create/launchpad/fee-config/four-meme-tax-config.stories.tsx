import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DEFAULT_FOUR_MEME_TAX } from "@/lib/launchpad/fee-defaults";
import type { FourMemeTaxFeeConfig } from "@/lib/launchpad/types";
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

export const HighTaxClearsFloor: Story = {
	args: {
		initial: {
			kind: "four-meme-tax",
			taxBps: 500,
			allocation: { founderBps: 5000, holderBps: 3000, burnBps: 1000, liquidityBps: 1000 },
			minHolderBalance: "10000",
		},
	},
};

export const SumValidationError: Story = {
	args: {
		initial: {
			kind: "four-meme-tax",
			taxBps: 300,
			allocation: { founderBps: 4000, holderBps: 4000, burnBps: 1500, liquidityBps: 1500 },
			minHolderBalance: "10000",
		},
	},
};

export const FloorBreachWarning: Story = {
	args: {
		initial: {
			kind: "four-meme-tax",
			taxBps: 100,
			allocation: { founderBps: 2000, holderBps: 4000, burnBps: 2000, liquidityBps: 2000 },
			minHolderBalance: "10000",
		},
	},
};
