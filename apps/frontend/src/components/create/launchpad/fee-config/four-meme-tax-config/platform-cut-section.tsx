"use client";

import { useTranslation } from "@/contexts/locale-context";
import { DEFAULT_PLATFORM_CUT_BPS, MAX_PLATFORM_CUT_BPS, MIN_PLATFORM_CUT_BPS } from "@/lib/launchpad/types";
import { useId } from "react";

type Props = {
	taxBps: number;
	platformCutBps: number;
	platformCutVolumeBps: number;
	onChange: (platformCutBps: number) => void;
};

export function PlatformCutSection({ taxBps, platformCutBps, platformCutVolumeBps, onChange }: Props) {
	const { t } = useTranslation();
	const platformCutId = useId();
	const {t("wizard.common.reset")}ToDefault = () => onChange(DEFAULT_PLATFORM_CUT_BPS);

	return (
		<section>
			<header className="flex items-baseline justify-between mb-3">
				<div>
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">{t("wizard.launchpad.tax.platformCut")}</h2>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
						waifu's slice of the tax stream. taken off the top before your allocation. default{" "}
						{DEFAULT_PLATFORM_CUT_BPS / 100}%.
					</p>
				</div>
				<button
					type="button"
					onClick={{t("wizard.common.reset")}ToDefault}
					className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500 hover:text-white transition-colors"
				>
					{t("wizard.common.reset")}
				</button>
			</header>
			<div className="flex items-center gap-3">
				<input
					id={platformCutId}
					type="range"
					min={MIN_PLATFORM_CUT_BPS}
					max={MAX_PLATFORM_CUT_BPS}
					step={100}
					value={platformCutBps}
					onChange={(e) => onChange(Number(e.target.value))}
					className="flex-1 accent-accent"
					aria-label="{t("wizard.launchpad.tax.platformCut")} percentage"
				/>
				<div className="flex items-center h-11 border border-white/10 bg-black/40 px-2 w-[120px] focus-within:border-white/30">
					<input
						type="number"
						min={MIN_PLATFORM_CUT_BPS / 100}
						max={MAX_PLATFORM_CUT_BPS / 100}
						step={1}
						value={platformCutBps / 100}
						onChange={(e) => onChange(Number(e.target.value) * 100)}
						className="w-full bg-transparent outline-none text-sm font-mono tabular-nums text-white text-right"
						aria-label="{t("wizard.launchpad.tax.platformCut")} percentage input"
					/>
					<span className="ml-1 text-neutral-500 font-mono text-sm">%</span>
				</div>
			</div>
			<p className="mt-2 text-[11px] text-neutral-500 leading-relaxed">
				at {(taxBps / 100).toFixed(0)}% tax and {(platformCutBps / 100).toFixed(0)}% {t("wizard.launchpad.tax.platformCut")}, waifu earns{" "}
				<span className="font-mono text-white tabular-nums">{(platformCutVolumeBps / 100).toFixed(2)}%</span> of trade
				volume. you keep the remaining{" "}
				<span className="font-mono text-white tabular-nums">{((taxBps - platformCutVolumeBps) / 100).toFixed(2)}%</span>{" "}
				to allocate.
			</p>
		</section>
	);
}
