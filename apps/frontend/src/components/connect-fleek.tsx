'use client';
import Image from "next/image";
import { Button } from "./ui/button";
import { connectAgent } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export default function ConnectToFleek({ contractAddress, agentId }: { contractAddress: string; agentId: string }) {

	const { data, error, isLoading, refetch } = useQuery({
		queryKey: ["connect-agent", agentId],
		queryFn: async () => {
		  return await connectAgent({
			agentId: "agent1qww3ju3h6kfcuqf54gkghvt2pqe8qp97a7nzm2vp8plfxflc0epzcjsv79t",
			contractAddress: contractAddress,
		  });
		},
		enabled: false,
	  });

	  console.log("data", data)

	return (
		<div className="bg-[#0F0F0F] backdrop-blur-2xl min-w-[300px] max-w-[300px] rounded-md">
			<div className="p-4 flex flex-col text-center">
				<h1 className="font-semibold text-white text-2xl">
					Connect An <span className="text-autofun-background-action-highlight">Agent</span>
				</h1>
				<p className="text-white text-lg mt-4">Launch with Eliza on</p>
				<Image
					alt="fleek-logo"
					src="/fleek/fleek-logo.svg"
					height={50}
					width={70}
					className="mt-1 flex place-self-center"
				/>
				<Button
					className="mt-5 h-fit bg-transparent hover:bg-white/5 border border-autofun-background-action-highlight text-white"
					onClick={() => refetch()} // trigger the connection when clicked
					disabled={isLoading}
				>
					{isLoading ? "Connecting..." : "Import Agent"}
				</Button>

				{error && <p className="text-red-500 mt-2 text-sm">{(error as Error).message || "Failed to connect agent."}</p>}

				{data && data.success && <p className="text-green-500 mt-2 text-sm">Agent connected successfully!</p>}
			</div>
		</div>
	);
}
