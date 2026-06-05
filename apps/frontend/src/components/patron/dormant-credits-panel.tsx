/**
 * Dormant-agent funding surface (patron page).
 *
 * Shown when an agent is dormant (out of inference credits). It makes the
 * funding choices HONEST and distinct, because today they are two physically
 * separate value transfers:
 *
 *   1. ADD INFERENCE CREDITS  → wakes the brain. Buys Eliza Cloud credits via
 *      the `/v2/agents/:id/resurrect` path. This is NOT funded by the on-chain
 *      Safe today; it initiates a credit purchase (Stripe checkout).
 *
 *   2. FUND TREASURY (BSC)    → trading capital. The on-chain TopUpPanel routes
 *      patron funds (default BNB Chain) into the agent Safe via Li.Fi. This
 *      raises treasury NAV + runway DISPLAY, but does NOT add inference credits
 *      and does NOT wake the agent on its own.
 *
 * The BNB->credits bridge that would unify these (fund on-chain -> auto-wake)
 * is designed but not yet shipped. See BNB-CREDITS-BRIDGE-DESIGN-2026-06-03.
 * Until it ships, we do NOT imply that funding the Safe wakes the brain.
 *
 * UI follows the patron-page grammar: lowercase copy, single accent, honest
 * empty/partial states, no em-dashes, no fake precision.
 */

"use client";

import { useState } from "react";

import { TopUpPanel } from "@/components/agent-home/wave-t/topup-panel";
import { type AgentDetail, useResurrectAgent } from "@/lib/api/patron";

// BNB Chain. Shadow wants on-chain BSC funding as the default treasury path.
const BNB_CHAIN_ID = 56;

// Preset inference-credit amounts (USD). Sent to the API as USD cents.
const CREDIT_PRESETS_USD = [5, 10, 25, 50] as const;

function isExternalUrl(value: string | null | undefined): value is string {
	return typeof value === "string" && /^https?:\/\//i.test(value);
}

export default function DormantCreditsPanel({ agent }: { agent: AgentDetail }) {
	const agentId = agent.id;
	const ticker = agent.ticker || "agent";
	const tokenAddress = agent.tokenAddress ?? null;

	const resurrect = useResurrectAgent(agentId);
	const [selectedUsd, setSelectedUsd] = useState<number>(10);
	const [notice, setNotice] = useState<string | null>(null);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const onAddCredits = async () => {
		setNotice(null);
		setErrorMsg(null);
		try {
			const res = await resurrect.mutateAsync({ creditsAmountCents: Math.round(selectedUsd * 100) });
			const url = res.checkoutUrl ?? res.url ?? null;
			if (isExternalUrl(url)) {
				// Credit purchase needs payment: send the patron to checkout.
				window.location.assign(url);
				return;
			}
			setNotice("credit purchase initiated. the agent wakes once the credits land (eliza cloud confirms the top-up).");
		} catch (err) {
			setErrorMsg(err instanceof Error ? err.message : "couldn't start the credit purchase. try again.");
		}
	};

	return (
		<section className="space-y-4">
			<div className="rounded-md border border-stroke-strong bg-[#0a0a0a] p-5">
				<div className="flex items-center gap-2">
					<span className="h-1.5 w-1.5 rounded-full bg-[#71717a]" aria-hidden />
					<h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#a1a1aa]">
						{ticker.toLowerCase()} is dormant
					</h2>
				</div>
				<p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-neutral-400">
					the agent ran out of inference credits and paused its brain. there are two separate things you can fund. they
					are not the same pool today.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
				{/* PRIMARY: wake the brain (inference credits) */}
				<div className="flex flex-col rounded-md border border-[#00ff87]/30 bg-[#00ff87]/[0.03] p-5">
					<div className="flex items-center justify-between">
						<h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#00ff87]">add inference credits</h3>
						<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#00ff87]/70">wakes the agent</span>
					</div>
					<p className="mt-2 text-[13px] leading-relaxed text-neutral-300">
						buys eliza cloud inference credits so the brain can think again. this is what actually resurrects the agent.
					</p>

					<div className="mt-4 flex flex-wrap gap-2">
						{CREDIT_PRESETS_USD.map((usd) => (
							<button
								key={usd}
								type="button"
								onClick={() => setSelectedUsd(usd)}
								className={
									selectedUsd === usd
										? "rounded border border-[#00ff87]/60 bg-[#00ff87]/10 px-3 py-1.5 font-mono text-[12px] text-[#00ff87]"
										: "rounded border border-stroke-strong bg-transparent px-3 py-1.5 font-mono text-[12px] text-neutral-300 hover:border-[#00ff87]/40"
								}
							>
								${usd}
							</button>
						))}
					</div>

					<button
						type="button"
						onClick={onAddCredits}
						disabled={resurrect.isPending}
						className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-[#00ff87] py-3 font-mono text-[12px] uppercase tracking-[0.2em] text-[#03110b] transition-colors hover:bg-[#00ff87]/80 disabled:cursor-not-allowed disabled:opacity-40"
					>
						{resurrect.isPending ? "starting checkout" : `add $${selectedUsd} credits and wake`}
					</button>

					{notice ? (
						<p className="mt-3 rounded border border-[#00ff87]/30 bg-[#00ff87]/[0.06] p-2 font-mono text-[10px] text-[#00ff87]">
							{notice}
						</p>
					) : null}
					{errorMsg ? (
						<p className="mt-3 rounded border border-red-500/30 bg-red-500/[0.06] p-2 font-mono text-[10px] text-red-400">
							{errorMsg}
						</p>
					) : null}

					<p className="mt-3 font-mono text-[9px] leading-relaxed text-neutral-500">
						note: credits are a separate purchase from the on-chain treasury. funding the safe (right) does not add
						credits or wake the brain yet. an on-chain bnb to credits bridge is in design.
					</p>
				</div>

				{/* SECONDARY: fund treasury on BSC (trading capital, honest) */}
				<div className="flex flex-col gap-2">
					<div className="rounded-md border border-stroke-strong bg-[#0a0a0a] px-4 py-3">
						<div className="flex items-center justify-between">
							<h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-neutral-300">fund treasury (bsc)</h3>
							<span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">trading capital</span>
						</div>
						<p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
							sends on-chain funds into the agent safe (defaults to bnb chain). this is trading capital. it raises
							treasury value and runway display, but does not add inference credits and does not wake the brain on its
							own today.
						</p>
					</div>
					{tokenAddress ? (
						<TopUpPanel agentTokenAddress={tokenAddress} agentTicker={ticker} defaultChainId={BNB_CHAIN_ID} />
					) : (
						<div className="rounded-md border border-stroke-strong bg-[#0a0a0a] p-4 font-mono text-[11px] text-neutral-500">
							on-chain treasury funding unavailable: this agent has no launched token address yet.
						</div>
					)}
				</div>
			</div>
		</section>
	);
}
