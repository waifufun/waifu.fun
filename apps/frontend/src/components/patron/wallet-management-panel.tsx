"use client";

import { useLinkedEoa } from "@/hooks/use-linked-eoa";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

function shortAddress(addr: string): string {
	return `${addr.slice(0, 10)}...${addr.slice(-8)}`;
}

function explorerUrl(addr: string): string {
	return `https://bscscan.com/address/${addr}`;
}

function errorMessage(err: unknown, fallback: string): string {
	if (err instanceof Error) return err.message;
	return fallback;
}

export default function WalletManagementPanel() {
	const { primaryAddress, me, refetch } = useWaifuAuth();
	const linked = useLinkedEoa();
	const reducedMotion = useReducedMotion();
	const [error, setError] = useState<string | null>(null);
	const [busyAddress, setBusyAddress] = useState<string | null>(null);
	const [linking, setLinking] = useState(false);
	const [linkAfterConnect, setLinkAfterConnect] = useState(false);

	const linkedWallets = me.data?.linkedWallets ?? [];

	async function handleCopy(addr: string) {
		await navigator.clipboard?.writeText(addr).catch(() => undefined);
	}

	async function linkCurrentWallet() {
		setLinking(true);
		try {
			await linked.link();
			await refetch();
		} finally {
			setLinking(false);
		}
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once when RainbowKit supplies an address after the wallet CTA opened it.
	useEffect(() => {
		if (!linkAfterConnect || !linked.address) return;
		setLinkAfterConnect(false);
		linkCurrentWallet().catch((err) => setError(errorMessage(err, "link failed")));
	}, [linkAfterConnect, linked.address]);

	async function handleLink() {
		setError(null);
		try {
			if (!linked.address) {
				setLinkAfterConnect(true);
				linked.openConnectModal();
				return;
			}
			await linkCurrentWallet();
		} catch (err) {
			setError(errorMessage(err, "link failed"));
		}
	}

	async function handleUnlink(addr: string) {
		const ok = window.confirm("unlink this external wallet?");
		if (!ok) return;
		setError(null);
		setBusyAddress(addr);
		try {
			await linked.unlink(addr);
			await refetch();
		} catch (err) {
			setError(errorMessage(err, "unlink failed"));
		} finally {
			setBusyAddress(null);
		}
	}

	return (
		<div id="wallet-management" className="space-y-6">
			<div className="border border-stroke rounded-sm bg-surface-card p-6">
				<div className="flex items-start justify-between gap-4 flex-wrap">
					<div className="min-w-0">
						<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717a] mb-1">
							primary Steward wallet
						</p>
						<p className="text-sm font-mono text-[#e4e4e7] break-all">{primaryAddress ?? "loading..."}</p>
						<p className="mt-2 text-xs text-[#71717a]">read-only owner for sign-in and default Safe control.</p>
					</div>
					{primaryAddress ? (
						<div className="flex gap-2">
							<button
								type="button"
								onClick={() => handleCopy(primaryAddress)}
								className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] border border-stroke text-[#a1a1aa] hover:border-stroke-strong hover:text-[#e4e4e7] rounded-sm transition-colors"
							>
								copy
							</button>
							<a
								href={explorerUrl(primaryAddress)}
								target="_blank"
								rel="noreferrer"
								className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] border border-stroke text-[#a1a1aa] hover:border-stroke-strong hover:text-[#e4e4e7] rounded-sm transition-colors"
							>
								explorer
							</a>
						</div>
					) : null}
				</div>
			</div>

			<div className="space-y-2">
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">
					linked external wallets ({linkedWallets.length})
				</p>
				{linkedWallets.length === 0 ? (
					<div className="border border-stroke rounded-sm bg-surface-card p-8 text-center">
						<p className="text-sm text-[#a1a1aa]">no external wallets linked yet.</p>
					</div>
				) : (
					<ul className="space-y-2">
						<AnimatePresence initial={false}>
							{linkedWallets.map((wallet) => (
								<motion.li
									key={wallet.address}
									layout={reducedMotion ? false : "position"}
									initial={reducedMotion ? false : { opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
									transition={{ duration: reducedMotion ? 0 : 0.3, ease: EASE_OUT_EXPO }}
									className="border border-stroke rounded-sm bg-surface-card p-5 flex items-center justify-between gap-4 flex-wrap hover:border-stroke-strong transition-colors"
								>
									<div className="min-w-0">
										<p className="font-mono text-sm text-[#e4e4e7] truncate">{shortAddress(wallet.address)}</p>
										<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717a] mt-1">
											label external signer · linked{" "}
											{wallet.addedAt ? new Date(wallet.addedAt).toLocaleDateString() : "recently"}
										</p>
									</div>
									<div className="flex gap-2">
										<button
											type="button"
											onClick={() => handleCopy(wallet.address)}
											className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] border border-stroke text-[#a1a1aa] hover:border-stroke-strong hover:text-[#e4e4e7] rounded-sm transition-colors"
										>
											copy
										</button>
										<button
											type="button"
											onClick={() => handleUnlink(wallet.address)}
											disabled={busyAddress === wallet.address}
											aria-label={`unlink ${shortAddress(wallet.address)}`}
											className="px-3 py-1.5 text-[10px] font-mono uppercase tracking-[0.18em] border border-stroke text-[#71717a] hover:border-[#f87171]/40 hover:text-[#f87171] rounded-sm transition-colors disabled:opacity-50"
										>
											{busyAddress === wallet.address ? "unlinking..." : "unlink"}
										</button>
									</div>
								</motion.li>
							))}
						</AnimatePresence>
					</ul>
				)}
			</div>

			<div className="border border-stroke rounded-sm bg-surface-card p-6 flex items-center justify-between gap-4 flex-wrap">
				<div>
					<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717a] mb-1">add external wallet</p>
					<p className="text-sm text-[#a1a1aa]">link a third-party wallet for Safe signing or first-buy funding.</p>
				</div>
				<button
					type="button"
					onClick={handleLink}
					disabled={linking}
					className="px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed rounded-sm transition-colors"
				>
					{linking ? "linking..." : "Link third-party wallet"}
				</button>
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
