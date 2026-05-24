"use client";

import { useTranslation } from "@/contexts/locale-context";
import { MAX_PLATFORM_CUT_BPS, MIN_PLATFORM_CUT_BPS } from "@/lib/launchpad/types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChevronDownIcon, InfoIcon } from "../../launchpad-icons";

type Props = {
	taxBps: number;
	platformCutBps: number;
	platformCutVolumeBps: number;
};

export function PlatformCutBreakdown({ taxBps, platformCutBps, platformCutVolumeBps }: Props) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	return (
		<section className="border border-white/8 bg-white/[0.012]">
			<button
				type="button"
				onClick={() => setOpen((s) => !s)}
				aria-expanded={open}
				className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
			>
				<div className="flex items-center gap-2">
					<InfoIcon className="h-3.5 w-3.5 text-neutral-500" />
					<span className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-300">
						{t("wizard.launchpad.tax.breakdownTitle")}
					</span>
				</div>
				<ChevronDownIcon
					className={cn("h-3.5 w-3.5 text-neutral-500 transition-transform duration-200", open && "rotate-180")}
				/>
			</button>
			{open ? (
				<div className="border-t border-white/5 p-4 text-xs text-neutral-400 leading-relaxed space-y-2">
					<p>
						every trade pays <span className="font-mono text-white">{(taxBps / 100).toFixed(0)}%</span> tax.
					</p>
					<p>
						waifu takes <span className="font-mono text-white">{(platformCutBps / 100).toFixed(0)}%</span> of that tax
						off the top:{" "}
						<span className="font-mono text-white tabular-nums">{(platformCutVolumeBps / 100).toFixed(2)}%</span> of
						total trade volume.
					</p>
					<p>
						you allocate the remaining{" "}
						<span className="font-mono text-white tabular-nums">
							{((taxBps - platformCutVolumeBps) / 100).toFixed(2)}%
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
	);
}
