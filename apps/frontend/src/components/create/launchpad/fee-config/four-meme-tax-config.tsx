"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
	DEFAULT_PLATFORM_CUT_BPS,
	type FourMemeTaxFeeConfig,
	MAX_PLATFORM_CUT_BPS,
	MIN_PLATFORM_CUT_BPS,
	TAX_TIER_BPS,
} from "@/lib/launchpad/types";
import { computePlatformCutVolumeBps, sumAllocationBps, validateFourMemeTax } from "@/lib/launchpad/validators";
import { ChevronDownIcon, InfoIcon, WarningIcon } from "../launchpad-icons";

type Props = {
	value: FourMemeTaxFeeConfig;
	onChange: (next: FourMemeTaxFeeConfig) => void;
};

const ALLOCATION_FIELDS = [
	{
		key: "founderBps" as const,
		label: "agent treasury",
		description: "operations, inference, patron rewards.",
	},
	{
		key: "holderBps" as const,
		label: "holder dividends",
		description: "auto-distributed pro-rata to holders above the min balance.",
	},
	{ key: "burnBps" as const, label: "burn", description: "burned every trade. supply deflates over time." },
	{ key: "liquidityBps" as const, label: "auto-LP", description: "added back to LP. depth compounds." },
];

/**
 * Rescales the 4-way allocation to sum to `target` (= 10000 - platformCutBps),
 * preserving relative ratios. Liquidity absorbs rounding drift.
 */
function rescaleAllocation(
	current: FourMemeTaxFeeConfig["allocation"],
	target: number,
): FourMemeTaxFeeConfig["allocation"] {
	const sum = current.founderBps + current.holderBps + current.burnBps + current.liquidityBps;
	if (sum === 0) {
		// All zero, distribute evenly
		const each = Math.floor(target / 4);
		return {
			founderBps: each,
			holderBps: each,
			burnBps: each,
			liquidityBps: target - 3 * each,
		};
	}
	const scale = target / sum;
	const founderBps = Math.max(0, Math.round(current.founderBps * scale));
	const holderBps = Math.max(0, Math.round(current.holderBps * scale));
	const burnBps = Math.max(0, Math.round(current.burnBps * scale));
	const liquidityBps = Math.max(0, target - founderBps - holderBps - burnBps);
	return { founderBps, holderBps, burnBps, liquidityBps };
}

