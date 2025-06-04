'use client';
import type { IAgent, IToken } from "@autofun/types";
import FleekAgent from "../fleek-agent";
import ConnectToFleek from "../connect-fleek";
import useAddress from "@/hooks/use-address";

export default function Agents({ agents, token }: { agents: IAgent[]; token: IToken }) {
	const address = useAddress();
	const isCreatorConnected = address === token?.creator;
	return (
		<div className="w-full space-y-4">
			{!agents ? (
				<div className="bg-[#0F0F0F] w-fit place-self-center p-5 rounded-md">
					<h1 className="text-white place-self-center text-lg font-semibold">
						No Agents have been connected to this token
					</h1>
				</div>
			) : null}
			{agents ? (
				<FleekAgent agents={agents} />
			) : isCreatorConnected ? (
				<div className="mt-4">
					<ConnectToFleek token={token} />
				</div>
			) : null}
		</div>
	);
}
