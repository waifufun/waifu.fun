"use client";

import { useTranslation } from "@/contexts/locale-context";
import { useLinkedEoa } from "@/hooks/use-linked-eoa";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { ShieldIcon } from "./wizard-icons";
import { useWizard } from "./wizard-state";

function isEvmAddress(value: string): boolean {
	return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

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
	const { t } = useTranslation();
	const { state, patchSafe } = useWizard();
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [coOwnerDraft, setCoOwnerDraft] = useState("");
	const [coOwnerError, setCoOwnerError] = useState<string | null>(null);
	const auth = useWaifuAuth();
	const linked = useLinkedEoa();
	const [linking, setLinking] = useState(false);
	const [linkAfterConnect, setLinkAfterConnect] = useState(false);
	const [linkError, setLinkError] = useState<string | null>(null);

	const primaryAddress = auth.primaryChain === "evm" ? auth.primaryAddress : null;
	const primaryLabel =
		auth.primaryAddress && auth.primaryChain === "solana" ? t("wizard.safe.linkEvmWallet") : shortAddr(primaryAddress);
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
			const nextOwners = uniqueAddresses([...owners, address]);
			patchSafe({
				owners: nextOwners,
				threshold: Math.max(1, Math.min(state.safe.threshold || 1, nextOwners.length)),
			});
		} finally {
			setLinking(false);
		}
	}

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs once when RainbowKit supplies an address after the signer CTA opened it.
	useEffect(() => {
		if (!linkAfterConnect || !linked.address) return;
		setLinkAfterConnect(false);
		addLinkedOwner(linked.address).catch((err) => {
			setLinkError(err instanceof Error ? err.message : t("wizard.safe.couldNotLinkWallet"));
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
			setLinkError(err instanceof Error ? err.message : t("wizard.safe.couldNotLinkWallet"));
		}
	}

	function toggleOwner(address: string, checked: boolean) {
		const next = checked
			? uniqueAddresses([...owners, address])
			: owners.filter((owner) => !sameAddress(owner, address));
		patchSafe({ owners: next, threshold: Math.max(1, Math.min(threshold, next.length || 1)) });
	}

	function updateThreshold(value: number) {
		const clamped = Math.max(1, Math.min(value, Math.max(owners.length, 1)));
		patchSafe({ threshold: clamped });
	}

	return (
		<div className="flex flex-col gap-10">
			<section>
				<header className="flex items-baseline justify-between mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						{t("wizard.safe.title", { threshold: String(threshold), owners: String(owners.length || 1) })}
					</h2>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">
						{t("wizard.safe.deploysAtProvision")}
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
								{auth.primaryChain === "solana"
									? t("wizard.safe.solanaWarning")
									: t("wizard.safe.defaultIntro")}
							</p>
						</div>
					</div>

					<dl className="mt-5 divide-y divide-white/5 border-t border-white/5">
						<div className="grid grid-cols-[140px_1fr] py-3 gap-3 items-center">
							<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">{t("wizard.safe.primaryOwner")}</dt>
							<dd className="text-sm font-mono text-neutral-200 tabular-nums">{primaryLabel}</dd>
						</div>
						<div className="grid grid-cols-[140px_1fr] py-3 gap-3 items-start">
							<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">{t("wizard.safe.safeOwners")}</dt>
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
									<p className="text-sm text-neutral-500">{t("wizard.safe.signInToLoad")}</p>
								)}
							</dd>
						</div>
						<div className="grid grid-cols-[140px_1fr] py-3 gap-3 items-center">
							<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">threshold</dt>
							<dd className="text-sm font-mono text-neutral-200 flex items-center gap-3">
								{owners.length > 1 ? (
									<>
										<input
											type="number"
											min={1}
											max={owners.length}
											value={threshold}
											onChange={(event) => updateThreshold(Number(event.target.value))}
											className="w-16 bg-black/30 border border-white/10 px-2 py-1 text-sm font-mono text-white tabular-nums focus:outline-none focus:border-accent/50"
											aria-label={t("wizard.safe.thresholdAria")}
										/>
										<span className="text-neutral-500">of {owners.length}</span>
									</>
								) : (
									<span>
										{threshold} of {owners.length || 1}
									</span>
								)}
							</dd>
						</div>
					</dl>

					<div className="mt-5 border-t border-white/5 pt-5 space-y-4">
						<div className="flex items-center justify-between gap-3 flex-wrap">
							<div>
								<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">{t("wizard.safe.externalSigners")}</p>
								<p className="mt-1 text-xs text-neutral-500">
									{t("wizard.safe.externalHelper")}
								</p>
							</div>
							<button
								type="button"
								onClick={handleLinkExternalSigner}
								disabled={linking}
								className="px-4 py-2 text-[11px] font-mono uppercase tracking-[0.18em] border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
							>
								{linking ? t("wizard.safe.linking") : t("wizard.safe.addExternalSigner")}
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
												{wallet.addedAt ? t("wizard.safe.linkedAt", { date: new Date(wallet.addedAt).toLocaleDateString() }) : t("wizard.safe.linkedRecently")}
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

						<div className="pt-2 border-t border-white/5">
							<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">{t("wizard.safe.coOwners")}</p>
							<p className="mt-1 text-xs text-neutral-500">
								{t("wizard.safe.coOwnersHelper")}
							</p>
							<div className="mt-3 flex gap-2">
								<input
									type="text"
									value={coOwnerDraft}
									onChange={(event) => {
										setCoOwnerDraft(event.target.value);
										setCoOwnerError(null);
									}}
									placeholder="0x..."
									spellCheck={false}
									className="flex-1 min-w-0 bg-black/30 border border-white/10 px-3 py-2 text-sm font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-accent/50"
									aria-label={t("wizard.safe.coOwnerAria")}
								/>
								<button
									type="button"
									onClick={() => {
										const candidate = coOwnerDraft.trim();
										if (!isEvmAddress(candidate)) {
											setCoOwnerError(t("wizard.safe.addressInvalid"));
											return;
										}
										if (owners.some((existing) => sameAddress(existing, candidate))) {
											setCoOwnerError(t("wizard.safe.addressAlreadyOwner"));
											return;
										}
										const nextOwners = uniqueAddresses([...owners, candidate]);
										patchSafe({
											owners: nextOwners,
											threshold: Math.max(1, Math.min(state.safe.threshold || 1, nextOwners.length)),
										});
										setCoOwnerDraft("");
									}}
									className="px-3 py-2 text-[11px] font-mono uppercase tracking-[0.18em] border border-white/15 text-neutral-200 hover:border-accent/40 hover:text-accent"
								>
									add
								</button>
							</div>
							{coOwnerError ? (
								<p className="mt-2 text-xs text-[#f87171]" role="alert">
									{coOwnerError}
								</p>
							) : null}
						</div>
					</div>
				</div>
			</section>

			<section>
				<header className="flex items-baseline justify-between mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">{t("wizard.safe.taxRouting")}</h2>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">{t("wizard.safe.waveMDefault")}</span>
				</header>

				<div className="border border-white/8 bg-white/[0.012] p-5">
					{(() => {
						const platformPct = state.patronPlatform.platformBps / 100;
						const patronSharePct = state.patronPlatform.patronBps / 100;
						const agentSharePct = Math.max(0, 100 - platformPct - patronSharePct);
						return (
							<>
								<div className="grid grid-cols-3 gap-3 mb-3">
									<div>
										<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">platform</p>
										<p className="mt-1 text-2xl font-medium text-neutral-200 tabular-nums">{platformPct}%</p>
									</div>
									<div>
										<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">patron</p>
										<p className="mt-1 text-2xl font-medium text-neutral-300 tabular-nums">{patronSharePct}%</p>
									</div>
									<div className="text-right">
										<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">agent</p>
										<p className="mt-1 text-2xl font-medium text-white tabular-nums">{agentSharePct}%</p>
									</div>
								</div>

								<div
									className="relative h-2 w-full bg-white/5 overflow-hidden"
									role="img"
									aria-label={`tax split: ${platformPct}% platform, ${patronSharePct}% patron, ${agentSharePct}% agent`}
								>
									<div className="absolute inset-y-0 left-0 bg-white/30" style={{ width: `${platformPct}%` }} />
									<div
										className="absolute inset-y-0 bg-white/50"
										style={{ left: `${platformPct}%`, width: `${patronSharePct}%` }}
									/>
									<div
										className="absolute inset-y-0 bg-accent"
										style={{ left: `${platformPct + patronSharePct}%`, width: `${agentSharePct}%` }}
									/>
								</div>

								<p className="mt-3 text-xs text-neutral-500 leading-relaxed">
									{t("wizard.safe.waveMDefault")}. tax flows on-chain through a CREATE2 TaxSplitter to the platform Safe, the patron, and
									the agent Safe. splits are locked per launch; expand &ldquo;advanced&rdquo; to audit the on-chain
									config.
								</p>
							</>
						);
					})()}
				</div>

				<div className="mt-3 border border-white/8 bg-white/[0.012]">
					<button
						type="button"
						onClick={() => setAdvancedOpen((open) => !open)}
						aria-expanded={advancedOpen}
						className="w-full flex items-center justify-between px-5 py-3 text-[11px] font-mono uppercase tracking-[0.18em] text-neutral-400 hover:text-neutral-200"
					>
						<span>{t("wizard.safe.advancedPatronPlatform")}</span>
						<span aria-hidden>{advancedOpen ? "\u2212" : "+"}</span>
					</button>
					{advancedOpen ? (
						<dl className="divide-y divide-white/5 border-t border-white/5">
							<div className="grid grid-cols-[160px_1fr] py-3 px-5 gap-3 items-center">
								<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">platform receiver</dt>
								<dd>
									<input
										type="text"
										readOnly
										value={state.patronPlatform.platformReceiver}
										className="w-full bg-black/30 border border-white/10 px-2 py-1 text-xs font-mono text-neutral-300 tabular-nums"
										aria-label="platform receiver address (read only)"
									/>
								</dd>
							</div>
							<div className="grid grid-cols-[160px_1fr] py-3 px-5 gap-3 items-center">
								<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">patron</dt>
								<dd>
									<input
										type="text"
										readOnly
										value={state.patronPlatform.patron ?? "defaults to creator wallet"}
										className="w-full bg-black/30 border border-white/10 px-2 py-1 text-xs font-mono text-neutral-300 tabular-nums"
										aria-label="patron address (read only)"
									/>
								</dd>
							</div>
							<div className="grid grid-cols-[160px_1fr] py-3 px-5 gap-3 items-center">
								<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">platform bps</dt>
								<dd className="text-sm font-mono text-neutral-300 tabular-nums">
									{state.patronPlatform.platformBps} ({state.patronPlatform.platformBps / 100}%)
								</dd>
							</div>
							<div className="grid grid-cols-[160px_1fr] py-3 px-5 gap-3 items-center">
								<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">patron bps</dt>
								<dd className="text-sm font-mono text-neutral-300 tabular-nums">
									{state.patronPlatform.patronBps} ({state.patronPlatform.patronBps / 100}%)
								</dd>
							</div>
							<div className="py-3 px-5">
								<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">notes</p>
								<p className="mt-1 text-xs text-neutral-500 leading-relaxed">
									platform receiver is operator-controlled; values are locked in v1. set
									<code className="px-1 text-neutral-400">NEXT_PUBLIC_PLATFORM_SAFE_ADDRESS</code>
									and the bps env vars to override per environment.
								</p>
							</div>
						</dl>
					) : null}
				</div>
			</section>

			<section>
				<header className="flex items-baseline justify-between mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">{t("wizard.safe.adapters")}</h2>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">
						{t("wizard.safe.enabledAtProvision")}
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
									<p className="mt-1.5 text-xs text-neutral-400 leading-relaxed">{a.slug === "pancake" ? t("wizard.safe.pancakeBlurb") : t("wizard.safe.venusBlurb")}</p>
									<p className="mt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
										{t("wizard.safe.defaultCap", { cap: a.defaults })}
									</p>
								</div>
								<span
									className={cn(
										"shrink-0 text-[10px] font-mono uppercase tracking-[0.2em] px-2 py-1 border",
										enabled ? "text-accent border-accent/30" : "text-neutral-500 border-white/10",
									)}
								>
									{enabled ? t("wizard.safe.on") : t("wizard.safe.off")}
								</span>
							</li>
						);
					})}
				</ul>

				<p className="mt-3 text-xs text-neutral-500 leading-relaxed max-w-[58ch]">
					{t("wizard.safe.adaptersFooter")}
				</p>
			</section>
		</div>
	);
}
