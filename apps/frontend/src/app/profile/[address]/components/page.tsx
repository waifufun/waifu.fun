"use client";
import ProfileHeader from "@/components/profile-page/profile-header";
// import PointsFilter from "@/components/profile-page/profile-points-filter";
import TokenRow from "@/components/profile-page/token-row";
// import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { useParams } from "next/navigation";
import { formatNumber } from "@/lib/utils";

// biome-ignore lint/suspicious/noExplicitAny: replace with types later
export default function Page({ balances }: { balances: { user: any; balances: any[] } }) {
	const [tab, setTab] = useState("wallet");
	const params = useParams<{ address: string }>();
	const address = params?.address;

	const user = balances?.user;

	const summedTotalWalletValue = balances?.balances.reduce((sum, item) => {
		if (item.price == null || Number.isNaN(item.price)) return sum;

		const balance = Number(item.shiftedBalance) || 0;
		const price = Number(item.price);

		const totalSum = sum + balance * price;
		return totalSum || 0;
	}, 0);

	const tokensBought = balances?.balances.length;
	const tokensCreated = balances?.balances.filter((token) => token.creatorAddress === address);

	return (
		<div className="mt-5 flex place-self-center w-full flex-col">
			<div className="w-full container mx-auto flex flex-col gap-6">
				<ProfileHeader
					data={{
						username: user?.displayName,
						address: user?.address || address,
						tokensBought: tokensBought,
						tokensCreated: tokensCreated?.length,
						chains: [{ chain: "solana", chainId: 101, amount: 120 }],
						points: user?.points,
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
							<div className="mt-6 h-fit border-2 w-full border-[#03FF24]/40 shadow-[3px_3px_0px_rgba(3,255,36,0.2)] flex flex-col place-self-center overflow-y-auto">
								<div className="w-full max-h-full overflow-y-auto">
									<div className="border-b-1 border-[#03FF24]/40 w-full">
										<h1 className="p-4 text-sm text-gray-300">
											Total Value:{" "}
											<span className="text-autofun-background-action-highlight font-bold">
												{formatNumber(summedTotalWalletValue, true)}
											</span>
										</h1>
									</div>
									{[...balances.balances]
										.sort((a, b) => (b.marketcap ?? 0) - (a.marketcap ?? 0))
										.map((balance) => {
											return (
												<TokenRow
													mode="wallet"
													key={balance.tokenAddress}
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
							<div className="mt-6 h-fit border-2 w-full border-[#03FF24]/40 shadow-[3px_3px_0px_rgba(3,255,36,0.2)] flex flex-col place-self-center overflow-y-auto">
								<div className="border-b-1 border-[#03FF24]/40">
									{/* <TokensFilter /> */}
									<div className="w-full justify-around md:justify-start p-3 place-self-center flex items-center">
										<button
											type="button"
											disabled
											className="text-xs px-3 select-none py-1 h-auto rounded-none border-2 border-black bg-[#03FF24] text-black"
										>
											Tokens Created
										</button>
									</div>
								</div>
								<div className="p-0">
									{tokensCreated?.map((token) => (
										<TokenRow
											mode="wallet"
											key={token.tokenAddress}
											data={{
												chain: "solana",
												chainId: 101,
												image: token.info?.imageLargeUrl ?? "/create/test-img.png",
												title: token.name,
												ticker: token.info?.name,
												contractAddress: token.tokenAddress,
												marketCap: token?.marketcap,
												amountHeld: token?.shiftedBalance,
											}}
										/>
									))}
								</div>
							</div>

							{(tokensCreated?.length || 0) === 0 && (
								<div className="flex w-full h-full items-center justify-center">
									<h1 className="text-[#03FF23] text-base font-semibold uppercase">
										No tokens have been created by this user
									</h1>
								</div>
							)}
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}
