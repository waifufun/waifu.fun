"use client";

import { cn, formatNumber, fromNow } from "@/lib/utils";
import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";
import { Banknote, Clock, Gauge, Zap } from "lucide-react";

type RuntimeStatus = NonNullable<IToken["agentStatus"]>;
type ClaimStatus = NonNullable<IToken["ownerClaimStatus"]>;
type BillingMode = NonNullable<IToken["billingMode"]>;

type RuntimeToken = IToken & {
	lastHeartbeatAt?: string | Date | null;
};

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
			return "platform";
		case "hybrid":
			return "shared";
	}
}

function MetricTile({
	label,
	value,
	icon: Icon,
	muted = false,
}: {
	label: string;
	value: string;
	icon: typeof Zap;
	muted?: boolean;
}) {
	return (
		<div className={cn("flex items-baseline justify-between gap-2 py-1.5", muted && "opacity-40")}>
			<div className="flex items-center gap-2">
				<Icon className="size-3 text-zinc-700 shrink-0" />
				<span className="text-[10px] font-mono uppercase tracking-wider text-zinc-700">{label}</span>
			</div>
			<span className="text-[11px] font-mono text-zinc-400 truncate">{value}</span>
		</div>
	);
}

export default function RuntimeEconomicsCard({ token }: { token: IToken }) {
	const runtimeToken = token as RuntimeToken;

	const metrics: Array<{ label: string; value: string; icon: typeof Zap; muted?: boolean }> = [];

	if (token.agentStatus) {
		metrics.push({
			label: "runtime",
			value: formatRuntimeStatus(token.agentStatus),
			icon: Gauge,
		});
	}

	if (runtimeToken.lastHeartbeatAt) {
		metrics.push({
			label: "heartbeat",
			value: fromNow(runtimeToken.lastHeartbeatAt),
			icon: Clock,
		});
	}

	if (token.ownerClaimStatus) {
		metrics.push({
			label: "ownership",
			value: formatClaimStatus(token.ownerClaimStatus),
			icon: Zap,
		});
	}

	if (token.billingMode) {
		metrics.push({
			label: "funding",
			value: formatFundingMode(token.billingMode),
			icon: Banknote,
		});
	}

	if (typeof token.infraReserveUsd === "number" && Number.isFinite(token.infraReserveUsd)) {
		metrics.push({
			label: "reserve",
			value: formatNumber(token.infraReserveUsd, true),
			icon: Banknote,
		});
	}

	// Nothing to show — render nothing
	if (metrics.length === 0) {
		return null;
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.16, duration: 0.3 }}
			className="rounded-sm border border-white/[0.04] bg-[#111114]/40 p-4"
		>
			<div className="flex items-center gap-2 mb-2">
				<Gauge className="size-3 text-zinc-700" />
				<span className="text-[10px] font-mono uppercase tracking-[0.16em] text-zinc-700">runtime</span>
			</div>

			<div className="divide-y divide-white/[0.03]">
				{metrics.map((metric) => (
					<MetricTile key={metric.label} {...metric} />
				))}
			</div>
		</motion.div>
	);
}
