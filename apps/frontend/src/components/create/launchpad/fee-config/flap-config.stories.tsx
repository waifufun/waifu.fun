import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { DEFAULT_FLAP } from "@/lib/launchpad/fee-defaults";
import { DEFAULT_PLATFORM_CUT_BPS, type FlapFeeConfig } from "@/lib/launchpad/types";
import FlapConfig from "./flap-config";

function Harness({ initial }: { initial: FlapFeeConfig }) {
	const [value, setValue] = useState<FlapFeeConfig>(initial);
	return (
		<div className="bg-[#08080a] min-h-screen p-8">
			<div className="max-w-[640px] mx-auto">
				<FlapConfig value={value} onChange={setValue} />
			</div>
		</div>
	);
}

const meta: Meta<typeof Harness> = {
	title: "Wizard/Launchpad/FeeConfig/Flap",
	component: Harness,
	parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof Harness>;

export const Default: Story = { args: { initial: DEFAULT_FLAP } };

export const CustomVault: Story = {
	args: {
		initial: {
			kind: "flap",
			taxBps: 500,
			platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
			recipient: "custom-vault",
			customVaultAddress: `0x${"a".repeat(40)}`,
		},
	},
};

export const CustomVaultInvalid: Story = {
	args: {
		initial: {
			kind: "flap",
			taxBps: 300,
			platformCutBps: DEFAULT_PLATFORM_CUT_BPS,
			recipient: "custom-vault",
			customVaultAddress: "0xnotahex",
		},
	},
};
