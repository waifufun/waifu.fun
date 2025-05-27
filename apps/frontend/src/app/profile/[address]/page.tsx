import ProfileHeader from "@/components/profile-page/profile-header";
import TokenRow from "@/components/profile-page/token-row";
// import { useQuery } from "@tanstack/react-query";
// import { useParams } from "next/navigation";

export default function Page() {
	// boilerplate setup for when we have all profile routes ready

	// const params = useParams<{ address: string }>()
	// const query = useQuery({
	// 	queryKey: ["get-profile", params],
	// 	queryFn: async () => {
	// 		return await getProfile({
	//             address: params
	// 		});
	// 	},
	// });

	return (
		<div className="h-full mt-10 flex place-self-center w-full flex-col">
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
			<div>
            <TokenRow
				data={{
					tokenImageUrl: "/create/test-img.png",
					tokenTitle: "AlienToken",
					tokenTicker: "ALIEN",
					marketCap: 1240000,
					contractAddress: "0xa83114a443da1cecefc50368531cace9f37fcccb",
					amountHeld: 420,
					dollarWorth: 1337.42,
				}}
			/>

            </div>
		</div>
	);
}
