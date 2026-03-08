"use client";
import ProfileHeader from "@/components/profile-page/profile-header";
import TokenRow from "@/components/profile-page/token-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { useParams } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import { getSwaps, getTokensCreated, getAddressPoints } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import Pagination from "@/components/pagination";

// biome-ignore lint/suspicious/noExplicitAny: replace with types later
export default function Page({ balances }: { balances: { user: any; balances: any[] } }) {
	const [tab, setTab] = useState("wallet");
	const [paginationOptions, setPaginationOptions] = useState({
		createdPage: 1,
		transactionPage: 1,
	});
	const params = useParams<{ address: string }>();
	const address = params?.address;

	const query = useQuery({
		queryKey: ["get-swaps", address, paginationOptions.transactionPage],
		queryFn: async () => {
			const swaps = await getSwaps({ address, page: paginationOptions.transactionPage });
			return swaps;
		},
	});

	const tokensCreatedQuery = useQuery({
		queryKey: ["get-tokens-created", address, paginationOptions.createdPage],
		queryFn: async () => {
			const tokensCreated = await getTokensCreated({ address, page: paginationOptions.createdPage });
			return tokensCreated;
		},
	});
	const tokensCreated = tokensCreatedQuery.data?.docs ?? [];

	const pointsData = useQuery({
		queryKey: ["get-points", address],
		queryFn: async () => {
			const points = await getAddressPoints({ address });
			return points;
		},
	});

	const transactions = query?.data?.docs ?? [];
	const user = balances?.user;
	const summedTotalWalletValue = balances?.balances.reduce((sum, item) => {
		if (item.price == null || Number.isNaN(item.price)) return sum;

		const balance = Number(item.shiftedBalance) || 0;
		const price = Number(item.price);

		const totalSum = sum + balance * price;
		return totalSum || 0;
	}, 0);

	const tokensBought = balances?.balances.length;

	return (
		<div className="mt-5 flex place-self-center w-full flex-col max-w-7xl mx-auto px-4">
			<div className="w-full flex flex-col gap-6">
				<ProfileHeader
					data={{
						username: user?.displayName,
						address: user?.address || address,
						tokensBought: tokensBought,
						tokensCreated: tokensCreatedQuery.data?.totalDocs ?? 0,
						chains: [{ chain: "solana", chainId: 101, amount: 120 }],
						totalPoints: pointsData?.data?.totalPoints ?? 0,
						weeklyPoints: pointsData?.data?.weeklyPoints ?? 0,
						image: user?.avatar,
					}}
				/>
				{/* tabs section */}
				<div className="w-full h-full flex place-self-center">
					<Tabs value={tab} onValueChange={setTab} className="w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="wallet" className="w-full">
								Wallet
							</TabsTrigger>
							<TabsTrigger value="Activity" className="w-full">
								Activity
							</TabsTrigger>
						</TabsList>
						<TabsContent value="wallet" className="bg-transparent">
							<div className="mt-6 h-fit w-full bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm flex flex-col place-self-center overflow-y-auto">
								<div className="w-full max-h-full overflow-y-auto">
									<div className="border-b border-[rgba(255,255,255,0.06)] w-full">
										<h1 className="p-4 text-sm text-[#a1a1aa]">
											Total Value:{" "}
											<span className="text-[#00ff87] font-bold">{formatNumber(summedTotalWalletValue, true)}</span>
										</h1>
									</div>
									{[...balances.balances]
										.sort((a, b) => (b.marketcap ?? 0) - (a.marketcap ?? 0))
										.map((balance) => {
											return (
												<TokenRow
													mode="wallet"
													key={balance.tokenAddress}
													verified={balance.verified}
													data={{
														chain: "solana",
														chainId: 101,
														image: balance?.image || balance?.info?.imageThumbUrl || "/favicon-96x96.png",
														title: balance?.info?.name,
														ticker: balance?.info?.symbol,
														marketCap: balance?.marketcap,
														contractAddress: balance?.tokenAddress,
														amountHeld: balance?.shiftedBalance,
														dollarWorth: balance?.price,
													}}
												/>
											);
										})}
								</div>
							</div>
						</TabsContent>
						<TabsContent value="Activity" className="bg-transparent">
							<Tabs defaultValue="transactions" className="w-full">
								<div className="mt-6 h-fit w-full bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm flex flex-col place-self-center overflow-y-auto">
									<div className="border-b border-[rgba(255,255,255,0.06)]">
										<TabsList shadowed={false} className="border-none space-x-2 p-4 bg-transparent">
											<TabsTrigger
												value="transactions"
												className="normal-case text-xs px-3 select-none py-1.5 h-auto rounded-sm border border-[rgba(255,255,255,0.08)] text-[#71717a] font-medium data-[state=active]:bg-[rgba(0,255,135,0.08)] data-[state=active]:text-[#00ff87] data-[state=active]:border-[rgba(0,255,135,0.2)]"
											>
												Transactions
											</TabsTrigger>
											<TabsTrigger
												value="tokens-created"
												className="normal-case text-xs px-3 select-none py-1.5 h-auto rounded-sm border border-[rgba(255,255,255,0.08)] text-[#71717a] font-medium data-[state=active]:bg-[rgba(0,255,135,0.08)] data-[state=active]:text-[#00ff87] data-[state=active]:border-[rgba(0,255,135,0.2)]"
											>
												Tokens Created
											</TabsTrigger>
										</TabsList>
									</div>

									<TabsContent value="tokens-created" className="p-0">
										{tokensCreated?.length > 0 ? (
											tokensCreated.map((token) => (
												<TokenRow
													mode="wallet"
													verified={tokensCreated.verified}
													key={token.contractAddress}
													data={{
														chain: "solana",
														chainId: 101,
														image: token.image ?? "/create/test-img.png",
														title: token.name,
														ticker: token.ticker,
														contractAddress: token.contractAddress,
													}}
												/>
											))
										) : (
											<div className="flex w-full p-4 h-full items-center justify-center">
												<h1 className="text-[#71717a] text-base font-semibold">
													No tokens have been created by this user
												</h1>
											</div>
										)}
										<Pagination
											pagination={{
												page: tokensCreatedQuery?.data?.page,
												totalPages: tokensCreatedQuery?.data?.totalPages,
												total: tokensCreatedQuery?.data?.totalDocs,
												hasMore: tokensCreatedQuery?.data?.hasNextPage,
											}}
											onPageChange={(newPage) => setPaginationOptions((prev) => ({ ...prev, createdPage: newPage }))}
										/>
									</TabsContent>

									<TabsContent value="transactions">
										{transactions?.length > 0 ? (
											<div className="max-h-[600px] overflow-y-auto">
												{transactions.map((transaction) => (
													<TokenRow
														mode="activity"
														key={transaction._id}
														verified={transaction.verified}
														data={{
															chain: "solana",
															chainId: 101,
															image: transaction.image ?? "/create/test-img.png",
															title: transaction.tokenName,
															ticker: transaction.tokenTicker,
															contractAddress: transaction.contractAddress,
															marketCap: transaction.marketcap,
															direction: transaction.direction,
															swapAmount: transaction?.swapAmount,
															amountGotten: transaction?.amountGotten,
															createdAt: transaction?.createdAt,
															signature: transaction?.signature,
														}}
													/>
												))}
											</div>
										) : (
											<div className="text-center my-6 text-[#71717a] text-base font-semibold">
												No transactions found
											</div>
										)}
										<Pagination
											pagination={{
												page: query.data?.page,
												totalPages: query.data?.totalPages,
												total: query.data?.totalDocs,
												hasMore: query.data?.hasNextPage,
											}}
											onPageChange={(newPage) =>
												setPaginationOptions((prev) => ({ ...prev, transactionPage: newPage }))
											}
										/>
									</TabsContent>
								</div>
							</Tabs>
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}
