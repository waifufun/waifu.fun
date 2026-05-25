"use client";

/**
 * Client component for the persona-pix mini app surface.
 *
 * SCAFFOLD ONLY. design doc:
 * ~/.moltbot/projects/waifu/TRACK-C-MINIAPP-DESIGN-2026-05-25.md
 *
 * responsibilities:
 *   - show user's app-credit balance (header)
 *   - prompt + style picker form
 *   - POST run, show result image
 *   - refetch balance on each run
 */

import { useState } from "react";
import { AppCreditsHeader } from "@/components/mini-apps/AppCreditsHeader";

type Props = {
	elizaCloudAppId: string;
	agentTokenAddress: string;
	appSlug: string;
	pricing: { perCallUsdEstimate: number; freeTier?: { callsPerDay: number } };
};

type RunResult =
	| { kind: "idle" }
	| { kind: "running" }
	| { kind: "success"; imageUrl: string; cost: number; balanceAfter: number }
	| { kind: "error"; message: string };

export default function PersonaPixClient(props: Props) {
	const [prompt, setPrompt] = useState("");
	const [style, setStyle] = useState<"seedream-4.5" | "flux-2-pro">("seedream-4.5");
	const [result, setResult] = useState<RunResult>({ kind: "idle" });

	// TODO: wire to swr or react-query. for scaffold, useState only.
	const [refreshCounter, setRefreshCounter] = useState(0);

	async function handleRun(event: React.FormEvent) {
		event.preventDefault();
		if (!prompt.trim()) return;
		setResult({ kind: "running" });

		// TODO: pull privy token from steward auth context
		// const token = await getPrivyToken();
		try {
			const res = await fetch(
				`/api/v2/agents/${props.agentTokenAddress}/apps/${props.appSlug}/run`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						// Authorization: `Bearer ${token}`,
					},
					body: JSON.stringify({ prompt, style, aspect: "3:4" }),
				},
			);
			const json = (await res.json()) as
				| {
						ok: true;
						data: { imageUrl: string; cost: { totalCost: number }; balanceAfter: number };
				  }
				| { ok: false; error: string };

			if (!json.ok) {
				setResult({ kind: "error", message: json.error });
				return;
			}

			setResult({
				kind: "success",
				imageUrl: json.data.imageUrl,
				cost: json.data.cost.totalCost,
				balanceAfter: json.data.balanceAfter,
			});
			setRefreshCounter((n) => n + 1); // nudge balance header to refetch
		} catch (err) {
			setResult({ kind: "error", message: err instanceof Error ? err.message : "unknown error" });
		}
	}

	return (
		<div className="space-y-6">
			<AppCreditsHeader
				elizaCloudAppId={props.elizaCloudAppId}
				perCallUsdEstimate={props.pricing.perCallUsdEstimate}
				refreshNonce={refreshCounter}
			/>

			<form onSubmit={handleRun} className="space-y-3 rounded-lg border border-zinc-800 p-4">
				<label className="block text-sm">
					<span className="text-zinc-400">prompt</span>
					<textarea
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder="sol on a rooftop in denver at golden hour"
						rows={3}
						className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-zinc-100 outline-none focus:ring-1 focus:ring-amber-400"
					/>
				</label>

				<label className="block text-sm">
					<span className="text-zinc-400">style</span>
					<select
						value={style}
						onChange={(e) => setStyle(e.target.value as typeof style)}
						className="mt-1 w-full rounded bg-zinc-900 px-3 py-2 text-zinc-100"
					>
						<option value="seedream-4.5">seedream 4.5 (character-locked)</option>
						<option value="flux-2-pro">flux 2 pro (editorial)</option>
					</select>
				</label>

				<button
					type="submit"
					disabled={result.kind === "running" || !prompt.trim()}
					className="rounded bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
				>
					{result.kind === "running" ? "generating…" : "generate"}
				</button>
				<p className="text-xs text-zinc-500">
					~${props.pricing.perCallUsdEstimate.toFixed(2)} per image
				</p>
			</form>

			{result.kind === "success" && (
				<div className="rounded-lg border border-zinc-800 p-4">
					<img
						src={result.imageUrl}
						alt="generated"
						className="w-full rounded"
					/>
					<p className="mt-2 text-xs text-zinc-500">
						cost: ${result.cost.toFixed(3)} · balance after: ${result.balanceAfter.toFixed(2)}
					</p>
				</div>
			)}
			{result.kind === "error" && (
				<div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
					{result.message === "insufficient_app_credits"
						? "out of credits. top up to keep going."
						: result.message}
				</div>
			)}

			{/* TODO: <RecentRunsRail /> — fetch /v2/agents/:t/apps/:s/runs and render */}
		</div>
	);
}
