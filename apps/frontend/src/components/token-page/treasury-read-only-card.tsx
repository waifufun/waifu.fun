"use client";

import { abbreviateNumber, shortenAddress } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { Banknote, Clock3, ShieldCheck, Wallet } from "lucide-react";

function TreasuryRow({
	label,
	value,
	description,
	icon: Icon,
}: {
	label: string;
	value: string;
	description: string;
	icon: typeof Banknote;
}) {
	return (
		<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] px-3 py-2.5">
			<div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[#71717a]">
				<Icon className="size-3 text-[#52525b]" />
				<span>{label}</span>
			</div>
			<p className="mt-1 text-sm font-mono text-[#e4e4e7]">{value}</p>
			<p className="mt-1 text-[11px] leading-relaxed text-[#71717a]">{description}</p>
		</div>
	);
}

function formatWallets(wallets?: string[]) {
	if (!wallets?.length) return "not exposed";
	if (wallets.length === 1) return shortenAddress(wallets[0] ?? "");
	return `${wallets.length} wallets`;
}

export default function TreasuryReadOnlyCard({ token }: { token: IToken }) {
	const infraReserveValue =
		typeof token.infraReserveUsd === "number" ? `$${abbreviateNumber(token.infraReserveUsd)}` : "not reported";
	const nextLifecycleDate =
		token.reviveAt ?? token.suspendAt ?? token.lastClaimedAt ?? token.updatedAt ?? token.createdAt ?? null;
	const lifecycleLabel = token.reviveAt
		? "revive window"
		: token.suspendAt
			? "suspend window"
			: token.lastClaimedAt
				? "last claim"
				: "last update";
	const ownerWalletSummary = token.ownerWallets?.solana?.length
		? formatWallets(token.ownerWallets.solana)
		: token.ownerWallets?.evm?.length
			? formatWallets(token.ownerWallets.evm)
			: "not exposed";

	return (
		<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4 sm:p-5">
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#71717a]">treasury</p>
					<h3 className="mt-1 text-sm font-semibold lowercase tracking-wide text-[#f4f4f5]">
						Read-only treasury and operator metadata.
					</h3>
				</div>
				<span className="rounded-sm border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-[#a1a1aa]">
					partial data
				</span>
			</div>

			<div className="mt-4 grid gap-2 sm:grid-cols-2">
				<TreasuryRow
					label="infra reserve"
					value={infraReserveValue}
					description={
						typeof token.infraReserveUsd === "number"
							? "Current infra reserve value exposed by the runtime overlay."
							: "No treasury balance field is exposed on this token yet."
					}
					icon={Banknote}
				/>
				<TreasuryRow
					label="billing mode"
					value={token.billingMode ?? "not reported"}
					description="Billing mode is shown only when the runtime overlay exposes it."
					icon={ShieldCheck}
				/>
				<TreasuryRow
					label="operator wallets"
					value={ownerWalletSummary}
					description={
						token.ownerWallets?.solana?.length || token.ownerWallets?.evm?.length
							? "Owner wallet inventory is visible, but balances are not exposed here."
							: "No owner wallet list is currently available on the public token payload."
					}
					icon={Wallet}
				/>
				<TreasuryRow
					label={lifecycleLabel}
					value={nextLifecycleDate ? new Date(nextLifecycleDate).toLocaleString("en-US") : "not scheduled"}
					description="This is the closest exposed lifecycle timestamp. Treasury transfers are not available from current fields."
					icon={Clock3}
				/>
			</div>
		</div>
	);
}
