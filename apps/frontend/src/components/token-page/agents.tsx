"use client";
import type { IAgent, IToken } from "@autofun/types";
import FleekAgent from "../fleek-agent";
import ConnectToFleek from "../connect-fleek";
import useAddress from "@/hooks/use-address";

export default function Agents({ agents, token }: { agents: IAgent[]; token: IToken }) {
	const address = useAddress();
	const isCreatorConnected = address === token?.creator;
	return (
		<div className="w-full space-y-4">
			{agents?.length > 1 ? (
				<FleekAgent agents={agents} />
			) : (
				<div className="p-4 py-8 text-center w-full text-sm text-autofun-text-secondary">
					There are currently no connected agents.
				</div>
			)}
			<div className="mt-4">
				<ConnectToFleek token={token} />
			</div>
			{isCreatorConnected ? (
				<div className="mt-4">
					<ConnectToFleek token={token} />
				</div>
			) : null}
		</div>
	);
}
