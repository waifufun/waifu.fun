"use client";

import { provisionCloudStorageKey } from "@/app/create/wizard/wizard-provision-success";
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
		return "session expired. reconnect your wallet and sign again.";
	}
	if (status === 403) {
		return "you're not the patron of this agent.";
	}
	if (status && status >= 500) {
		return "something broke on our side. try again in a moment.";
	}
	return err.message || "couldn't authorize the launch.";
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
	const [cloudProvision, setCloudProvision] = useState<CloudProvisionNotice | null>(null);

	useEffect(() => {
		const storageKey = `wf_agent_api_key:${agentId}`;
		const value = window.sessionStorage.getItem(storageKey);
		if (!value) return;
		setOneTimeAgentApiKey(value);
		window.sessionStorage.removeItem(storageKey);
	}, [agentId]);

	useEffect(() => {
		const storageKey = provisionCloudStorageKey({ ok: true, agentId });
		const value = window.sessionStorage.getItem(storageKey);
		if (!value) return;
		try {
			setCloudProvision(JSON.parse(value) as CloudProvisionNotice);
		} catch {
			// ignore corrupt one-time state
		}
		window.sessionStorage.removeItem(storageKey);
	}, [agentId]);

	const triggerLaunch = async (firstBuyWei: string) => {
		if (!launchId) {
			setAuthorizeError("launch hasn't been provisioned yet. refresh and try again.");
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
				title={agent?.name ?? "agent"}
				subtitle={
					agent
						? isLaunchReady
							? `pre-launch controls for ${agent.ticker}.`
							: `manage ${agent.ticker}, review recent activity.`
						: undefined
				}
				backHref="/patron"
			/>

			{/* The one-time agent api key reveal must render outside the
			isLaunchReady branch. After /v2/agents/provision succeeds with a
			tokenAddress, the agent's status becomes 'active' (not 'provisioned'),
			so a status-gated reveal would skip it and the key would be lost
			after the next render strips sessionStorage. Always render the
			reveal block at the top of the page when sessionStorage has a key,
			regardless of agent status. */}
			{oneTimeAgentApiKey ? (
				<div className="mb-6">
					<OneTimeAgentKeyBlock agentApiKey={oneTimeAgentApiKey} />
				</div>
			) : null}

			{cloudProvision ? (
				<div className="mb-6">
					<CloudProvisionBlock provision={cloudProvision} />
				</div>
			) : null}

			{error ? (
				<div role="alert" className="p-6 rounded-md border border-red-500/30 bg-red-500/5 text-sm text-red-300">
					Couldn't load agent. {(error as Error).message}
				</div>
			) : isLaunchReady ? (
				<div className="space-y-6 pb-24 md:pb-0">
					<LaunchReadyHero agent={agent} isLoading={isLoading} />
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

type CloudProvisionNotice = {
	cloudAgentId?: string;
	cloudStatus?: string;
	provisioningJobId?: string;
	webUiUrl?: string;
	logsUrl?: string;
};

function CloudProvisionBlock({ provision }: { provision: CloudProvisionNotice }) {
	const links = [
		provision.webUiUrl ? { label: "open cloud", href: provision.webUiUrl } : null,
		provision.logsUrl ? { label: "logs", href: provision.logsUrl } : null,
	].filter((link): link is { label: string; href: string } => Boolean(link));

	return (
		<section className="border border-[#00ff87]/30 bg-[#00ff87]/[0.04] p-4">
			<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">eliza cloud provisioning</p>
			<p className="mt-2 text-sm text-neutral-300 leading-relaxed max-w-[68ch]">
				hosted runtime request accepted
				{provision.cloudStatus ? `: ${provision.cloudStatus.replace(/_/g, " ")}` : "."}
			</p>
			<div className="mt-3 grid gap-1 text-[11px] font-mono text-neutral-400">
				{provision.cloudAgentId ? <p>cloud agent: {provision.cloudAgentId}</p> : null}
				{provision.provisioningJobId ? <p>job: {provision.provisioningJobId}</p> : null}
			</div>
			{links.length > 0 ? (
				<div className="mt-4 flex flex-wrap gap-2">
					{links.map((link) => (
						<a
							key={link.href}
							href={link.href}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center border border-[#00ff87]/30 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#00ff87] hover:bg-[#00ff87]/10"
						>
							{link.label}
						</a>
					))}
				</div>
			) : null}
		</section>
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
