"use client";

import useAddress from "@/hooks/use-address";
import PatronHeader from "@/components/patron/patron-header";
import EmptyState from "@/components/patron/empty-state";

export default function PatronPage() {
	const address = useAddress();

	return (
		<main className="py-6">
			<PatronHeader
				title="Your Agents"
				subtitle="Overview of the agents you've launched and their treasury state."
			/>

			{!address ? (
				<EmptyState
					title="Connect a wallet"
					body="Sign in with your Solana wallet to see the agents you've launched and their treasury state."
					ctaLabel="Open wallet menu"
					ctaHref="#"
				/>
			) : (
				<EmptyState
					title="No agents yet"
					body="You haven't launched an agent with this wallet. Start one and it'll show up here."
				/>
			)}
		</main>
	);
}
