"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useMemo } from "react";
import { formatEther } from "viem";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDepositorsFeed } from "@/hooks/use-launch-vault";
import { useVaultEventsFallback } from "@/hooks/use-vault-events";
import type { DepositorEvent } from "@/lib/launch-vault/api";
import { cn } from "@/lib/utils";

type Props = {
	launchId: string | undefined;
	vaultAddress: `0x${string}` | undefined;
};

export function ActivityFeed({ launchId, vaultAddress }: Props) {
	const apiFeed = useDepositorsFeed(launchId);
	const apiEmpty = !apiFeed.isLoading && (apiFeed.data?.length ?? 0) === 0;
	const fallback = useVaultEventsFallback(vaultAddress, apiEmpty);

	const events = useMemo<DepositorEvent[]>(() => {
		const apiEvents = apiFeed.data ?? [];
		if (apiEvents.length > 0) return apiEvents;
		return fallback.data ?? [];
	}, [apiFeed.data, fallback.data]);

	const isLoading = apiFeed.isLoading || (apiEmpty && fallback.isLoading);

	return (
		<Card className="border-white/10 bg-[#08080a] py-0">
			<CardHeader className="flex flex-row items-center justify-between border-b border-white/10 px-6 py-5">
				<CardTitle className="text-base font-semibold text-zinc-100">activity</CardTitle>
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">
					last {events.length || 10}
				</span>
			</CardHeader>
			<CardContent className="px-0 py-0">
				{isLoading && events.length === 0 ? (
					<ActivityFeedSkeleton />
				) : events.length === 0 ? (
					<EmptyRow text="no deposits yet. be the first." />
				) : (
					<ul className="divide-y divide-white/5">
						{events.map((event, idx) => (
							<EventRow key={`${event.txHash ?? "x"}-${idx}`} event={event} />
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function EventRow({ event }: { event: DepositorEvent }) {
	const isDeposit = event.kind === "deposit";
	const amount = (() => {
		try {
			return formatEther(BigInt(event.amountWei));
		} catch {
			return event.amountWei;
		}
	})();
	const ts = formatRelative(event.timestamp);
	const short = shortAddr(event.address);
	const explorerHref = event.txHash ? `https://bscscan.com/tx/${event.txHash}` : undefined;

	const RowInner = (
		<>
			<div className="flex items-center gap-3">
				<span
					className={cn(
						"flex size-7 items-center justify-center border",
						isDeposit
							? "border-[#00ff87]/40 bg-[#00ff87]/10 text-[#00ff87]"
							: "border-orange-400/40 bg-orange-400/10 text-orange-300",
					)}
				>
					{isDeposit ? <ArrowDownLeft className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
				</span>
				<div className="flex flex-col">
					<span className="text-sm text-zinc-100">
						{isDeposit ? "deposit" : "withdraw"} <span className="text-zinc-500">·</span>{" "}
						<span className="font-mono text-zinc-300">{short}</span>
					</span>
					<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{ts}</span>
				</div>
			</div>
			<span className="font-mono text-sm tabular-nums text-zinc-100">
				{formatAmount(amount)} <span className="text-xs text-zinc-500">bnb</span>
			</span>
		</>
	);

	if (explorerHref) {
		return (
			<li>
				<a
					href={explorerHref}
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center justify-between px-6 py-3 transition-colors hover:bg-white/[0.02]"
				>
					{RowInner}
				</a>
			</li>
		);
	}
	return <li className="flex items-center justify-between px-6 py-3">{RowInner}</li>;
}

function EmptyRow({ text }: { text: string }) {
	return <div className="px-6 py-8 text-center text-sm text-zinc-500">{text}</div>;
}

function ActivityFeedSkeleton() {
	return (
		<ul className="divide-y divide-white/5">
			{Array.from({ length: 4 }).map((_, i) => (
				<li
					// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
					key={i}
					className="flex items-center justify-between px-6 py-3 relative overflow-hidden"
				>
					<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" />
					<div className="flex items-center gap-3">
						<div className="size-7 bg-white/5 rounded-sm" />
						<div className="flex flex-col gap-1">
							<div className="h-3 w-32 bg-white/5 rounded-sm" />
							<div className="h-2 w-16 bg-white/5 rounded-sm" />
						</div>
					</div>
					<div className="h-3 w-16 bg-white/5 rounded-sm" />
				</li>
			))}
		</ul>
	);
}

function shortAddr(value: string): string {
	if (!value || value.length < 10) return value || "–";
	return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatAmount(value: string): string {
	const num = Number(value);
	if (!Number.isFinite(num)) return value;
	if (num === 0) return "0";
	if (num >= 100) return num.toFixed(1);
	if (num >= 1) return num.toFixed(3);
	return num.toFixed(4);
}

function formatRelative(iso: string): string {
	const t = Date.parse(iso);
	if (!Number.isFinite(t)) return iso;
	const diffSec = Math.max(0, Math.floor((Date.now() - t) / 1000));
	if (diffSec < 60) return `${diffSec}s ago`;
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m ago`;
	const diffH = Math.floor(diffMin / 60);
	if (diffH < 24) return `${diffH}h ago`;
	const diffD = Math.floor(diffH / 24);
	return `${diffD}d ago`;
}
