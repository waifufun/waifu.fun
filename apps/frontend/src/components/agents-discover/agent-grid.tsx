import AgentCard from "./agent-card";
import type { AgentListItem } from "./types";

export default function AgentGrid({ agents }: { agents: AgentListItem[] }) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
			{agents.map((agent) => (
				<AgentCard key={agent.tokenAddress} agent={agent} />
			))}
		</div>
	);
}
