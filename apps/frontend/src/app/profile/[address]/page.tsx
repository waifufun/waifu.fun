import ProfileHeader from "@/components/profile-page/profile-header";

export default function Page() {
	return (
		<div className="h-full flex place-self-center w-full">
			<ProfileHeader
				data={{
					username: "AlienMaster42",
					address: "0xa83114a443da1cecefc50368531cace9f37fcccb",
					tokensBought: 128,
					tokensCreated: 42,
				}}
			/>
		</div>
	);
}
