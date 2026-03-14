"use client";

import { formatNumber, fromNow } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { Activity, Banknote, ShieldCheck } from "lucide-react";

type RuntimeStatus = NonNullable<IToken["agentStatus"]>;
type ClaimStatus = NonNullable<IToken["ownerClaimStatus"]>;
type BillingMode = NonNullable<IToken["billingMode"]>;

type RuntimeToken = IToken & {
	lastHeartbeatAt?: string | Date | null;
};

function Section({
	label,
	icon: Icon,
	rows,
}: {
	label: string;
	icon: typeof Activity;
	rows: Array<{ key: string; value: string }>;
}) {
	if (!rows.length) return null;

	return (
		<section className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] px-3 py-3">
			<div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[#71717a]">
				<Icon className="size-3 text-[#52525b]" />
				<span>{label}</span>
			</div>

			<div className="mt-3 space-y-2">
				{rows.map((row) => (
					<div
						key={row.key}
						className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 last:border-b-0 last:pb-0"
					>
						<span className="text-[11px] uppercase tracking-[0.14em] text-[#71717a]">{row.key}</span>
						<span className="text-right text-sm font-mono text-[#f4f4f5]">{row.value}</span>
					</div>
				))}
			</div>
		</section>
	);
}

function formatRuntimeStatus(status: RuntimeStatus) {
	return status.replace(/_/g, " ");
}

function formatClaimStatus(status: ClaimStatus) {
	switch (status) {
		case "verified":
			return "verified";
		case "claimed":
			return "claimed";
		case "disputed":
			return "disputed";
		case "unclaimed":
			return "unclaimed";
		default:
			return status;
	}
}

function formatFundingMode(mode: BillingMode) {
	switch (mode) {
		case "owner_credits":
			return "creator-funded";
		case "waifu_treasury_subsidy":
			return "platform-subsidized";
		case "hybrid":
			return "shared";
	}
}

function getOperationalRows(token: RuntimeToken) {
	const rows: Array<{ key: string; value: string }> = [];

	if (token.agentStatus) {
		rows.push({ key: "status", value: formatRuntimeStatus(token.agentStatus) });
	}

	if (token.lastHeartbeatAt) {
		rows.push({ key: "heartbeat", value: fromNow(token.lastHeartbeatAt) });
	}

	if (token.ownerClaimStatus) {
		rows.push({ key: "claim", value: formatClaimStatus(token.ownerClaimStatus) });
	}

	if (token.reviveAt) {
		rows.push({ key: "resumed", value: new Date(token.reviveAt).toLocaleString("en-US") });
	} else if (token.suspendAt) {
		rows.push({ key: "suspended", value: new Date(token.suspendAt).toLocaleString("en-US") });
	}

	return rows;
}

function getFundingRows(token: IToken) {
	const rows: Array<{ key: string; value: string }> = [];

	if (typeof token.infraReserveUsd === "number" && Number.isFinite(token.infraReserveUsd)) {
		rows.push({ key: "reserve", value: formatNumber(token.infraReserveUsd, true) });
	}

	if (token.billingMode) {
		rows.push({ key: "funding", value: formatFundingMode(token.billingMode) });
	}

	return rows;
}

export default function RuntimeEconomicsCard({ token }: { token: IToken }) {
	const runtimeToken = token as RuntimeToken;
	const operationalRows = getOperationalRows(runtimeToken);
	const fundingRows = getFundingRows(token);
	const hasData = operationalRows.length > 0 || fundingRows.length > 0;

	return (
		<div className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114] p-4 sm:p-5">
			<div>
				<p className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#71717a]">economics</p>
				<h3 className="mt-1 text-sm font-semibold lowercase tracking-wide text-[#f4f4f5]">runtime economics</h3>
			</div>

			{hasData ? (
				<div className="mt-4 grid gap-2 sm:grid-cols-2">
					<Section label="runtime status" icon={Activity} rows={operationalRows} />
					<Section label="funding" icon={Banknote} rows={fundingRows} />
				</div>
			) : (
				<div className="mt-4 rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#08080a] px-3 py-3">
					<div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.16em] text-[#71717a]">
						<ShieldCheck className="size-3 text-[#52525b]" />
						<span>runtime status</span>
					</div>
					<p className="mt-2 text-xs leading-relaxed text-[#71717a]">
						No public runtime economics data is exposed on this token yet.
					</p>
				</div>
			)}
		</div>
	);
}
