"use client";
import ProfileHeader from "@/components/profile-page/profile-header";
// import PointsFilter from "@/components/profile-page/profile-points-filter";
import TokenRow from "@/components/profile-page/token-row";
import TokensFilter from "@/components/profile-page/tokens-filter";
// import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import { uploadAvatar } from "@/lib/api";
import { useParams } from "next/navigation";

// biome-ignore lint/suspicious/noExplicitAny: replace with types later
export default function Page({ balances }: { balances: any[] }) {
	const [tab, setTab] = useState("wallet");
	const params = useParams<{ address: string }>();
	const address = params?.address;

	const summedTotalWalletValue = balances.reduce((sum, item) => {
		if (item.price == null || Number.isNaN(item.price)) return sum;

		const balance = Number(item.shiftedBalance) || 0;
		const price = Number(item.price);

		const totalSum = sum + balance * price;
		return totalSum.toFixed(2);
	}, 0);

	const tokensBought = balances?.length;
	const tokensCreated = balances?.filter((token) => token.creatorAddress === address).length;
	return (
		<div className="mt-5 flex place-self-center w-full flex-col">
			<div className="w-full max-w-[1368px] mx-auto flex flex-col gap-6">
				<ProfileHeader
					data={{
						username: "AlienMaster42",
						address: address,
						tokensBought: tokensBought,
						tokensCreated: tokensCreated,
						chains: [{ chain: "solana", chainId: 101, amount: 120 }],
						points: 12,
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
												${summedTotalWalletValue}
											</span>
										</h1>
									</div>
									{balances?.map((balance, i) => {
										console.log(balance);
										return (
											<TokenRow
												mode="wallet"
												// biome-ignore lint/suspicious/noArrayIndexKey: DEV
												key={i}
												data={{
													chain: "solana",
													chainId: 101,
													image: balance?.info?.imageThumbUrl,
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
									<TokensFilter />
								</div>
								<div className="p-0">
									{Array(3)
										.fill(null)
										.map((_, i) => (
											<TokenRow
												mode="activity"
												// biome-ignore lint/suspicious/noArrayIndexKey: DEV
												key={i}
												data={{
													chain: "solana",
													chainId: 101,
													image: "/create/test-img.png",
													title: `AlienToken ${i + 1}`,
													ticker: "ALIEN",
													marketCap: 1240000,
													contractAddress: "0xa83114a443da1cecefc50368531cace9f37fcccb",
													amountHeld: 124_543_343,
													dollarWorth: 1337.42,
													points: 12,
												}}
											/>
										))}
								</div>
							</div>
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}
