"use client";

import { useLinkedEoa } from "@/hooks/use-linked-eoa";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { ShieldIcon } from "./wizard-icons";
import { useWizard } from "./wizard-state";

const ADAPTER_PREVIEWS = [
	{
		slug: "pancake" as const,
		name: "pancakeswap",
		role: "dex",
		defaults: "0.10 BNB / tx, 1.00 BNB / day",
		blurb: "swap, supply liquidity, harvest. capped per-tx and per-day.",
	},
	{
		slug: "venus" as const,
		name: "venus",
		role: "lending",
		defaults: "0.10 BNB / tx, 0.50 BNB / day",
		blurb: "supply or borrow. health-factor floor enforced before every action.",
	},
];

function shortAddr(addr?: string | null): string {
	if (!addr) return "0x...";
	if (addr.length < 12) return addr;
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function sameAddress(a: string, b: string): boolean {
	return a.toLowerCase() === b.toLowerCase();
}

function uniqueAddresses(addresses: string[]): string[] {
	return addresses.filter((addr, index) => addresses.findIndex((other) => sameAddress(other, addr)) === index);
}

export default function StepSafe() {
	const { state, patchSafe } = useWizard();
	const auth = useWaifuAuth();
	const linked = useLinkedEoa();
	const [linking, setLinking] = useState(false);
	const [linkAfterConnect, setLinkAfterConnect] = useState(false);
	const [linkError, setLinkError] = useState<string | null>(null);

	const primaryAddress = auth.primaryAddress;
	const linkedWallets = auth.me.data?.linkedWallets ?? [];
	const selectedOwners = useMemo(() => uniqueAddresses(state.safe.owners ?? []), [state.safe.owners]);

	useEffect(() => {
		if (!primaryAddress) return;
		if (selectedOwners.some((owner) => sameAddress(owner, primaryAddress))) return;
		patchSafe({ owners: uniqueAddresses([primaryAddress, ...selectedOwners]), threshold: state.safe.threshold || 1 });
	}, [patchSafe, primaryAddress, selectedOwners, state.safe.threshold]);

	const owners = primaryAddress ? uniqueAddresses([primaryAddress, ...selectedOwners]) : selectedOwners;
	const threshold = Math.max(1, Math.min(state.safe.threshold || 1, Math.max(owners.length, 1)));
	const agentBps = state.safe.taxAgentBps;
	const patronBps = state.safe.taxPatronBps;
	const agentPct = agentBps / 100;
	const patronPct = patronBps / 100;

	async function addLinkedOwner(address: string) {
		setLinking(true);
		try {
			if (!linked.isLinkedToPatron) {
				await linked.link();
			}
			patchSafe({ owners: uniqueAddresses([...owners, address]), threshold: 1 });
		} finally {
			setLinking(false);
		}
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once when RainbowKit supplies an address after the signer CTA opened it.
	useEffect(() => {
		if (!linkAfterConnect || !linked.address) return;
		setLinkAfterConnect(false);
		addLinkedOwner(linked.address).catch((err) => {
			setLinkError(err instanceof Error ? err.message : "could not link wallet");
		});
	}, [linkAfterConnect, linked.address]);

	async function handleLinkExternalSigner() {
		setLinkError(null);
		try {
			if (!linked.address) {
				setLinkAfterConnect(true);
				linked.openConnectModal();
				return;
			}
			await addLinkedOwner(linked.address);
		} catch (err) {
			setLinkError(err instanceof Error ? err.message : "could not link wallet");
		}
	}

	function toggleOwner(address: string, checked: boolean) {
		const next = checked
			? uniqueAddresses([...owners, address])
			: owners.filter((owner) => !sameAddress(owner, address));
		patchSafe({ owners: next, threshold: Math.max(1, Math.min(threshold, next.length || 1)) });
	}

	return (
		<div className="flex flex-col gap-10">
			<section>
				<header className="flex items-baseline justify-between mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						safe ({threshold}-of-{owners.length || 1})
					</h2>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">
						deploys at provision
					</span>
				</header>

				<div className="border border-white/8 bg-white/[0.012] p-5">
					<div className="flex items-start gap-4">
						<span
							className="hidden sm:inline-flex h-9 w-9 items-center justify-center border border-white/10 text-neutral-300 shrink-0"
							aria-hidden
						>
							<ShieldIcon className="h-4 w-4" />
						</span>
						<div className="flex-1 min-w-0">
							<p className="text-sm text-neutral-300 leading-relaxed">
								the patron Steward wallet is the default Safe owner. add external signers only if you want a third-party
								wallet available for recovery or co-signing later.
							</p>
						</div>
					</div>

					<dl className="mt-5 divide-y divide-white/5 border-t border-white/5">
						<div className="grid grid-cols-[140px_1fr] py-3 gap-3 items-center">
							<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">primary owner</dt>
							<dd className="text-sm font-mono text-neutral-200 tabular-nums">{shortAddr(primaryAddress)}</dd>
						</div>
						<div className="grid grid-cols-[140px_1fr] py-3 gap-3 items-start">
							<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">safe owners</dt>
							<dd className="space-y-2">
								{owners.length ? (
									owners.map((owner) => (
										<p key={owner} className="text-sm font-mono text-neutral-200 tabular-nums">
											{shortAddr(owner)}
											{primaryAddress && sameAddress(owner, primaryAddress) ? (
												<span className="text-neutral-500"> steward</span>
											) : null}
										</p>
									))
								) : (
									<p className="text-sm text-neutral-500">sign in to load your Steward owner</p>
								)}
							</dd>
						</div>
						<div className="grid grid-cols-[140px_1fr] py-3 gap-3 items-center">
							<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">threshold</dt>
							<dd className="text-sm font-mono text-neutral-200">
								{threshold} of {owners.length || 1}
							</dd>
						</div>
					</dl>

					<div className="mt-5 border-t border-white/5 pt-5 space-y-4">
						<div className="flex items-center justify-between gap-3 flex-wrap">
							<div>
								<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">external signers</p>
								<p className="mt-1 text-xs text-neutral-500">
									optional linked EOAs stay 1-of-N until you raise the threshold later.
								</p>
							</div>
							<button
								type="button"
								onClick={handleLinkExternalSigner}
								disabled={linking}
								className="px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{linking ? "linking..." : "Add external signer"}
							</button>
						</div>

						{linkedWallets.length ? (
							<ul className="space-y-2">
								{linkedWallets.map((wallet) => {
									const checked = owners.some((owner) => sameAddress(owner, wallet.address));
									return (
										<li key={wallet.address} className="flex items-center gap-3 text-sm text-neutral-300">
											<input
												type="checkbox"
												checked={checked}
												onChange={(event) => toggleOwner(wallet.address, event.target.checked)}
												className="h-4 w-4 accent-[#00ff87]"
											/>
											<span className="font-mono tabular-nums">{shortAddr(wallet.address)}</span>
											<span className="text-[11px] text-neutral-600">
												linked {wallet.addedAt ? new Date(wallet.addedAt).toLocaleDateString() : "recently"}
											</span>
										</li>
									);
								})}
							</ul>
						) : null}
						{linkError ? (
							<p className="text-xs text-[#f87171]" role="alert">
								{linkError}
							</p>
						) : null}
					</div>
				</div>
			</section>

			<section>
				<header className="flex items-baseline justify-between mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">tax routing</h2>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">v1 default</span>
				</header>

				<div className="border border-white/8 bg-white/[0.012] p-5">
					<div className="flex items-end gap-2 mb-3">
						<div className="flex-1 min-w-0">
							<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">agent treasury</p>
							<p className="mt-1 text-2xl font-medium text-white tabular-nums">{agentPct}%</p>
						</div>
						<div className="text-right">
							<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">patron</p>
							<p className="mt-1 text-2xl font-medium text-neutral-300 tabular-nums">{patronPct}%</p>
						</div>
					</div>

					<div
						className="relative h-2 w-full bg-white/5 overflow-hidden"
						role="img"
						aria-label={`tax split: ${agentPct}% to agent, ${patronPct}% to patron`}
					>
						<div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${agentPct}%` }} />
						<div className="absolute inset-y-0 bg-white/30" style={{ left: `${agentPct}%`, width: `${patronPct}%` }} />
					</div>

					<p className="mt-3 text-xs text-neutral-500 leading-relaxed">
						locked to 80/20 for v1. tax flows on-chain through a CREATE2 splitter. editable later when v2 ships.
					</p>
				</div>
			</section>

			<section>
				<header className="flex items-baseline justify-between mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">adapters</h2>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">
						enabled at provision
					</span>
				</header>

				<ul className="border border-white/8 bg-white/[0.012] divide-y divide-white/5">
					{ADAPTER_PREVIEWS.map((a) => {
						const enabled = state.safe.adapters[a.slug];
						return (
							<li key={a.slug} className="flex items-start gap-4 p-5">
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<h3 className="text-sm text-white tracking-tight">{a.name}</h3>
										<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 border border-white/10 px-1.5 py-0.5">
											{a.role}
										</span>
									</div>
									<p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">{a.blurb}</p>
									<p className="mt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
										default cap: {a.defaults}
									</p>
								</div>
								<span
									className={cn(
										"shrink-0 text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-1 border",
										enabled ? "text-accent border-accent/30" : "text-neutral-500 border-white/10",
									)}
								>
									{enabled ? "on" : "off"}
								</span>
							</li>
						);
					})}
				</ul>

				<p className="mt-3 text-xs text-neutral-500 leading-relaxed max-w-[58ch]">
					customize policies after provisioning from <span className="text-neutral-300">/patron</span>. per-tx and daily
					caps, allowlists, target tokens, and max slippage all live there.
				</p>
			</section>
		</div>
	);
}
