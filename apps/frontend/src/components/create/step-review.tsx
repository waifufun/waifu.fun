"use client";

import { useLinkedEoa } from "@/hooks/use-linked-eoa";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { shortenCid } from "@/lib/flap/metadata";
import { formatVanityAddress, hasVanitySuffix } from "@/lib/launch-vault/vanity-address";
import { computePlatformCutVolumeBps } from "@/lib/launchpad/validators";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useEffect } from "react";
import { formatUsdMarketCap, getTier, totalBnb } from "./tier/tier-data";
import { LAUNCHPAD_PICKER_ENABLED, useWizard } from "./wizard-state";

const RUNTIME_LABEL = {
	hosted: "managed (ping us)",
	webhook: "webhook",
	pull: "pull",
} as const;

const LAUNCHPAD_LABEL = {
	"four-meme-tax": "four.meme tax",
	"four-meme-regular": "four.meme regular",
	flap: "flap",
	meteora: "meteora",
	"pump-fun": "pump.fun",
	bags: "bags",
	"custom-evm": "custom evm",
} as const;

const CHAIN_LABEL = {
	bsc: "BNB Smart Chain",
	solana: "Solana",
	base: "Base",
	ethereum: "Ethereum",
} as const;

function shortAddr(addr?: string | null): string {
	if (!addr) return "(connect wallet)";
	if (addr.length < 12) return addr;
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function shortUrl(url: string): string {
	if (!url) return "";
	try {
		const u = new URL(url);
		const path = u.pathname === "/" ? "" : u.pathname;
		return `${u.host}${path.length > 24 ? `${path.slice(0, 24)}...` : path}`;
	} catch {
		return url.slice(0, 36);
	}
}

export default function StepReview() {
	const { state, patchSafe } = useWizard();
	const auth = useWaifuAuth();
	const primaryAddress = auth.primaryChain === "evm" ? auth.primaryAddress : null;
	const linked = useLinkedEoa();
	const linkedAddress = linked.isLinkedToPatron ? linked.address : null;

	useEffect(() => {
		if (!linkedAddress && state.safe.firstBuyFundingSource) {
			patchSafe({ firstBuyFundingSource: null });
		}
	}, [linkedAddress, patchSafe, state.safe.firstBuyFundingSource]);

	const adapters = Object.entries(state.safe.adapters)
		.filter(([, enabled]) => enabled)
		.map(([slug]) => slug);
	const feeConfig = state.launchpad.feeConfig;
	const selectedLaunchpad = state.launchpad.selectedId;
	const selectedChain = state.launchpad.selectedChain;
	const taxVolumePct = feeConfig && "taxBps" in feeConfig ? (feeConfig.taxBps / 100).toFixed(0) : null;
	const platformCutPct =
		feeConfig && "platformCutBps" in feeConfig ? (feeConfig.platformCutBps / 100).toFixed(0) : null;
	const platformVolumePct =
		feeConfig && "taxBps" in feeConfig && "platformCutBps" in feeConfig
			? (computePlatformCutVolumeBps(feeConfig.taxBps, feeConfig.platformCutBps) / 100).toFixed(2)
			: null;
	const treasuryVolumePct =
		feeConfig && "taxBps" in feeConfig && "platformCutBps" in feeConfig
			? ((feeConfig.taxBps - computePlatformCutVolumeBps(feeConfig.taxBps, feeConfig.platformCutBps)) / 100).toFixed(2)
			: null;

	return (
		<div className="flex flex-col gap-8">
			<section className="border border-white/8 bg-white/[0.012] divide-y divide-white/5">
				{/* Identity */}
				<div className="p-5 flex items-center gap-4">
					<div
						className={cn(
							"shrink-0 h-14 w-14 overflow-hidden border border-white/10 bg-black",
							"flex items-center justify-center",
						)}
						style={
							!state.persona.avatarDataUrl && state.persona.avatarTemplateId
								? {
										backgroundImage: gradientFor(state.persona.avatarTemplateId),
										backgroundSize: "cover",
									}
								: undefined
						}
					>
						{state.persona.avatarDataUrl ? (
							<Image
								src={state.persona.avatarDataUrl}
								alt="agent avatar"
								width={56}
								height={56}
								className="object-cover w-full h-full"
								unoptimized
							/>
						) : null}
					</div>
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<h3 className="text-base text-white tracking-tight truncate">
								{state.persona.name || <span className="text-neutral-600">unnamed</span>}
							</h3>
							{state.persona.ticker ? (
								<span className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-400 border border-white/10 px-1.5 py-0.5">
									${state.persona.ticker}
								</span>
							) : null}
						</div>
						{state.persona.bio ? (
							<p className="mt-1 text-xs text-neutral-400 leading-relaxed line-clamp-2">{state.persona.bio}</p>
						) : (
							<p className="mt-1 text-xs text-neutral-600 italic">no bio</p>
						)}
					</div>
				</div>

				{/* Wave H: flap token preview */}
				<Row label="flap token">
					<p className="text-sm text-neutral-200 font-mono tabular-nums" data-testid="vanity-address-display">
						{state.vanity.predictedAddress
							? formatVanityAddress(state.vanity.predictedAddress)
							: state.vanity.submitted
								? "mining vanity address…"
								: "your token: 0x…7777"}
					</p>
					{state.vanity.predictedAddress && !hasVanitySuffix(state.vanity.predictedAddress) ? (
						<p className="mt-1 text-[11px] font-mono text-yellow-400/80">
							heads up: backend skipped vanity mining. address ships as-is.
						</p>
					) : null}
					<p className="mt-2 text-[11px] text-neutral-500 leading-relaxed max-w-[54ch]">
						your agent token (deployed via flap portal) gets a create2-mined `0x…7777` suffix. token mints + curve
						graduation happen atomically inside our bundle.
					</p>
					{state.flap.metaCid ? (
						<p className="mt-2 text-[11px] font-mono text-neutral-500">
							meta cid: <span className="text-neutral-300">{shortenCid(state.flap.metaCid)}</span>
						</p>
					) : null}
				</Row>

				{/* W48: Launch Tier */}
				{state.launch.tierId ? (
					<Row label="tier">
						{(() => {
							const t = getTier(state.launch.tierId);
							if (!t) return null;
							return (
								<>
									<p className="text-sm text-neutral-200">
										tier_{t.id}
										<span className="text-neutral-600">
											{" "}
											• cap {t.cap} BNB • v2 buy {t.v2Buy} BNB
										</span>
									</p>
									<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[54ch]">
										total {totalBnb(t)} BNB • circulating mc {formatUsdMarketCap(t.openCircMcBnb)} • fdv{" "}
										{formatUsdMarketCap(t.openFdvBnb)} includes burned supply • presaler{" "}
										{t.presaler.toFixed(t.presaler % 1 === 0 ? 0 : 1)}x • burn {t.burn}% • vesting {t.vesting}
									</p>
									<p className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-600 leading-relaxed max-w-[54ch]">
										burn / treasury / presale = 50 / 10 / 40 of the vault's share of the dev-buy
									</p>
								</>
							);
						})()}
					</Row>
				) : null}

				{/* Launchpad */}
				{LAUNCHPAD_PICKER_ENABLED ? (
					<Row label="launchpad">
						<p className="text-sm text-neutral-200">
							{selectedLaunchpad ? LAUNCHPAD_LABEL[selectedLaunchpad] : "not selected"}
							{selectedChain ? <span className="text-neutral-600"> on {CHAIN_LABEL[selectedChain]}</span> : null}
						</p>
						{feeConfig?.kind === "four-meme-regular" ? (
							<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[48ch]">
								regular curve. no creator tax routing, no agent treasury feed from trades.
							</p>
						) : null}
						{/* Flap custom-vault recipient bypasses Split Vault entirely:
						100% of trade tax flows direct to the user's vault address, no
						platform cut deducted on-chain. Show that explicitly so users
						don't approve a launch under wrong fee expectations. */}
						{feeConfig?.kind === "flap" && feeConfig.recipient === "custom-vault" ? (
							<div className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[54ch]">
								<p>trade tax: {taxVolumePct ?? "–"}%</p>
								<p>└─ 100% routes direct to your custom vault. no platform cut on-chain.</p>
							</div>
						) : taxVolumePct && platformCutPct && platformVolumePct && treasuryVolumePct ? (
							<div className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[54ch]">
								<p>trade tax: {taxVolumePct}%</p>
								<p>
									└─ platform: {platformCutPct}% of tax ({platformVolumePct}%)
								</p>
								{feeConfig?.kind === "four-meme-tax" ? (
									<>
										<p>
											└─ remainder: {100 - Number(platformCutPct)}% of tax ({treasuryVolumePct}%)
										</p>
										<p className="mt-1">
											remainder routes through your four.meme tax allocation (founder / holders / burn / liquidity).
										</p>
									</>
								) : (
									<p>
										└─ treasury: {100 - Number(platformCutPct)}% of tax ({treasuryVolumePct}%)
									</p>
								)}
								{feeConfig?.kind === "flap" && feeConfig.recipient === "agent-treasury" ? (
									<p className="mt-1">Flap deploys a Split Vault for this routing at launch.</p>
								) : null}
							</div>
						) : null}
					</Row>
				) : null}

				{/* Runtime */}
				<Row label="runtime" value={RUNTIME_LABEL[state.runtime.kind]}>
					{state.runtime.kind === "webhook" && state.runtime.webhookUrl ? (
						<p className="mt-1 text-[11px] font-mono text-neutral-500 truncate">{shortUrl(state.runtime.webhookUrl)}</p>
					) : null}
					{state.runtime.kind === "pull" ? (
						<p className="mt-1 text-[11px] text-neutral-500">api key shown once after provisioning</p>
					) : null}
				</Row>

				{/* Safe */}
				<Row label="safe">
					<div className="space-y-1">
						{(state.safe.owners.length ? state.safe.owners : primaryAddress ? [primaryAddress] : []).map((owner) => (
							<p key={owner} className="text-sm text-neutral-200 font-mono tabular-nums">
								{shortAddr(owner)}
								{primaryAddress?.toLowerCase() === owner.toLowerCase() ? (
									<span className="text-neutral-600"> steward</span>
								) : null}
							</p>
						))}
					</div>
					<p className="mt-1 text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-500">
						{state.safe.threshold || 1} of {Math.max(state.safe.owners.length || (primaryAddress ? 1 : 0), 1)}
					</p>
					<p className="mt-2 text-[11px] text-neutral-500 leading-relaxed max-w-[54ch]">
						you keep patron control over policy changes and launch timing. the agent gets constrained autonomy only
						through enabled adapters, caps, allowlists, and slippage rules.
					</p>
				</Row>

				{/* Tax */}
				<Row label="tax split">
					<p className="text-sm text-neutral-200 font-mono tabular-nums">
						{state.safe.taxAgentBps / 100}% agent
						<span className="text-neutral-600 mx-2">/</span>
						{state.safe.taxPatronBps / 100}% patron
					</p>
				</Row>

				{/* Adapters */}
				<Row label="adapters">
					{adapters.length === 0 ? (
						<p className="text-sm text-neutral-600">none enabled</p>
					) : (
						<div className="flex items-center gap-2 flex-wrap">
							{adapters.map((slug) => (
								<span
									key={slug}
									className="text-[11px] font-mono uppercase tracking-[0.24em] text-accent border border-accent/30 px-2 py-1"
								>
									{slug}
								</span>
							))}
						</div>
					)}
				</Row>

				{/* Cost */}
				<Row label="cost">
					<p className="text-sm font-mono tabular-nums text-neutral-200">
						gas <span className="text-neutral-500">+</span> $5.00 setup <span className="text-neutral-500">+</span> 0.03
						BNB bundle tip
					</p>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[48ch]">
						pulled from your primary Steward wallet at provision. bundle tip goes to the 48 club builder eoa for
						priority inclusion when the puissant bundle ships.
					</p>
					{linkedAddress ? (
						<label className="mt-4 flex items-center gap-3 text-sm text-neutral-300">
							<input
								type="checkbox"
								checked={state.safe.firstBuyFundingSource === linkedAddress}
								onChange={(event) => patchSafe({ firstBuyFundingSource: event.target.checked ? linkedAddress : null })}
								className="h-4 w-4 accent-[#00ff87]"
							/>
							<span>Use linked wallet for first-buy</span>
							<span className="font-mono text-neutral-500">{shortAddr(linkedAddress)}</span>
						</label>
					) : null}
				</Row>
			</section>

			<aside className="border border-accent/20 bg-accent/[0.03] p-4">
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-accent">after provision</p>
				<p className="mt-2 text-sm text-neutral-300 leading-relaxed">
					you'll land on <span className="text-white">/patron/[id]</span> in the{" "}
					<span className="font-mono text-white">ready_to_launch</span> state. from there: fund the safe, pick a
					first-buy size, and launch the token whenever you're ready.
				</p>
			</aside>
		</div>
	);
}

function Row({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
	return (
		<div className="grid grid-cols-[120px_1fr] gap-4 p-5 items-start">
			<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 pt-0.5">{label}</dt>
			<dd>
				{value ? <p className="text-sm text-neutral-200">{value}</p> : null}
				{children}
			</dd>
		</div>
	);
}

function gradientFor(id: string): string {
	const map: Record<string, string> = {
		tessera: "linear-gradient(135deg,#1f3a2b 0%,#0a0a0a 60%)",
		halia: "linear-gradient(135deg,#3a2f1f 0%,#0a0a0a 60%)",
		vesper: "linear-gradient(135deg,#1f2a3a 0%,#0a0a0a 60%)",
		korin: "linear-gradient(135deg,#2a1f3a 0%,#0a0a0a 60%)",
		miren: "linear-gradient(135deg,#1a1a1a 0%,#040404 60%)",
		ophir: "linear-gradient(135deg,#0e3320 0%,#0a0a0a 60%)",
	};
	return map[id] ?? "linear-gradient(135deg,#1f3a2b 0%,#0a0a0a 60%)";
}
