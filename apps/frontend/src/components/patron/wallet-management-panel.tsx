"use client";

import { isApiError } from "@/lib/api/_fetcher";
import {
	type PatronWallet,
	bindWallet,
	getNonce,
	listWallets,
	setPrimaryWallet,
	unlinkWallet,
} from "@/lib/api/wallets";
import { EASE_OUT_EXPO } from "@/lib/motion";
/**
 * WalletManagementPanel
 *
 * Patron-facing UI for managing the wallets bound to their account (W9.7).
 *
 *   1. List wallets bound via /v2/auth/siwe/wallets
 *   2. Bind the currently-connected wagmi wallet via SIWE sign + POST /bind
 *   3. Promote a wallet to primary
 *   4. Unlink a wallet (with confirm)
 *
 * SIWE message is built with viem's createSiweMessage so we don't need to add
 * the `siwe` npm package to the frontend; the backend (waifu-core) parses it
 * with the `siwe` package server-side and the EIP-4361 wire format is the
 * same either way.
 */
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage } from "wagmi";

function shortAddress(addr: string): string {
	return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
}

function shortConnected(addr: string): string {
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function errorMessage(err: unknown, fallback: string): string {
	if (isApiError(err)) return err.message;
	if (err instanceof Error) return err.message;
	return fallback;
}

export default function WalletManagementPanel() {
	const [wallets, setWallets] = useState<PatronWallet[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [linking, setLinking] = useState(false);

	const { address, chain, isConnected } = useAccount();
	const { signMessageAsync } = useSignMessage();
	const { openConnectModal } = useConnectModal();
	const reducedMotion = useReducedMotion();

	async function refresh() {
		setLoading(true);
		setError(null);
		try {
			const list = await listWallets();
			setWallets(list);
		} catch (err) {
			setError(errorMessage(err, "failed to load wallets"));
		} finally {
			setLoading(false);
		}
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: refresh is a stable closure; we only want a one-shot fetch on mount.
	useEffect(() => {
		void refresh();
	}, []);

	async function handleBindCurrent() {
		if (!address || !chain) {
			setError("connect a wallet first");
			return;
		}
		setLinking(true);
		setError(null);
		try {
			const { nonce } = await getNonce(address);
			const message = createSiweMessage({
				domain: window.location.host,
				address,
				statement: "link this wallet to your waifu.fun patron account.",
				uri: window.location.origin,
				version: "1",
				chainId: chain.id,
				nonce,
				issuedAt: new Date(),
			});
			const signature = await signMessageAsync({ message });
			await bindWallet({
				message,
				signature,
				setPrimary: wallets.length === 0,
			});
			await refresh();
		} catch (err) {
			setError(errorMessage(err, "bind failed"));
		} finally {
			setLinking(false);
		}
	}

	async function handleSetPrimary(addr: string) {
		setError(null);
		try {
			await setPrimaryWallet(addr);
			await refresh();
		} catch (err) {
			setError(errorMessage(err, "set primary failed"));
		}
	}

	async function handleUnlink(addr: string) {
		// Native confirm — single destructive action, no need for a custom modal.
		const ok = window.confirm("unlink this wallet? agents owned by it will become inaccessible until rebound.");
		if (!ok) return;
		setError(null);
		try {
			await unlinkWallet(addr);
			await refresh();
		} catch (err) {
			setError(errorMessage(err, "unlink failed"));
		}
	}

	const alreadyBound = Boolean(address) && wallets.some((w) => w.address.toLowerCase() === address?.toLowerCase());

	return (
		<div className="space-y-6">
			{/* Bind new wallet */}
			<div className="border border-stroke rounded-sm bg-surface-card p-6">
				<div className="flex items-center justify-between gap-4 flex-wrap">
					<div className="min-w-0">
						<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717a] mb-1">link new wallet</p>
						<p className="text-sm text-[#e4e4e7]">
							{isConnected && address ? (
								<>
									connected as <span className="font-mono">{shortConnected(address)}</span>
									{alreadyBound ? <span className="text-[#71717a]"> · already linked</span> : null}
								</>
							) : (
								"connect a wallet to bind it."
							)}
						</p>
					</div>
					{isConnected && address ? (
						<button
							type="button"
							onClick={handleBindCurrent}
							disabled={linking || alreadyBound}
							aria-label="link connected wallet"
							className="px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-sm transition-colors"
						>
							{linking ? "signing…" : "link wallet"}
						</button>
					) : (
						<button
							type="button"
							onClick={() => openConnectModal?.()}
							aria-label="connect wallet"
							className="px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] border border-stroke text-[#a1a1aa] hover:border-stroke-strong hover:text-[#e4e4e7] rounded-sm transition-colors"
						>
							connect wallet
						</button>
					)}
				</div>
			</div>

			{/* Wallet list */}
			<div className="space-y-2">
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">
					your wallets ({wallets.length})
				</p>
				{loading ? (
					<div className="border border-stroke rounded-sm bg-surface-card p-6 text-sm text-[#a1a1aa]">loading…</div>
				) : wallets.length === 0 ? (
					<div className="border border-stroke rounded-sm bg-surface-card p-8 text-center">
						<p className="text-sm text-[#a1a1aa]">no wallets linked yet.</p>
					</div>
				) : (
					<ul className="space-y-2">
						<AnimatePresence initial={false}>
							{wallets.map((w) => (
								<motion.li
									key={w.address}
									layout={reducedMotion ? false : "position"}
									initial={reducedMotion ? false : { opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
									transition={{
										duration: reducedMotion ? 0 : 0.3,
										ease: EASE_OUT_EXPO,
									}}
									className="border border-stroke rounded-sm bg-surface-card p-5 flex items-center justify-between gap-4 flex-wrap hover:border-stroke-strong transition-colors"
								>
									<div className="flex items-center gap-3 min-w-0">
										<span
											className={
												w.isPrimary
													? "w-2 h-2 rounded-full bg-accent shrink-0"
													: "w-2 h-2 rounded-full bg-stroke-strong shrink-0"
											}
											aria-hidden="true"
										/>
										<div className="min-w-0">
											<p className="font-mono text-sm text-[#e4e4e7] truncate">{shortAddress(w.address)}</p>
											<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717a] mt-1">
												chain {w.chainId} · linked {new Date(w.linkedAt).toLocaleDateString()}
												{w.isPrimary ? " · primary" : ""}
											</p>
										</div>
									</div>
									<div className="flex gap-2">
										{!w.isPrimary ? (
											<button
												type="button"
												onClick={() => handleSetPrimary(w.address)}
												aria-label={`set ${shortAddress(w.address)} as primary wallet`}
												className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] border border-stroke text-[#a1a1aa] hover:border-stroke-strong hover:text-[#e4e4e7] rounded-sm transition-colors"
											>
												set primary
											</button>
										) : null}
										<button
											type="button"
											onClick={() => handleUnlink(w.address)}
											aria-label={`unlink ${shortAddress(w.address)}`}
											className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] border border-stroke text-[#71717a] hover:border-[#f87171]/40 hover:text-[#f87171] rounded-sm transition-colors"
										>
											unlink
										</button>
									</div>
								</motion.li>
							))}
						</AnimatePresence>
					</ul>
				)}
			</div>

			{error ? (
				<div role="alert" className="border border-stroke-strong rounded-sm bg-surface-muted p-4">
					<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#f87171] mb-1">error</p>
					<p className="text-sm text-[#a1a1aa]">{error}</p>
				</div>
			) : null}
		</div>
	);
}
