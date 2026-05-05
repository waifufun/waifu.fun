"use client";

import PromptBlock from "@/components/give-skill/prompt-block";
import ActivityFeed from "@/components/patron/activity-feed";
import AgentHero from "@/components/patron/agent-hero";
import EmergencyControls from "@/components/patron/emergency-controls";
import LaunchPanel from "@/components/patron/launch-panel";
import LaunchProgress from "@/components/patron/launch-progress";
import LaunchReadyHero from "@/components/patron/launch-ready-hero";
import PatronHeader from "@/components/patron/patron-header";
import PolicyEditor from "@/components/patron/policy-editor";
import RuntimeConnectionPanel from "@/components/patron/runtime-connection-panel";
import TreasuryCard from "@/components/patron/treasury-card";
import WhatHappensNext from "@/components/patron/what-happens-next";
import XConnectionPanel from "@/components/patron/x-connection";
import { useAuthorizeLaunch } from "@/lib/api/launches";
import { useAgentDetail, useAgentEvents } from "@/lib/api/patron";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

type Params = { agentId: string };

function authorizeErrorMessage(err: Error & { status?: number | null }): string {
	const status = err.status ?? null;
	if (status === 401) {
		return "Your session expired. Reconnect your wallet and sign again.";
	}
	if (status === 403) {
		return "You're not the patron of this agent.";
	}
	if (status && status >= 500) {
		return "Something went wrong on our side. Try again in a moment.";
	}
	return err.message || "Couldn't authorize the launch.";
}

export default function PatronAgentDetailPage({
	params,
}: {
	params: Promise<Params>;
}) {
	const router = useRouter();
	const { agentId } = use(params);
	const { data: agent, isLoading, error } = useAgentDetail(agentId);
	const { data: events, isLoading: eventsLoading, error: eventsError } = useAgentEvents(agentId);

	const isLaunchReady = agent?.status === "provisioned";
	const launchId = agent?.launchId ?? null;
	const authorize = useAuthorizeLaunch(launchId ?? undefined);

	const [progressOpen, setProgressOpen] = useState(false);
	const [authorizeError, setAuthorizeError] = useState<string | null>(null);
	const [pendingFirstBuy, setPendingFirstBuy] = useState<string | null>(null);
	const [oneTimeAgentApiKey, setOneTimeAgentApiKey] = useState<string | null>(null);

	useEffect(() => {
		const storageKey = `wf_agent_api_key:${agentId}`;
		const value = window.sessionStorage.getItem(storageKey);
		if (!value) return;
		setOneTimeAgentApiKey(value);
		window.sessionStorage.removeItem(storageKey);
	}, [agentId]);

	const triggerLaunch = async (firstBuyWei: string) => {
		if (!launchId) {
			setAuthorizeError("Launch hasn't been provisioned yet. Refresh and try again.");
			setProgressOpen(true);
			return;
		}
		setAuthorizeError(null);
		setPendingFirstBuy(firstBuyWei);
		setProgressOpen(true);
		try {
			await authorize.mutateAsync({ firstBuyWei });
		} catch (err) {
			const e = err as Error & { status?: number | null };
			setAuthorizeError(authorizeErrorMessage(e));
		}
	};

	const handleRetry = () => {
		if (!pendingFirstBuy) {
			setProgressOpen(false);
			return;
		}
		void triggerLaunch(pendingFirstBuy);
	};

	const handleLive = (tokenAddress: string | null | undefined) => {
		if (tokenAddress) {
			router.push(`/agent/${tokenAddress}`);
		} else {
			// Fallback: refresh the page so the post-launch dashboard renders.
			router.refresh();
			setProgressOpen(false);
		}
	};

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
				<div className="space-y-6 pb-24 md:pb-0">
					<LaunchReadyHero agent={agent} isLoading={isLoading} />
					{oneTimeAgentApiKey ? <OneTimeAgentKeyBlock agentApiKey={oneTimeAgentApiKey} /> : null}
					<LaunchPanel
						agentId={agentId}
						safeAddress={agent?.safeAddress ?? null}
						onLaunch={triggerLaunch}
						isLaunching={authorize.isPending}
					/>
					<WhatHappensNext />
					<div id="x-account" className="scroll-mt-6">
						<XConnectionPanel agentId={agentId} />
					</div>

					<LaunchProgress
						open={progressOpen}
						launchId={launchId ?? undefined}
						ticker={agent?.ticker ?? null}
						initialStage="authorizing"
						errorOverride={authorizeError}
						onClose={() => setProgressOpen(false)}
						onLive={handleLive}
						onRetry={handleRetry}
					/>
				</div>
			) : (
				<div className="space-y-6">
					<AgentHero agent={agent} isLoading={isLoading} />
					<RuntimeConnectionPanel agent={agent} isLoading={isLoading} />
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

function OneTimeAgentKeyBlock({ agentApiKey }: { agentApiKey: string }) {
	return (
		<section className="border border-[#00ff87]/30 bg-[#00ff87]/[0.04] p-4">
			<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">agent api key</p>
			<p className="mt-2 text-sm text-neutral-300 leading-relaxed max-w-[68ch]">
				copy this now. we won't show it again after this page load. use it as the agent's bearer credential for launch
				and runtime-scoped API calls.
			</p>
			<PromptBlock prompt={agentApiKey} className="mt-4" />
		</section>
	);
}
