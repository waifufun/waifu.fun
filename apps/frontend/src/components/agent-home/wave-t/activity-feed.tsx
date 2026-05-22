/**
 * Worker C - Activity Feed (v2).
 *
 * Unified, typed stream of everything Sol does: trades, app ships,
 * treasury moves, market activity (predictions / positions), system
 * events. Tabs at the top filter by category. Each row carries its
 * own brand icon + tint so a skimmer can scan the feed visually.
 *
 * Accepts foundation `ActivityItem`s directly and additionally takes
 * a richer extended row type so the dashboard can stream events that
 * the bare foundation union does not model yet (deposits, position
 * opens, bet settlements, app ships).
 */

"use client";

import { ChevronRightIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { BnbChainIcon, GithubIcon, StewardIcon, WaifuIcon, XIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import type { ActivityItem } from "@/lib/wave-t/activity";
import { formatCompactNum, formatCompactUsd } from "@/lib/wave-t/format";
import { relativeTime } from "@/lib/wave-t/github";
import type { TokenChain } from "@/lib/wave-t/token-logo";
import { venueIdOf } from "@/lib/wave-t/venues";
import { Label, Panel, TokenIcon, VenueIcon } from "./_primitives";

function chainFromVenue(venue: string): TokenChain {
	const v = venue.toLowerCase();
	if (v.includes("bsc") || v.includes("pancake") || v.includes("four")) return "bsc";
	if (v.includes("polygon")) return "polygon";
	if (v.includes("solana") || v.includes("drift")) return "solana";
	if (v.includes("base")) return "base";
	return "ethereum";
}

// ── Extended row model ────────────────────────────────────────────

export type ActivityCategory = "trading" | "apps" | "treasury" | "market" | "system";

export type ActivityRowInput =
	| ActivityItem
	| {
			id: string;
			type: "trade";
			timestamp: string;
			side: "buy" | "sell";
			asset: string;
			amount: number;
			priceBnb: number;
			venue: string;
			deltaUsd?: number;
			url?: string;
	  }
	| {
			id: string;
			type: "position";
			timestamp: string;
			action: "open" | "close" | "adjust";
			market: string; // "BTC-USD"
			venue: string; // "Hyperliquid"
			leverage?: number;
			direction: "long" | "short";
			pnlUsd: number;
			url?: string;
	  }
	| {
			id: string;
			type: "bet";
			timestamp: string;
			market: "polymarket" | "kalshi";
			question: string;
			result: "yes" | "no" | "open";
			pnlUsd: number;
			url?: string;
	  }
	| {
			id: string;
			type: "app";
			timestamp: string;
			action: "shipped" | "updated" | "deprecated";
			appName: string;
			version?: string;
			revenueUsd?: number;
			url?: string;
	  }
	| {
			id: string;
			type: "treasury";
			timestamp: string;
			action: "deposit" | "withdraw" | "convert";
			from: string;
			to: string;
			amount: string; // free-form "50,000 USDC"
			deltaUsd: number;
			url?: string;
	  };

// ── Tab definitions ──────────────────────────────────────────────

type Tab = "all" | ActivityCategory;

const TABS: { key: Tab; label: string }[] = [
	{ key: "all", label: "All" },
	{ key: "trading", label: "Trading" },
	{ key: "apps", label: "Apps" },
	{ key: "treasury", label: "Treasury" },
	{ key: "market", label: "Market" },
	{ key: "system", label: "System" },
];

function categoryOf(row: ActivityRowInput): ActivityCategory {
	switch (row.type) {
		case "trade":
			return "trading";
		case "position":
			return "trading";
		case "bet":
			return "market";
		case "app":
			return "apps";
		case "treasury":
			return "treasury";
		case "revenue":
			return "treasury";
		case "tx":
			return "trading";
		case "tweet":
			return "system";
		case "pr":
			return "system";
	}
}

// ── Visual presentation per row ──────────────────────────────────

type Visual = {
	icon: ReactNode;
	tint: string;
	bg: string;
	title: string;
	sub: string;
	right: ReactNode;
	url?: string | undefined;
};

function pickVenueIcon(venue: string): ReactNode {
	if (venueIdOf(venue)) return <VenueIcon size={14} venue={venue} />;
	return <BnbChainIcon className="h-3.5 w-3.5" />;
}

function deltaTone(delta: number): { cls: string; sign: string } {
	if (delta > 0) return { cls: "text-[var(--positive)]", sign: "+" };
	if (delta < 0) return { cls: "text-[var(--negative)]", sign: "" };
	return { cls: "text-[var(--text-tertiary)]", sign: "" };
}

function visualFor(row: ActivityRowInput): Visual {
	switch (row.type) {
		case "pr":
			return {
				icon: <GithubIcon className="h-3.5 w-3.5" />,
				tint: "text-[var(--accent)]",
				bg: "bg-[var(--accent-soft)]",
				title: `Merged PR #${row.number}`,
				sub: row.title,
				right: <span className="text-[var(--positive)]">merged</span>,
				url: row.url,
			};
		case "tweet":
			return {
				icon: <XIcon className="h-3.5 w-3.5" />,
				tint: "text-sky-300",
				bg: "bg-sky-300/10",
				title: "Posted on X",
				sub: row.text.length > 64 ? `${row.text.slice(0, 64)}…` : row.text,
				right: <span className="text-[var(--text-secondary)]">{formatCompactNum(row.impressions)} views</span>,
				url: row.url,
			};
		case "tx":
			return {
				icon: <BnbChainIcon className="h-3.5 w-3.5" />,
				tint: "text-amber-300",
				bg: "bg-amber-300/10",
				title: "Executed BSC tx",
				sub: row.method,
				right: <span className="text-[var(--text-primary)] tabular-nums">{row.valueBnb.toFixed(4)} BNB</span>,
				url: row.url,
			};
		case "revenue": {
			const tone = deltaTone(row.usd);
			return {
				icon: <WaifuIcon className="h-3.5 w-3.5" />,
				tint: "text-[var(--positive)]",
				bg: "bg-[var(--positive)]/10",
				title: "Revenue collected",
				sub: `${row.source} stream`,
				right: (
					<span className={cn("tabular-nums", tone.cls)}>
						{tone.sign}
						{formatCompactUsd(row.usd)}
					</span>
				),
			};
		}
		case "trade": {
			const positive = row.side === "buy";
			return {
				icon: pickVenueIcon(row.venue),
				tint: positive ? "text-[var(--positive)]" : "text-[var(--negative)]",
				bg: positive ? "bg-[var(--positive)]/10" : "bg-[var(--negative)]/10",
				title: `${positive ? "Bought" : "Sold"} ${row.asset}`,
				sub: `${formatCompactNum(row.amount)} ${row.asset} at ${row.priceBnb.toFixed(6)} BNB via ${row.venue}`,
				right: (
					<span className="inline-flex items-center gap-1.5 tabular-nums">
						<TokenIcon address="" chain={chainFromVenue(row.venue)} size={12} symbol={row.asset} />
						<span className={cn(positive ? "text-[var(--positive)]" : "text-[var(--negative)]")}>
							{positive ? "+" : "-"}
							{formatCompactNum(row.amount)} {row.asset}
						</span>
					</span>
				),
				url: row.url,
			};
		}
		case "position": {
			const tone = deltaTone(row.pnlUsd);
			const verb = row.action === "open" ? "Opened" : row.action === "close" ? "Closed" : "Adjusted";
			const dir = row.direction === "long" ? "long" : "short";
			return {
				icon: pickVenueIcon(row.venue),
				tint: row.direction === "long" ? "text-[var(--positive)]" : "text-[var(--negative)]",
				bg: row.direction === "long" ? "bg-[var(--positive)]/10" : "bg-[var(--negative)]/10",
				title: `${verb} ${dir} position`,
				sub: `${row.market}${row.leverage ? ` ${row.leverage}x` : ""} on ${row.venue}`,
				right: (
					<span className={cn("tabular-nums", tone.cls)}>
						{tone.sign}
						{formatCompactUsd(row.pnlUsd)} <span className="text-[var(--text-tertiary)]">P&L</span>
					</span>
				),
				url: row.url,
			};
		}
		case "bet": {
			const tone = deltaTone(row.pnlUsd);
			const chipCls =
				row.result === "yes"
					? "border-[var(--positive)]/40 bg-[var(--positive)]/10 text-[var(--positive)]"
					: row.result === "no"
						? "border-[var(--negative)]/40 bg-[var(--negative)]/10 text-[var(--negative)]"
						: "border-[var(--border-mid)] bg-white/[0.02] text-[var(--text-secondary)]";
			return {
				icon: <VenueIcon size={14} venue={row.market} />,
				tint: "text-fuchsia-300",
				bg: "bg-fuchsia-300/10",
				title: row.result === "open" ? "Placed prediction" : "Prediction settled",
				sub: row.question.length > 60 ? `${row.question.slice(0, 60)}…` : row.question,
				right: (
					<span className="flex items-center gap-2">
						<span
							className={cn(
								"rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em]",
								chipCls,
							)}
						>
							{row.result}
						</span>
						{row.pnlUsd !== 0 && (
							<span className={cn("tabular-nums", tone.cls)}>
								{tone.sign}
								{formatCompactUsd(row.pnlUsd)}
							</span>
						)}
					</span>
				),
				url: row.url,
			};
		}
		case "app": {
			const verb =
				row.action === "shipped" ? "Shipped new app" : row.action === "updated" ? "Updated app" : "Deprecated app";
			const isWaifu = row.appName.toLowerCase().includes("waifu");
			const isSteward = row.appName.toLowerCase().includes("steward");
			const icon = isWaifu ? (
				<WaifuIcon className="h-3.5 w-3.5" />
			) : isSteward ? (
				<StewardIcon className="h-3.5 w-3.5" />
			) : (
				<GithubIcon className="h-3.5 w-3.5" />
			);
			const tone = deltaTone(row.revenueUsd ?? 0);
			return {
				icon,
				tint: "text-[var(--accent)]",
				bg: "bg-[var(--accent-soft)]",
				title: verb,
				sub: row.version ? `${row.appName} ${row.version} is now live` : row.appName,
				right:
					row.revenueUsd && row.revenueUsd !== 0 ? (
						<span className={cn("tabular-nums", tone.cls)}>
							{tone.sign}
							{formatCompactUsd(row.revenueUsd)} <span className="text-[var(--text-tertiary)]">app revenue</span>
						</span>
					) : (
						<span className="text-[var(--text-secondary)]">live</span>
					),
				url: row.url,
			};
		}
		case "treasury": {
			const tone = deltaTone(row.deltaUsd);
			const verb =
				row.action === "deposit" ? "Deposited to" : row.action === "withdraw" ? "Withdrew from" : "Converted on";
			return {
				icon: pickVenueIcon(row.to || row.from),
				tint: "text-amber-300",
				bg: "bg-amber-300/10",
				title: `${verb} ${row.to || row.from}`,
				sub: `${row.amount}`,
				right: (
					<span className={cn("tabular-nums", tone.cls)}>
						{tone.sign}
						{formatCompactUsd(row.deltaUsd)}
					</span>
				),
				url: row.url,
			};
		}
	}
}

// ── Row component ─────────────────────────────────────────────────

function Row({ row }: { row: ActivityRowInput }) {
	const v = visualFor(row);
	const body = (
		<>
			<span
				className={cn("mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full", v.bg, v.tint)}
			>
				{v.icon}
			</span>
			<div className="min-w-0 flex-1">
				<div className="truncate text-[13px] text-[var(--text-primary)]">{v.title}</div>
				<div className="mt-0.5 truncate text-[11.5px] text-[var(--text-secondary)]">{v.sub}</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-0.5">
				<span className="font-mono text-[11px] text-[var(--text-tertiary)]">{relativeTime(row.timestamp)}</span>
				<span className="font-mono text-[11.5px] tabular-nums">{v.right}</span>
			</div>
		</>
	);

	if (v.url) {
		return (
			<a
				href={v.url}
				rel="noreferrer"
				target="_blank"
				className="-mx-2 flex items-start gap-3 rounded px-2 py-3 transition-colors hover:bg-white/[0.025]"
			>
				{body}
			</a>
		);
	}
	return <div className="-mx-2 flex items-start gap-3 rounded px-2 py-3">{body}</div>;
}

// ── Tab control ───────────────────────────────────────────────────

function TabPill({
	active,
	children,
	onClick,
	count,
}: {
	active: boolean;
	children: ReactNode;
	onClick: () => void;
	count?: number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
				"font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
				active
					? "bg-[var(--accent-soft)] text-[var(--accent)]"
					: "text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]",
			)}
		>
			{children}
			{typeof count === "number" && count > 0 && (
				<span
					className={cn(
						"rounded-full px-1 text-[9px] tabular-nums",
						active ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-white/[0.04] text-[var(--text-tertiary)]",
					)}
				>
					{count}
				</span>
			)}
		</button>
	);
}

