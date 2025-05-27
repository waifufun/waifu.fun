"use client";
import ProfileFilters from "@/components/profile-page/profile-filters";
import ProfileHeader from "@/components/profile-page/profile-header";
import TokenRow from "@/components/profile-page/token-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
// import { useQuery } from "@tanstack/react-query";
// import { useParams } from "next/navigation";

export default function Page() {
	const [tab, setTab] = useState("Activity");

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
							{ chain: "solana", amount: 1.88 },
							{ chain: "ethereum", amount: 0.88 },
							{ chain: "base", amount: 12.37 },
						],
					}}
				/>
				{/* tabs section */}
				<div className="w-[800px] bg-[#0a0a0a] h-full flex place-self-center">
					<Tabs value={tab} onValueChange={setTab} className="gap-y-3 w-full">
						<TabsList className="grid w-full grid-cols-3">
							<TabsTrigger value="Activity" className="w-full">
								Activity
							</TabsTrigger>
							<TabsTrigger value="Wallet" className="w-full">
								Wallet
							</TabsTrigger>
							<TabsTrigger value="Points" className="w-full">
								Points
							</TabsTrigger>
						</TabsList>

						<ProfileFilters />
						<TabsContent value="Activity">
							<div className="p-4 w-full max-h-full overflow-y-auto">
								{/* Example content */}
								{Array(8)
									.fill(null)
									.map((_, i) => (
										<TokenRow
											key={i}
											data={{
												tokenImageUrl: "/create/test-img.png",
												tokenTitle: `AlienToken ${i + 1}`,
												tokenTicker: "ALIEN",
												marketCap: 1240000,
												contractAddress: "0xa83114a443da1cecefc50368531cace9f37fcccb",
												amountHeld: 124_543_343,
												dollarWorth: 1337.42,
											}}
										/>
									))}
							</div>
						</TabsContent>
						<TabsContent value="Wallet">Wallet content</TabsContent>
						<TabsContent value="Points">
							<p className="text-white p-4">Points content goes here</p>
						</TabsContent>
					</Tabs>
				</div>
			</div>
		</div>
	);
}
