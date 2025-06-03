"use client";
import type { IToken } from "@autofun/types";
import ConnectToFleek from "../connect-fleek";
import FleekAgent from "../fleek-agent";
import { useQuery } from "@tanstack/react-query";
import { getAgent } from "@/lib/api";

export default function Agents({ token }: { token: IToken }) {
	const query = useQuery({
		queryKey: ["get-agent", token.contractAddress],
		queryFn: async () => {
			return await getAgent({
				contractAddress: token.contractAddress,
			});
		},
		enabled: true,
	});

	const agents = query.data;

	const hasAgents = Array.isArray(agents) && agents.length > 0;

	return (
		<div className="w-full p-4">
			{hasAgents ? <FleekAgent agents={agents} /> : <ConnectToFleek contractAddress={token.contractAddress} />}
		</div>
	);
}