export default function FourMemeTaxConfig({ value, onChange }: Props) {
	const minHolderId = useId();
	const platformCutId = useId();
	const [showPlatformCut, setShowPlatformCut] = useState(false);

	const validation = useMemo(() => validateFourMemeTax(value), [value]);
	const allocationSum = sumAllocationBps(value.allocation);
	const expectedSum = 10_000 - value.platformCutBps;
	const sumOff = allocationSum !== expectedSum;
	const platformCutVolumeBps = computePlatformCutVolumeBps(value.taxBps, value.platformCutBps);

	const setTax = useCallback(
		(taxBps: FourMemeTaxFeeConfig["taxBps"]) => {
			onChange({ ...value, taxBps });
		},
		[onChange, value],
	);

	const setPlatformCut = useCallback(
		(platformCutBps: number) => {
			const safe = Math.max(0, Math.min(10_000, Math.round(platformCutBps)));
			const target = 10_000 - safe;
			const rescaled = rescaleAllocation(value.allocation, target);
			onChange({
				...value,
				platformCutBps: safe,
				allocation: rescaled,
			});
		},
		[onChange, value],
	);

	const setAllocation = useCallback(
		(key: keyof FourMemeTaxFeeConfig["allocation"], pct: number) => {
			const safePct = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
			const bps = Math.round(safePct * 100);
			onChange({
				...value,
				allocation: {
					...value.allocation,
					[key]: bps,
				},
			});
		},
		[onChange, value],
	);

	const rescaleToFit = useCallback(() => {
		onChange({
			...value,
			allocation: rescaleAllocation(value.allocation, expectedSum),
		});
	}, [expectedSum, onChange, value]);

	const resetToDefault = useCallback(() => {
		setPlatformCut(DEFAULT_PLATFORM_CUT_BPS);
	}, [setPlatformCut]);

	return (
		<div className="flex flex-col gap-8">
			{/* Tax tier */}
			<section>
				<header className="mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">trade tax</h2>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
						applied to every buy and sell. tax flows on-chain through a CREATE2 splitter.
					</p>
				</header>
				<div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="trade tax tier">
					{TAX_TIER_BPS.map((tier) => {
						const active = value.taxBps === tier;
						return (
							<button
								key={tier}
								type="button"
								role="radio"
								aria-checked={active}
								onClick={() => setTax(tier)}
								className={cn(
									"h-12 px-3 border text-sm font-mono tabular-nums tracking-tight",
									"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
									active
										? "border-accent text-accent bg-accent/[0.04]"
										: "border-white/10 text-neutral-300 hover:border-white/30 hover:text-white",
								)}
							>
								{tier / 100}%
							</button>
						);
					})}
				</div>
			</section>

			{/* Platform cut */}
			<section>
				<header className="flex items-baseline justify-between mb-3">
					<div>
						<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">platform cut</h2>
						<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
							waifu's slice of the tax stream. taken off the top before your allocation. default{" "}
							{DEFAULT_PLATFORM_CUT_BPS / 100}%.
						</p>
					</div>
					<button
						type="button"
						onClick={resetToDefault}
						className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 hover:text-white transition-colors"
					>
						reset
					</button>
				</header>
				<div className="flex items-center gap-3">
					<input
						id={platformCutId}
						type="range"
						min={MIN_PLATFORM_CUT_BPS}
						max={MAX_PLATFORM_CUT_BPS}
						step={100}
						value={value.platformCutBps}
						onChange={(e) => setPlatformCut(Number(e.target.value))}
						className="flex-1 accent-accent"
						aria-label="platform cut percentage"
					/>
					<div className="flex items-center h-11 border border-white/10 bg-black/40 px-2 w-[120px] focus-within:border-white/30">
						<input
							type="number"
							min={MIN_PLATFORM_CUT_BPS / 100}
							max={MAX_PLATFORM_CUT_BPS / 100}
							step={1}
							value={value.platformCutBps / 100}
							onChange={(e) => setPlatformCut(Number(e.target.value) * 100)}
							className="w-full bg-transparent outline-none text-sm font-mono tabular-nums text-white text-right"
							aria-label="platform cut percentage input"
						/>
						<span className="ml-1 text-neutral-500 font-mono text-sm">%</span>
					</div>
				</div>
				<p className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
					at {(value.taxBps / 100).toFixed(0)}% tax and {(value.platformCutBps / 100).toFixed(0)}% platform cut, waifu
					earns <span className="font-mono text-white tabular-nums">{(platformCutVolumeBps / 100).toFixed(2)}%</span> of
					trade volume. you keep the remaining{" "}
					<span className="font-mono text-white tabular-nums">
						{((value.taxBps - platformCutVolumeBps) / 100).toFixed(2)}%
					</span>{" "}
					to allocate.
				</p>
			</section>

			{/* Allocation */}
			<section>
				<header className="flex items-baseline justify-between mb-3">
					<div>
						<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">your allocation</h2>
						<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
							split your {(expectedSum / 100).toFixed(2)}% across four destinations.
						</p>
					</div>
					<span
						className={cn(
							"text-[10px] font-mono tabular-nums uppercase tracking-[0.2em]",
							sumOff ? "text-red-400" : "text-accent",
						)}
						aria-live="polite"
					>
						{(allocationSum / 100).toFixed(2)}% / {(expectedSum / 100).toFixed(2)}%
					</span>
				</header>

				<div className="border border-white/8 bg-white/[0.012] divide-y divide-white/5">
					{ALLOCATION_FIELDS.map((f) => {
						const bps = value.allocation[f.key];
						return (
							<div key={f.key} className="grid grid-cols-[1fr_120px] gap-4 p-4 items-center">
								<div className="min-w-0">
									<p className="text-sm text-white tracking-tight">{f.label}</p>
									<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">{f.description}</p>
								</div>
								<div
									className={cn(
										"flex items-center h-11 border bg-black/40 px-2",
										sumOff ? "border-red-500/40" : "border-white/10 focus-within:border-white/30",
									)}
								>
									<input
										type="number"
										min={0}
										max={100}
										step={0.5}
										value={bps / 100}
										onChange={(e) => setAllocation(f.key, Number(e.target.value))}
										aria-label={`${f.label} percentage`}
										className="w-full bg-transparent outline-none text-sm font-mono tabular-nums text-white text-right"
									/>
									<span className="ml-1 text-neutral-500 font-mono text-sm">%</span>
								</div>
							</div>
						);
					})}
				</div>

				{/* Stacked bar visualization */}
				<div
					className="mt-3 relative h-2 w-full bg-white/5 overflow-hidden flex"
					role="img"
					aria-label="allocation breakdown"
				>
					{ALLOCATION_FIELDS.map((f, i) => {
						const bps = value.allocation[f.key];
						const pct = allocationSum > 0 ? (bps / allocationSum) * 100 : 0;
						const colors = ["bg-accent", "bg-white/40", "bg-white/25", "bg-white/15"];
						return <div key={f.key} className={cn("h-full", colors[i % colors.length])} style={{ width: `${pct}%` }} />;
					})}
				</div>

				{sumOff ? (
					<button
						type="button"
						onClick={rescaleToFit}
						className="mt-3 inline-flex h-9 items-center px-3 text-[11px] font-mono uppercase tracking-[0.2em] border border-white/15 text-neutral-300 hover:border-white/30 hover:text-white transition-colors"
					>
						rescale to fit
					</button>
				) : null}
			</section>

			{/* Min holder balance */}
			<section>
				<label htmlFor={minHolderId} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
					min holder balance
				</label>
				<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[58ch]">
					holders below this token balance receive no dividend. deters airdrop farming.
				</p>
				<div className="mt-2 flex items-center h-12 border border-white/10 bg-white/[0.015] px-3 focus-within:border-white/30 transition-colors">
					<input
						id={minHolderId}
						type="number"
						min={0}
						step={1000}
						value={value.minHolderBalance}
						onChange={(e) => onChange({ ...value, minHolderBalance: e.target.value })}
						className="flex-1 bg-transparent outline-none text-sm font-mono tabular-nums text-white"
					/>
					<span className="ml-2 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">tokens</span>
				</div>
			</section>

			{/* Validation warnings */}
			{validation.warnings.length > 0 ? (
				<section className="border border-amber-500/30 bg-amber-500/[0.04] p-4 flex gap-3" role="alert">
					<WarningIcon className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
					<div className="flex-1 min-w-0">
						<ul className="text-sm text-amber-200 leading-relaxed space-y-1">
							{validation.warnings.map((w) => (
								<li key={w}>{w}</li>
							))}
						</ul>
					</div>
				</section>
			) : null}

			{validation.errors.length > 0 ? (
				<section className="border border-red-500/30 bg-red-500/[0.04] p-4" role="alert">
					<ul className="text-sm text-red-300 leading-relaxed space-y-1">
						{validation.errors.map((e) => (
							<li key={e}>{e}</li>
						))}
					</ul>
				</section>
			) : null}

			{/* Platform cut breakdown panel (collapsible) */}
			<section className="border border-white/8 bg-white/[0.012]">
				<button
					type="button"
					onClick={() => setShowPlatformCut((s) => !s)}
					aria-expanded={showPlatformCut}
					className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
				>
					<div className="flex items-center gap-2">
						<InfoIcon className="h-3.5 w-3.5 text-neutral-500" />
						<span className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-300">
							how the math works
						</span>
					</div>
					<ChevronDownIcon
						className={cn(
							"h-3.5 w-3.5 text-neutral-500 transition-transform duration-200",
							showPlatformCut && "rotate-180",
						)}
					/>
				</button>
				{showPlatformCut ? (
					<div className="border-t border-white/5 p-4 text-xs text-neutral-400 leading-relaxed space-y-2">
						<p>
							every trade pays <span className="font-mono text-white">{(value.taxBps / 100).toFixed(0)}%</span> tax.
						</p>
						<p>
							waifu takes <span className="font-mono text-white">{(value.platformCutBps / 100).toFixed(0)}%</span> of
							that tax off the top:{" "}
							<span className="font-mono text-white tabular-nums">{(platformCutVolumeBps / 100).toFixed(2)}%</span> of
							total trade volume.
						</p>
						<p>
							you allocate the remaining{" "}
							<span className="font-mono text-white tabular-nums">
								{((value.taxBps - platformCutVolumeBps) / 100).toFixed(2)}%
							</span>{" "}
							across treasury / dividends / burn / lp.
						</p>
						<p className="text-neutral-500 pt-2">
							prod bounds: platform cut between {(MIN_PLATFORM_CUT_BPS / 100).toFixed(0)}% and{" "}
							{(MAX_PLATFORM_CUT_BPS / 100).toFixed(0)}%. production tax launches keep the fee path enabled and cannot
							silently flip to zero-fee mode.
						</p>
					</div>
				) : null}
			</section>
		</div>
	);
}
