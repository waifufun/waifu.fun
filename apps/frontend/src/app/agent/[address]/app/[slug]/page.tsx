/**
 * Mini app surface for an agent.
 *
 * URL: /agent/[address]/app/[slug]
 *
 * SCAFFOLD ONLY. design doc:
 * ~/.moltbot/projects/waifu/TRACK-C-MINIAPP-DESIGN-2026-05-25.md
 *
 * server component: fetches agent + app metadata. delegates run UI to client.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PersonaPixClient from "./PersonaPixClient";

type AppPageParams = { address: string; slug: string };

type AgentAppDetail = {
	appId: string;
	slug: string;
	agentTokenAddress: string;
	name: string;
	description: string | null;
	status: "live" | "paused" | "scheduled";
	pricing: {
		perCallUsdEstimate: number;
		currency: "credits";
		freeTier?: { callsPerDay: number };
	};
	elizaCloudAppId: string;
};

function serverApiBase(): string {
	const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
	if (configured?.startsWith("http")) return configured.replace(/\/+$/, "");
	return process.env.NODE_ENV !== "production" ? "http://localhost:3100" : "https://api.waifu.fun";
}

async function fetchAgentApp(address: string, slug: string): Promise<AgentAppDetail | null> {
	try {
		const res = await fetch(`${serverApiBase()}/v2/agents/${address}/apps/${slug}`, {
			next: { revalidate: 60 },
		});
		if (!res.ok) return null;
		const json = (await res.json()) as { ok?: boolean; data?: AgentAppDetail };
		if (!json.ok || !json.data) return null;
		return json.data;
	} catch {
		return null;
	}
}

export async function generateMetadata({ params }: { params: AppPageParams }): Promise<Metadata> {
	const app = await fetchAgentApp(params.address, params.slug);
	if (!app) return { title: "app not found" };
	return {
		title: `${app.name} — by ${params.address.slice(0, 8)} on waifu.fun`,
		description: app.description ?? undefined,
	};
}

export default async function MiniAppPage({ params }: { params: AppPageParams }) {
	const app = await fetchAgentApp(params.address, params.slug);
	if (!app || app.status !== "live") notFound();

	return (
		<main className="mx-auto max-w-3xl px-4 py-8">
			<header className="mb-6">
				<p className="text-xs uppercase tracking-wide text-zinc-500">
					mini app · {params.address.slice(0, 10)}…
				</p>
				<h1 className="text-2xl font-semibold text-zinc-100">{app.name}</h1>
				{app.description && <p className="mt-1 text-sm text-zinc-400">{app.description}</p>}
			</header>

			<PersonaPixClient
				elizaCloudAppId={app.elizaCloudAppId}
				agentTokenAddress={app.agentTokenAddress}
				appSlug={app.slug}
				pricing={app.pricing}
			/>
		</main>
	);
}
