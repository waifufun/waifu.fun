import type { Meta, StoryObj } from "@storybook/react";
import ChainIndicator from "@/components/chain-indicator";
import { EvmChainIds, SolanaNetworkIds, type TChain } from "@autofun/types";

const meta: Meta<typeof ChainIndicator> = {
	title: "Components/ChainIndicator",
	component: ChainIndicator,
};
export default meta;

type Story = StoryObj<typeof ChainIndicator>;

export const Ethereum: Story = {
	args: {
		chain: "evm" as TChain,
		chainId: EvmChainIds.EthereumMainnet,
	},
};

export const Base: Story = {
	args: {
		chain: "evm" as TChain,
		chainId: EvmChainIds.BaseMainnet,
	},
};

export const Solana: Story = {
	args: {
		chain: "solana" as TChain,
		chainId: SolanaNetworkIds.Mainnet,
	},
};
