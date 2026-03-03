"use client";
import type { IAgent, IToken } from "@waifufun/types";
import FleekAgent from "../fleek-agent";
import ConnectToFleek from "../connect-fleek";

export default function Agents({ agents, token }: { agents: IAgent[]; token: IToken }) {
	return (
		<div className="w-full space-y-4">
			{agents?.length > 0 ? (
				<FleekAgent agents={agents} />
			) : (
				<div className="p-4 py-8 text-center w-full text-sm text-waifufun-text-secondary">
					There are currently no connected agents.
				</div>
			)}
			<div className="mt-4">
				<ConnectToFleek token={token} />
			</div>
		</div>
	);
}
