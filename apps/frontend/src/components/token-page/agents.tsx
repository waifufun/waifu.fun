"use client";
import type { IAgent, IToken } from "@waifufun/types";
import FleekAgent from "../fleek-agent";

export default function Agents({ agents, token }: { agents: IAgent[]; token: IToken }) {
	return (
		<div className="w-full space-y-4">
			{agents?.length > 0 ? (
				<FleekAgent agents={agents} />
			) : (
				<div className="p-4 py-8 text-center w-full text-sm text-[#71717a] font-mono lowercase">
					<p>No connected agents.</p>
					<p className="mt-2 text-xs text-[#52525b]">Agent connection features coming soon.</p>
				</div>
			)}
		</div>
	);
}