// ── Component ─────────────────────────────────────────────────────

export function ActivityFeed({ rows, max = 8 }: { rows: ActivityRowInput[]; max?: number }) {
	const [tab, setTab] = useState<Tab>("all");

	const counts = useMemo(() => {
		const c: Record<Tab, number> = { all: rows.length, trading: 0, apps: 0, treasury: 0, market: 0, system: 0 };
		for (const r of rows) c[categoryOf(r)]++;
		return c;
	}, [rows]);

	const filtered = useMemo(() => (tab === "all" ? rows : rows.filter((r) => categoryOf(r) === tab)), [rows, tab]);
	const visible = filtered.slice(0, max);

	return (
		<Panel>
			<Label>Activity Feed</Label>

			{/* tabs */}
			<div className="-mx-1 mb-2 flex flex-wrap items-center gap-1">
				{TABS.map((t) => (
					<TabPill key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} count={counts[t.key]}>
						{t.label}
					</TabPill>
				))}
			</div>

			{visible.length === 0 ? (
				<div className="py-6 text-center font-mono text-[11px] text-[var(--text-tertiary)]">
					no {tab === "all" ? "events" : `${tab} events`} yet
				</div>
			) : (
				<ul className="divide-y divide-[var(--border-soft)]">
					{visible.map((r) => (
						<li key={r.id}>
							<Row row={r} />
						</li>
					))}
				</ul>
			)}

			<a
				href="#activity"
				className={cn(
					"mt-3 flex items-center justify-center gap-1.5 border-t border-[var(--border-soft)] pt-3",
					"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]",
					"transition-colors hover:text-[var(--accent)]",
				)}
			>
				View all activity
				<ChevronRightIcon className="h-3 w-3" />
			</a>
		</Panel>
	);
}
