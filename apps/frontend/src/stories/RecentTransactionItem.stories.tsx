import type { Meta, StoryObj } from "@storybook/react";
import RecentTransactionItem from "@/components/recent-transaction-item";
import type { IRecentTransaction } from "@waifufun/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

const mockTransaction: IRecentTransaction = {
	txId: "0x123abc",
	chain: "evm",
	chainId: 1,
	status: "success",
	input: {
		amountFormatted: "0.5",
		symbol: "ETH",
		amount: "0.5",
		tokenAddress: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
		decimals: 18,
	},
	output: {
		amountFormatted: "1000",
		symbol: "USDC",
		amount: "1000",
		tokenAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
		decimals: 6,
	},
	timestamp: new Date(),
};

const meta: Meta<typeof RecentTransactionItem> = {
	title: "Components/RecentTransactionItem",
	component: RecentTransactionItem,
	decorators: [
		(Story) => (
			<QueryClientProvider client={queryClient}>
				<div className="p-4 bg-transparent">
					<Story />
				</div>
			</QueryClientProvider>
		),
	],
};
export default meta;

type Story = StoryObj<typeof RecentTransactionItem>;

export const Default: Story = {
	args: {
		transaction: mockTransaction,
	},
};
