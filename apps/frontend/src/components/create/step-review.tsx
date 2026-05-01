"use client";

import { computePlatformCutVolumeBps } from "@/lib/launchpad/validators";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { useAccount } from "wagmi";
import { LAUNCHPAD_PICKER_ENABLED, useWizard } from "./wizard-state";

const RUNTIME_LABEL = {
	hosted: "hosted (milady cloud)",
	webhook: "webhook",
	pull: "pull",
} as const;

const LAUNCHPAD_LABEL = {
	"four-meme-tax": "four.meme tax",
	"four-meme-regular": "four.meme regular",
	flap: "flap",
	"pump-fun": "pump.fun",
	bags: "bags",
	custom: "custom",
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
	const { state } = useWizard();
	const { address } = useAccount();

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
						{taxVolumePct && platformCutPct && platformVolumePct ? (
							<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[54ch]">
								{taxVolumePct}% trade tax. waifu takes {platformCutPct}% of that tax, {platformVolumePct}% of volume,
								then the rest follows your creator routing. production launches keep this fee path enabled.
							</p>
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
					<p className="text-sm text-neutral-200 font-mono tabular-nums">
						{shortAddr(address)}
						<span className="text-neutral-600 mx-2">+</span>
						<span className="text-neutral-500">steward</span>
					</p>
					<p className="mt-1 text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-500">1 of 2</p>
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
						gas <span className="text-neutral-500">+</span> $5.00 setup
					</p>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[48ch]">
						pulled from your wallet at provision. token launch is a separate step from the agent's home page once the
						safe has BNB.
					</p>
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
