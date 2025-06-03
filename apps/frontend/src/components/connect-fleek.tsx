"use client";
import Image from "next/image";
import { Button } from "./ui/button";
import { connectAgent } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "./ui/input";

export default function ConnectToFleek({ contractAddress }: { contractAddress: string }) {
	const [showInput, setShowInput] = useState<boolean>(false);
	const [agentId, setAgentId] = useState<string>("");
	const query = useQuery({
		queryKey: ["connect-agent", contractAddress],
		queryFn: async () => {
			return await connectAgent({
				agentId: agentId,
				contractAddress: contractAddress,
			});
		},
		enabled: false,
	});

	return (
		<div className="bg-[#0F0F0F] ƒlex place-self-center backdrop-blur-2xl min-w-[300px] max-w-[300px] rounded-md">
			<div className="p-4 flex flex-col text-center transition-all duration-300 ease-in-out">
				<h1 className="font-semibold text-white text-2xl">
					Connect An <span className="text-autofun-background-action-highlight">Agent</span>
				</h1>
				<p className="text-white text-lg mt-4">Launch with Eliza on</p>
				<Image alt="fleek-logo" src="/fleek/fleek-logo.svg" height={50} width={70} className="mt-1 self-center" />

				{!showInput && (
					<Button
						onClick={() => setShowInput((prev) => !prev)}
						className="mt-5 h-fit bg-transparent hover:bg-white/5 border border-autofun-background-action-highlight text-white transition-all"
					>
						Import Fleek Agent
					</Button>
				)}

				<div
					className={`overflow-hidden transition-all duration-300 ease-in-out ${
						showInput ? "max-h-40 mt-4" : "max-h-0"
					}`}
				>
					{showInput && (
						<div className="flex flex-col items-center gap-2">
							<p className="text-white text-sm">Fill in Agent ID</p>
							<Input
								value={agentId}
								onChange={(e) => setAgentId(e.target.value)}
								placeholder="Enter agent ID"
								className="text-white bg-transparent border-white/20"
							/>
							{query.error && <p className="text-red-500 text-sm">Something went wrong.</p>}{" "}
							<Button
								onClick={query.refetch}
								className="mt-2 bg-autofun-background-action-highlight text-black hover:bg-opacity-90"
								disabled={query.isFetching}
							>
								{query.isFetching ? "Submitting..." : "Submit"}
							</Button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
