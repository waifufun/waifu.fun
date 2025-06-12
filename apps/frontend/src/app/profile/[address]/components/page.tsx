"use client";
import ProfileHeader from "@/components/profile-page/profile-header";
// import PointsFilter from "@/components/profile-page/profile-points-filter";
import TokenRow from "@/components/profile-page/token-row";
import TokensFilter from "@/components/profile-page/tokens-filter";
// import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";

// biome-ignore lint/suspicious/noExplicitAny: replace with types later
export default function Page({ balances }: { balances: any[] }) {
	const [tab, setTab] = useState("wallet");

	return (
		<div className="mt-10 flex place-self-center w-full flex-col">
			<div className="w-full max-w-full mx-auto flex flex-col gap-6">
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
				<div className="w-full h-full flex place-self-center">
					<Tabs value={tab} onValueChange={setTab} className="gap-y-3 w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="wallet" className="w-full">
								Wallet
							</TabsTrigger>
							<TabsTrigger value="Activity" className="w-full">
								Activity
							</TabsTrigger>
						</TabsList>
						<TabsContent value="wallet" className="bg-transparent h-[800px] overflow-y-auto pr-1">
							<div className="mt-6 border-2 h-fit w-full border-[#03FF24]/40 shadow-[3px_3px_0px_rgba(3,255,36,0.2)] flex flex-col place-self-center overflow-y-auto">
								<div className="w-full max-h-full overflow-y-auto">
									<div className="border-b-1 border-[#03FF24]/40 w-full">
										<h1 className="p-4 text-white">
											Total Value: <span className="text-autofun-background-action-highlight font-bold">$444</span>
										</h1>
									</div>
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
													dollarWorth: 123123123,
												}}
											/>
										);
									})}
								</div>
							</div>
						</TabsContent>
						<TabsContent value="Activity" className="bg-transparent">
							<div className="mt-6 h-fit border-2 w-full border-[#03FF24]/40 shadow-[3px_3px_0px_rgba(3,255,36,0.2)] flex flex-col place-self-center overflow-y-auto">
								<div className="border-b-2 border-[#03FF24]/40">
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
