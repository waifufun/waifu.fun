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
		<div className={cn("flex items-center gap-2.5 py-2", muted && "opacity-50")}>
			<Icon className="size-3.5 text-[#52525b] shrink-0" />
			<div className="flex items-baseline gap-1.5 min-w-0 flex-1">
				<span className="text-[10px] font-mono uppercase tracking-wider text-[#52525b] shrink-0">{label}</span>
				<span className="text-xs font-mono text-[#e4e4e7] truncate">{value}</span>
			</div>
		</div>
	);
}

export default function RuntimeEconomicsCard({ token }: { token: IToken }) {
	const runtimeToken = token as RuntimeToken;

	// Collect available metrics
	const metrics: Array<{ label: string; value: string; icon: typeof Zap; muted?: boolean }> = [];

	// Runtime status
	if (token.agentStatus) {
		metrics.push({
			label: "runtime",
			value: formatRuntimeStatus(token.agentStatus),
			icon: Gauge,
		});
	}

	// Heartbeat
	if (runtimeToken.lastHeartbeatAt) {
		metrics.push({
			label: "heartbeat",
			value: fromNow(runtimeToken.lastHeartbeatAt),
			icon: Clock,
		});
	}

	// Claim status
	if (token.ownerClaimStatus) {
		metrics.push({
			label: "ownership",
			value: formatClaimStatus(token.ownerClaimStatus),
			icon: Zap,
		});
	}

	// Funding
	if (token.billingMode) {
		metrics.push({
			label: "funding",
			value: formatFundingMode(token.billingMode),
			icon: Banknote,
		});
	}

	// Reserve (if present)
	if (typeof token.infraReserveUsd === "number" && Number.isFinite(token.infraReserveUsd)) {
		metrics.push({
			label: "reserve",
			value: formatNumber(token.infraReserveUsd, true),
			icon: Banknote,
		});
	}

	// Nothing to show
	if (metrics.length === 0) {
		return null;
	}

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: 0.16, duration: 0.3 }}
			className="rounded-sm border border-white/6 bg-[#111114]/60 p-4"
		>
			<div className="flex items-center gap-2 mb-2">
				<Gauge className="size-3.5 text-[#00ff87]/60" />
				<span className="text-[10px] font-mono uppercase tracking-[0.16em] text-[#52525b]">runtime</span>
			</div>

			<div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3 divide-y divide-white/[0.03] sm:divide-y-0">
				{metrics.map((metric) => (
					<MetricTile key={metric.label} {...metric} />
				))}
			</div>
		</motion.div>
	);
}
