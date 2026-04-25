"use client";

import { AuthGateLoader } from "@/components/auth/auth-gate-loader";
import AgentGrid from "@/components/patron/agent-grid";
import AggregateStrip from "@/components/patron/aggregate-strip";
import EmptyState from "@/components/patron/empty-state";
import PatronHeader from "@/components/patron/patron-header";
import StewardOnboardingBanner from "@/components/patron/steward-onboarding-banner";
import useAddress from "@/hooks/use-address";
import { useAuthRequired } from "@/hooks/use-auth-required";
import { usePatronAgents } from "@/lib/api/patron";

function PatronInner() {
	const address = useAddress();
	const { data: agents, isLoading, error } = usePatronAgents(address);

	return (
		<main className="py-6">
			<PatronHeader title="your agents" subtitle="overview of the agents you've launched and their treasury state." />

			{!address ? (
				<EmptyState
					title="connect a wallet"
					body="link a wallet to your account to see the agents you've launched and their treasury state."
					ctaHref={null}
				/>
			) : (
				<>
					<StewardOnboardingBanner hasAgents={Boolean(agents && agents.length > 0)} />
					{agents && agents.length > 0 ? <AggregateStrip agents={agents} /> : null}
					<AgentGrid agents={agents} isLoading={isLoading} error={error as Error | null} />
					{!isLoading && !error && (!agents || agents.length === 0) ? (
						<EmptyState
							title="no agents yet"
							body="you haven't launched an agent with this wallet. start one and it'll show up here."
						/>
					) : null}
				</>
			)}
		</main>
	);
}

export default function PatronPage() {
	const { isLoading, isAuthenticated } = useAuthRequired();
	if (isLoading) return <AuthGateLoader />;
	if (!isAuthenticated) return <AuthGateLoader label="redirecting to sign in" />;
	return <PatronInner />;
}
