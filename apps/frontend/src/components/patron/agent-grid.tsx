"use client";

import type { PatronAgent } from "@/lib/api/patron";
import AgentCard from "./agent-card";
import { Skeleton } from "@/components/ui/skeleton";

type Props = {
	agents: PatronAgent[] | undefined;
	isLoading: boolean;
	error: Error | null;
};

export default function AgentGrid({ agents, isLoading, error }: Props) {
	if (isLoading) {
		return (
			<div
				className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
				aria-busy="true"
				aria-label="Loading agents"
			>
				{[0, 1, 2].map((i) => (
					<Skeleton key={i} className="h-[220px] rounded-sm" />
				))}
			</div>
		);
	}

	if (error) {
		return (
			<div role="alert" className="p-6 rounded-sm border border-red-500/30 bg-red-500/5 text-sm text-red-300">
				Couldn't load your agents. {error.message}
			</div>
		);
	}

	if (!agents || agents.length === 0) {
		return null;
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{agents.map((agent) => (
				<AgentCard key={agent.id} agent={agent} />
			))}
		</div>
	);
}
