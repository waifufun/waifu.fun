"use client";
import PointCounter from "@/components/profile-page/point-counter";
import ProfileFilters from "@/components/profile-page/profile-filters";
import ProfileHeader from "@/components/profile-page/profile-header";
import PointsFilter from "@/components/profile-page/profile-points-filter";
import TokenRow from "@/components/profile-page/token-row";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";

export default function Page() {
	const [tab, setTab] = useState("activity");

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
				<div className="w-[800px] rounded-md bg-[#0F0F0F] h-full flex place-self-center">
					<Tabs value={tab} onValueChange={setTab} className="gap-y-3 w-full">
						<TabsList className="grid w-full grid-cols-3">
							<TabsTrigger value="activity" className="w-full">
								Activity
							</TabsTrigger>
							<TabsTrigger value="wallet" className="w-full">
								Wallet
							</TabsTrigger>
							<TabsTrigger value="Points" className="w-full">
								Points
							</TabsTrigger>
						</TabsList>
						{(tab === "activity" || tab === "wallet") && <ProfileFilters mode={tab} />}{" "}
						<TabsContent value="activity" className="bg-transparent max-h-[800px] overflow-y-auto pr-1">
							<div className="p-4 w-full max-h-full overflow-y-auto">
								{/* Example content */}
								{Array(8)
									.fill(null)
									.map((_, i) => (
										<TokenRow
											key={i}
											data={{
												image: "/create/test-img.png",
												title: `AlienToken ${i + 1}`,
												ticker: "ALIEN",
												marketCap: 1240000,
												contractAddress: "0xa83114a443da1cecefc50368531cace9f37fcccb",
												amountHeld: 124_543_343,
												dollarWorth: 1337.42,
											}}
										/>
									))}
							</div>
						</TabsContent>
						<TabsContent value="wallet" className="bg-transparent max-h-[800px] overflow-y-auto pr-1">
							<div className="p-4 w-full max-h-full overflow-y-auto">
								{/* Example content */}
								{Array(8)
									.fill(null)
									.map((_, i) => (
										<TokenRow
											mode="wallet"
											key={i}
											data={{
												image: "/create/test-img.png",
												title: "AlienToken",
												ticker: "ALIEN",
												marketCap: 1240000,
												contractAddress: "0xa83114a443da1cecefc50368531cace9f37fcccb",
												amountHeld: 124_543_343,
												dollarWorth: 1337.42,
											}}
										/>
									))}
							</div>
						</TabsContent>
						<TabsContent value="Points" className="bg-transparent">
							<div className="flex justify-center mt-2">
								<PointCounter points={12} />
							</div>
							<div className="mt-4">
								<PointsFilter />
							</div>
							<div className="mt-6 flex gap-y-4 flex-col place-self-center max-h-[650px] overflow-y-auto pr-1">
								{Array(24)
									.fill(null)
									.map((_, i) => (
										<TokenRow
											mode="points"
											key={i}
											data={{
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
