"use client";

import { useCallback, useId, useMemo } from "react";
import { cn } from "@/lib/utils";
import { type FlapFeeConfig, TAX_TIER_BPS } from "@/lib/launchpad/types";
import { validateFlap } from "@/lib/launchpad/validators";
import { InfoIcon } from "../launchpad-icons";

type Props = {
	value: FlapFeeConfig;
	onChange: (next: FlapFeeConfig) => void;
};

export default function FlapConfig({ value, onChange }: Props) {
	const vaultId = useId();
	const validation = useMemo(() => validateFlap(value), [value]);

	const setTax = useCallback((taxBps: FlapFeeConfig["taxBps"]) => onChange({ ...value, taxBps }), [onChange, value]);

	const setRecipient = useCallback(
		(recipient: FlapFeeConfig["recipient"]) => {
			if (recipient === "agent-treasury") {
				const next: FlapFeeConfig = { ...value, recipient };
				delete (next as { customVaultAddress?: string }).customVaultAddress;
				onChange(next);
				return;
			}
			onChange({ ...value, recipient });
		},
		[onChange, value],
	);

	return (
		<div className="flex flex-col gap-8">
			{/* Tax tier */}
			<section>
				<header className="mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">trade tax</h2>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
						flap charges tax on all trades, both during the curve and after graduation.
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

			{/* Recipient */}
			<section>
				<header className="mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">tax recipient</h2>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">
						where the collected tax routes. default is the agent's safe.
					</p>
				</header>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-2">
					{[
						{
							id: "agent-treasury" as const,
							label: "agent treasury",
							description: "default. taxes route into the agent's safe.",
						},
						{
							id: "custom-vault" as const,
							label: "custom vault",
							description: "advanced. route to any address you control.",
						},
					].map((opt) => {
						const active = value.recipient === opt.id;
						return (
							<button
								key={opt.id}
								type="button"
								role="radio"
								aria-checked={active}
								onClick={() => setRecipient(opt.id)}
								className={cn(
									"text-left p-4 border min-h-[88px]",
									"transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
									active ? "border-accent bg-accent/[0.04]" : "border-white/10 hover:border-white/25 bg-white/[0.012]",
								)}
							>
								<p className={cn("text-sm tracking-tight", active ? "text-white" : "text-neutral-200")}>{opt.label}</p>
								<p className="mt-1.5 text-[11px] text-neutral-500 leading-relaxed">{opt.description}</p>
							</button>
						);
					})}
				</div>
			</section>

			{/* Custom vault input */}
			{value.recipient === "custom-vault" ? (
				<section>
					<label htmlFor={vaultId} className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						custom vault address
					</label>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed max-w-[58ch]">
						0x-prefixed address on BSC. taxes route here on every trade.
					</p>
					<div
						className={cn(
							"mt-2 flex items-center h-12 border bg-white/[0.015] px-3 transition-colors",
							validation.errors.length > 0
								? "border-red-500/40 focus-within:border-red-500/70"
								: "border-white/10 focus-within:border-white/30",
						)}
					>
						<input
							id={vaultId}
							type="text"
							spellCheck={false}
							autoComplete="off"
							value={value.customVaultAddress ?? ""}
							onChange={(e) => onChange({ ...value, customVaultAddress: e.target.value.trim() })}
							placeholder="0x..."
							className="flex-1 bg-transparent outline-none text-sm font-mono text-white placeholder:text-neutral-600"
						/>
					</div>
					{validation.errors.length > 0 ? (
						<p className="mt-1.5 text-[11px] text-red-400 font-mono" role="alert">
							{validation.errors[0]}
						</p>
					) : null}
				</section>
			) : null}

			{/* Note */}
			<section className="border border-white/8 bg-white/[0.012] p-4 flex gap-3">
				<InfoIcon className="h-4 w-4 text-neutral-500 shrink-0 mt-0.5" />
				<p className="text-xs text-neutral-400 leading-relaxed">
					flap charges tax on all trades, both curve and post-graduation. the agent earns continuously, even after the
					token graduates to PancakeSwap.
				</p>
			</section>
		</div>
	);
}
