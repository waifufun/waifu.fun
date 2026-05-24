"use client";

import { useTranslation } from "@/contexts/locale-context";
import { useId } from "react";

type Props = {
	value: string;
	onChange: (next: string) => void;
};

export function MinHolderField({ value, onChange }: Props) {
	const { t } = useTranslation();
	const minHolderId = useId();
	return (
		<section>
			<label htmlFor={minHolderId} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
				{t("wizard.launchpad.tax.minHolder")}
			</label>
			<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[58ch]">
				{t("wizard.launchpad.tax.minHolderHelp")}
			</p>
			<div className="mt-2 flex items-center h-12 border border-white/10 bg-white/[0.015] px-3 focus-within:border-white/30 transition-colors">
				<input
					id={minHolderId}
					type="number"
					min={0}
					step={1000}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="flex-1 bg-transparent outline-none text-sm font-mono tabular-nums text-white"
				/>
				<span className="ml-2 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">
					{t("wizard.launchpad.tax.tokens")}
				</span>
			</div>
		</section>
	);
}
