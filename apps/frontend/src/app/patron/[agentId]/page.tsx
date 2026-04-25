"use client";

import { use } from "react";
import PatronHeader from "@/components/patron/patron-header";
import AgentHero from "@/components/patron/agent-hero";
import LaunchReadyHero from "@/components/patron/launch-ready-hero";
import TreasuryCard from "@/components/patron/treasury-card";
import ActivityFeed from "@/components/patron/activity-feed";
import PolicyEditor from "@/components/patron/policy-editor";
import EmergencyControls from "@/components/patron/emergency-controls";
import XConnectionPanel from "@/components/patron/x-connection";
import { useAgentDetail, useAgentEvents } from "@/lib/api/patron";

type Params = { agentId: string };

export default function PatronAgentDetailPage({
	params,
}: {
	params: Promise<Params>;
}) {
	const { agentId } = use(params);
	const { data: agent, isLoading, error } = useAgentDetail(agentId);
	const { data: events, isLoading: eventsLoading, error: eventsError } = useAgentEvents(agentId);

	const isLaunchReady = agent?.status === "provisioned";

	return (
		<main className="py-6">
			<PatronHeader
				title={agent?.name ?? "Agent"}
				subtitle={
					agent
						? isLaunchReady
							? `Pre-launch controls for ${agent.ticker}.`
							: `Manage ${agent.ticker} and review recent activity.`
						: undefined
				}
				backHref="/patron"
			/>

			{error ? (
				<div role="alert" className="p-6 rounded-md border border-red-500/30 bg-red-500/5 text-sm text-red-300">
					Couldn't load agent. {(error as Error).message}
				</div>
			) : isLaunchReady ? (
				<div className="space-y-6">
					<LaunchReadyHero agent={agent} isLoading={isLoading} />
					{/* LaunchPanel + supporting cards land in commit 2 */}
					<XConnectionPanel agentId={agentId} />
				</div>
			) : (
				<div className="space-y-6">
					<AgentHero agent={agent} isLoading={isLoading} />
					<XConnectionPanel agentId={agentId} />
					<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
						<TreasuryCard agent={agent} isLoading={isLoading} />
						<ActivityFeed events={events} isLoading={eventsLoading} error={eventsError as Error | null} />
					</div>
					<PolicyEditor agentId={agentId} />
					<EmergencyControls />
				</div>
			)}
		</main>
	);
}
