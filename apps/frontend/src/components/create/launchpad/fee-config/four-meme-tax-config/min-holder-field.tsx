"use client";

import { useId } from "react";

type Props = {
	value: string;
	onChange: (next: string) => void;
};

export function MinHolderField({ value, onChange }: Props) {
	const minHolderId = useId();
	return (
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
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="flex-1 bg-transparent outline-none text-sm font-mono tabular-nums text-white"
				/>
				<span className="ml-2 text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-600">tokens</span>
			</div>
		</section>
	);
}
