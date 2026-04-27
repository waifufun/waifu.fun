"use client";

import Link from "next/link";

import AgentGrid from "@/components/patron/agent-grid";
import AggregateStrip from "@/components/patron/aggregate-strip";
import EmptyState from "@/components/patron/empty-state";
import PatronHeader from "@/components/patron/patron-header";
import useAddress from "@/hooks/use-address";
import { useWaifuMe } from "@/hooks/use-waifu-me";
import { usePatronAgents } from "@/lib/api/patron";

export default function PatronPage() {
	const address = useAddress();
	const { me } = useWaifuMe();
	// Prefer the wallet-bound owner filter when a wallet is connected; fall
	// back to the cookie-session ?mine=true path when only patron-authed.
	const { data: agents, isLoading, error } = usePatronAgents(address ?? undefined);

	return (
		<main className="py-6">
			<PatronHeader title="your agents" subtitle="overview of the agents you've launched and their treasury state." />

			{agents && agents.length > 0 ? <AggregateStrip agents={agents} /> : null}
			<AgentGrid agents={agents} isLoading={isLoading} error={error as Error | null} />

			{!isLoading && !error && (!agents || agents.length === 0) ? (
				<EmptyState
					title="no agents yet"
					body={
						address
							? "you haven't launched an agent with this wallet yet."
							: me?.wallets.length
								? "you haven't launched an agent yet."
								: "link a wallet on the wallets page, then launch your first agent."
					}
					ctaHref="/create/wizard"
				/>
			) : null}

			{!address && me && me.wallets.length === 0 ? (
				<div className="mt-6 rounded-sm border border-white/10 bg-[rgba(255,255,255,0.02)] px-4 py-3 text-sm text-[#a1a1aa]">
					you're signed in but haven't linked a wallet.{" "}
					<Link href="/patron/wallets" className="text-[#00ff87] hover:underline">
						link a wallet
					</Link>{" "}
					to launch agents on bsc.
				</div>
			) : null}
		</main>
	);
}
