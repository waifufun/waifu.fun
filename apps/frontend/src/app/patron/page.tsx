"use client";

import useAddress from "@/hooks/use-address";
import PatronHeader from "@/components/patron/patron-header";
import EmptyState from "@/components/patron/empty-state";
import AggregateStrip from "@/components/patron/aggregate-strip";
import AgentGrid from "@/components/patron/agent-grid";
import StewardOnboardingBanner from "@/components/patron/steward-onboarding-banner";
import { usePatronAgents } from "@/lib/api/patron";

export default function PatronPage() {
	const address = useAddress();
	const { data: agents, isLoading, error } = usePatronAgents(address);

	return (
		<main className="py-6">
			<PatronHeader title="your agents" subtitle="overview of the agents you've launched and their treasury state." />

			{!address ? (
				<EmptyState
					title="connect a wallet"
					body="sign in with your wallet to see the agents you've launched and their treasury state."
					ctaHref={null}
				/>
			) : (
				<>
					<StewardOnboardingBanner hasAgents={Boolean(agents && agents.length > 0)} />
					{agents && agents.length > 0 ? <AggregateStrip agents={agents} /> : null}
					<AgentGrid agents={agents} isLoading={isLoading} error={error as Error | null} />
					{!isLoading && !error && (!agents || agents.length === 0) ? (
						<EmptyState
							title="No agents yet"
							body="You haven't launched an agent with this wallet. Start one and it'll show up here."
						/>
					) : null}
				</>
			)}
		</main>
	);
}
