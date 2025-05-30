"use client";
import PointCounter from "@/components/profile-page/point-counter";
import ProfileFilters from "@/components/profile-page/profile-filters";
import ProfileHeader from "@/components/profile-page/profile-header";
import PointsFilter from "@/components/profile-page/profile-points-filter";
import TokenRow from "@/components/profile-page/token-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";

export default function Page({ balances }: { balances: any[]}) {
	const [tab, setTab] = useState("wallet");

	return (
		<div className="mt-10 flex place-self-center w-full flex-col">
			<div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
				<ProfileHeader
					data={{
						username: "AlienMaster42",
						address: "0xa83114a443da1cecefc50368531cace9f37fcccb",
						tokensBought: 128,
						tokensCreated: 42,
						chains: [
							{ chain: "solana", chainId: 101, amount: 120 },
							{ chain: "evm", chainId: 1, amount: 120 },
							{ chain: "evm", chainId: 8453, amount: 240 },
						],
					}}
				/>
				{/* tabs section */}
				<div className="w-[800px] rounded-md bg-[#0F0F0F] h-full flex place-self-center">
					<Tabs value={tab} onValueChange={setTab} className="gap-y-3 w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="wallet" className="w-full">
								Wallet
							</TabsTrigger>
							<TabsTrigger value="Points" className="w-full">
								Points
							</TabsTrigger>
						</TabsList>
						{tab === "wallet" ? <ProfileFilters mode={tab} /> : null}
						<TabsContent value="wallet" className="bg-transparent h-[800px] overflow-y-auto pr-1">
							<div className="p-4 w-full max-h-full overflow-y-auto">
								{balances.map((balance, i) => {
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
												marketCap: 1240000,
												contractAddress: balance?.tokenAddress,
												amountHeld: balance?.shiftedBalance,
											}}
										/>
									);
								})}
							</div>
						</TabsContent>
						<TabsContent value="Points" className="bg-transparent">
							<div className="flex justify-center mt-2">
								<PointCounter points={12} />
							</div>
							<div className="mt-4">
								<PointsFilter />
							</div>
							<div className="mt-6 flex flex-col place-self-center h-[650px] overflow-y-auto pr-1">
								{Array(3)
									.fill(null)
									.map((_, i) => (
										<TokenRow
											mode="points"
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
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}
