/**
 * $WAIFU reconciliation registration page.
 *
 * The token was wound down (sunset 2026-06-26). The agent treasury sale proceeds
 * (~38.77 BNB) are being distributed back to holders pro-rata, net of BNB they
 * already realized by selling. Holders from the snapshot connect here, see if
 * they're eligible + their amount, and SIGN a message to book their spot. No
 * on-chain action, no gas. A merkle claim contract follows after the window.
 */

"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useDisconnect, useSignMessage } from "wagmi";

import {
	buildReconciliationMessage,
	checkEligibility,
	reconciliationSummary,
} from "@/lib/reconciliation/reconciliation";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun").replace(/\/$/, "");

type Phase = "idle" | "signing" | "registered" | "error";

export default function ReconciliationPage() {
	const summary = useMemo(() => reconciliationSummary(), []);
	const { address, isConnected } = useAccount();
	const { disconnect } = useDisconnect();
	const { openConnectModal } = useConnectModal();
	const { signMessageAsync } = useSignMessage();

	const [phase, setPhase] = useState<Phase>("idle");
	const [error, setError] = useState<string | null>(null);
	const [signature, setSignature] = useState<string | null>(null);

	const result = useMemo(() => checkEligibility(address), [address]);

	// Registration state is per-wallet. When the connected address changes (e.g.
	// the user switches wallets to register another eligible one), reset so the
	// signing flow is available again instead of showing the prior wallet's
	// success state.
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset is keyed on address change
	useEffect(() => {
		setPhase("idle");
		setSignature(null);
		setError(null);
	}, [address]);

	const handleRegister = useCallback(async () => {
		setError(null);
		if (!address || !result?.eligible) return;
		setPhase("signing");
		try {
			const issuedAt = new Date().toISOString();
			const origin = typeof window !== "undefined" ? window.location.origin : "";
			const message = buildReconciliationMessage({
				address: result.address,
				amountBnb: result.amountBnb,
				origin,
				issuedAt,
			});
			const sig = await signMessageAsync({ message });
			setSignature(sig);

			// Record the registration on the backend, which re-verifies the
			// signature + eligibility server-side and upserts the row. A non-ok
			// response surfaces an error; the signature is also shown below so the
			// holder keeps proof regardless.
			const res = await fetch(`${API_URL}/v3/reconciliation/register`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					address: result.address,
					message,
					signature: sig,
					issuedAt,
				}),
			});
			if (!res.ok) {
				const b = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
				throw new Error(b?.message ?? b?.error ?? "registration failed");
			}

			setPhase("registered");
		} catch (err) {
			setError(err instanceof Error ? err.message : "could not sign");
			setPhase("error");
		}
	}, [address, result, signMessageAsync]);

	return (
		<main className="mx-auto flex min-h-[100dvh] w-full max-w-[640px] flex-col gap-6 px-5 py-12">
			<header className="flex flex-col gap-2">
				<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-neutral-400">$WAIFU wind-down</span>
				<h1 className="text-2xl font-semibold text-neutral-100">Reconciliation</h1>
				<p className="text-sm leading-relaxed text-neutral-400">
					$WAIFU has been retired. The agent treasury sale proceeds ({summary.potBnb} BNB) are being distributed back to
					holders pro-rata, based on a snapshot at block {summary.snapshotBlock}, net of BNB already realized by
					selling. Connect the wallet you held in to check eligibility and book your spot. Signing is free and
					off-chain.
				</p>
			</header>

			<section className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
				{!isConnected ? (
					<button
						type="button"
						onClick={() => openConnectModal?.()}
						className="w-full rounded-lg bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white"
					>
						Connect wallet
					</button>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex items-center justify-between gap-3">
							<span className="truncate font-mono text-xs text-neutral-400">{address}</span>
							<button
								type="button"
								onClick={() => disconnect()}
								className="shrink-0 text-xs text-neutral-500 underline transition hover:text-neutral-300"
							>
								disconnect
							</button>
						</div>

						{result?.eligible ? (
							<div className="flex flex-col gap-4">
								<div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
									<div className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-500">Eligible</div>
									<div className="mt-1 text-2xl font-semibold text-neutral-100">{result.amountBnb} BNB</div>
								</div>

								{phase === "registered" ? (
									<div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 p-4 text-sm text-emerald-300">
										Spot booked. Your registration is recorded for the distribution. Keep your signature below as proof.
									</div>
								) : (
									<button
										type="button"
										onClick={handleRegister}
										disabled={phase === "signing"}
										className="w-full rounded-lg bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-900 transition hover:bg-white disabled:opacity-60"
									>
										{phase === "signing" ? "Signing..." : "Sign to book my spot"}
									</button>
								)}

								{signature ? (
									<details className="text-xs text-neutral-500">
										<summary className="cursor-pointer">your signature (proof)</summary>
										<code className="mt-2 block break-all rounded bg-neutral-900 p-2 font-mono text-[10px] text-neutral-400">
											{signature}
										</code>
									</details>
								) : null}
							</div>
						) : (
							<div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-sm text-neutral-400">
								This wallet isn't in the reconciliation snapshot, or its eligible amount nets to zero after accounting
								for BNB already realized by selling. If you believe this is an error, reach out.
							</div>
						)}
					</div>
				)}

				{error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
			</section>

			<footer className="text-xs text-neutral-600">
				{summary.eligibleCount} eligible wallets · {summary.totalPayoutBnb} BNB total · snapshot block{" "}
				{summary.snapshotBlock}
			</footer>
		</main>
	);
}
