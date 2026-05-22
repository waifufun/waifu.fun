/**
 * Activity Feed - unified, typed stream of everything the agent does.
 *
 * Tweets render as tweets (avatar + body text + meta). Trades render as
 * tight scannable rows. Ships (merged PRs) render with a number badge.
 * Different visual rhythm per kind so the feed stops reading like a
 * wall of identical bullets.
 *
 * Accepts foundation `ActivityItem`s directly and additionally takes a
 * richer extended row type so the dashboard can stream events that the
 * bare foundation union does not model yet (deposits, position opens,
 * bet settlements, app ships).
 */

"use client";

import { type ReactNode, useMemo, useState } from "react";

import { BnbChainIcon, GithubIcon, StewardIcon, WaifuIcon, XIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import { resolveImageUrl } from "@/lib/image-url";
import type { ActivityItem } from "@/lib/wave-t/activity";
import { EMPTY_ACTIVITY_COPY } from "@/lib/wave-t/activity-trades";
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
			market: string;
			venue: string;
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
			amount: string;
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

// ── Per-row visual variants ──────────────────────────────────────

const NEUTRAL_ICON_CHIP = "border border-[var(--border-soft)] bg-white/[0.02] text-[var(--text-secondary)]";

function deltaTone(delta: number): { cls: string; sign: string } {
	if (delta > 0) return { cls: "text-[var(--positive)]", sign: "+" };
	if (delta < 0) return { cls: "text-[var(--negative)]", sign: "" };
	return { cls: "text-[var(--text-tertiary)]", sign: "" };
}

function pickVenueIcon(venue: string): ReactNode {
	if (venueIdOf(venue)) return <VenueIcon size={14} venue={venue} />;
	return <BnbChainIcon className="h-3.5 w-3.5" />;
}

// ── Tweet row (distinct visual) ──────────────────────────────────

function TweetRow({
	row,
	avatarUrl,
	handle,
}: {
	row: Extract<ActivityRowInput, { type: "tweet" }>;
	avatarUrl: string;
	handle: string | null;
}) {
	const body = (
		<>
			<div className="relative shrink-0">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					alt={handle ? `${handle} avatar` : "tweet avatar"}
					className="h-9 w-9 rounded-full object-cover"
					height={36}
					src={avatarUrl}
					style={{ boxShadow: "inset 0 0 0 1px var(--border-mid)" }}
					width={36}
				/>
				{/* X glyph badge in the corner so it's unambiguous this is a
				    tweet, not just an avatar floating in the feed. */}
				<span className="absolute -bottom-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--border-mid)] bg-[var(--bg-panel)]">
					<XIcon className="h-2.5 w-2.5" />
				</span>
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-1.5">
					{handle ? (
						<span className="font-mono text-[11px] text-[var(--text-primary)] tracking-tight">
							{handle.toLowerCase()}
						</span>
					) : (
						<span className="font-mono text-[11px] text-[var(--text-primary)]">posted on x</span>
					)}
					<span className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums">
						· {relativeTime(row.timestamp)}
					</span>
				</div>
				<p className="mt-1 line-clamp-3 text-[12.5px] text-[var(--text-secondary)] leading-[1.55] lowercase">
					{row.text}
				</p>
				<div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums">
					<span>{formatCompactNum(row.impressions)} views</span>
					{row.likes > 0 ? <span>{formatCompactNum(row.likes)} likes</span> : null}
				</div>
			</div>
		</>
	);

	return (
		<a
			href={row.url}
			rel="noopener noreferrer"
			target="_blank"
			className="-mx-2 flex items-start gap-3 rounded px-2 py-2.5 transition-colors hover:bg-white/[0.025]"
		>
			{body}
		</a>
	);
}

// ── PR (ship) row ────────────────────────────────────────────────

function ShipRow({ row }: { row: Extract<ActivityRowInput, { type: "pr" }> }) {
	const body = (
		<>
			<span
				className={cn("mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md", NEUTRAL_ICON_CHIP)}
			>
				<GithubIcon className="h-3.5 w-3.5" />
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="text-[12.5px] text-[var(--text-primary)]">shipped</span>
					<span className="rounded-sm border border-[var(--border-soft)] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
						pr #{row.number}
					</span>
				</div>
				<div className="mt-0.5 truncate text-[11.5px] text-[var(--text-secondary)] lowercase">{row.title}</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-0.5">
				<span className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums">
					{relativeTime(row.timestamp)}
				</span>
				<span className="font-mono text-[11px] text-[var(--positive)]">merged</span>
			</div>
		</>
	);

	return (
		<a
			href={row.url}
			rel="noopener noreferrer"
			target="_blank"
			className="-mx-2 flex items-start gap-3 rounded px-2 py-2.5 transition-colors hover:bg-white/[0.025]"
		>
			{body}
		</a>
	);
}

// ── Generic compact row (trades, positions, treasury, etc) ──────

type Visual = {
	icon: ReactNode;
	title: string;
	sub: string;
	right: ReactNode;
	url?: string | undefined;
};

function visualForCompact(row: ActivityRowInput): Visual | null {
	switch (row.type) {
		case "pr":
		case "tweet":
			return null; // handled by dedicated row components
		case "tx":
			return {
				icon: <BnbChainIcon className="h-3.5 w-3.5" />,
				title: "executed bsc tx",
				sub: row.method,
				right: <span className="text-[var(--text-primary)] tabular-nums">{row.valueBnb.toFixed(4)} BNB</span>,
				url: row.url,
			};
		case "revenue": {
			const tone = deltaTone(row.usd);
			return {
				icon: <WaifuIcon className="h-3.5 w-3.5" />,
				title: "revenue collected",
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
				title: `${positive ? "bought" : "sold"} ${row.asset.toLowerCase()}`,
				sub: `${formatCompactNum(row.amount)} ${row.asset} at ${row.priceBnb.toFixed(6)} bnb via ${row.venue.toLowerCase()}`,
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
			const verb = row.action === "open" ? "opened" : row.action === "close" ? "closed" : "adjusted";
			const dir = row.direction === "long" ? "long" : "short";
			return {
				icon: pickVenueIcon(row.venue),
				title: `${verb} ${dir} position`,
				sub: `${row.market}${row.leverage ? ` ${row.leverage}x` : ""} on ${row.venue.toLowerCase()}`,
				right: (
					<span className={cn("tabular-nums", tone.cls)}>
						{tone.sign}
						{formatCompactUsd(row.pnlUsd)} <span className="text-[var(--text-tertiary)]">p&l</span>
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
				title: row.result === "open" ? "placed prediction" : "prediction settled",
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
				row.action === "shipped" ? "shipped new app" : row.action === "updated" ? "updated app" : "deprecated app";
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
				title: verb,
				sub: row.version ? `${row.appName.toLowerCase()} ${row.version} is now live` : row.appName.toLowerCase(),
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
				row.action === "deposit" ? "deposited to" : row.action === "withdraw" ? "withdrew from" : "converted on";
			return {
				icon: pickVenueIcon(row.to || row.from),
				title: `${verb} ${(row.to || row.from).toLowerCase()}`,
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

function CompactRow({ row }: { row: ActivityRowInput }) {
	const v = visualForCompact(row);
	if (!v) return null;
	const body = (
		<>
			<span
				className={cn("mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md", NEUTRAL_ICON_CHIP)}
			>
				{v.icon}
			</span>
			<div className="min-w-0 flex-1">
				<div className="truncate text-[12.5px] text-[var(--text-primary)] lowercase">{v.title}</div>
				<div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">{v.sub}</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-0.5">
				<span className="font-mono text-[10px] text-[var(--text-tertiary)] tabular-nums">
					{relativeTime(row.timestamp)}
				</span>
				<span className="font-mono text-[11px] tabular-nums">{v.right}</span>
			</div>
		</>
	);

	if (v.url) {
		return (
			<a
				href={v.url}
				rel="noopener noreferrer"
				target="_blank"
				className="-mx-2 flex items-start gap-3 rounded px-2 py-2.5 transition-colors hover:bg-white/[0.025]"
			>
				{body}
			</a>
		);
	}
	return <div className="-mx-2 flex items-start gap-3 rounded px-2 py-2.5">{body}</div>;
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
				"inline-flex items-center gap-1.5 rounded-sm border px-2 py-1",
				"font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
				active
					? "border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent)]"
					: "border-[var(--border-soft)] text-[var(--text-secondary)] hover:border-[var(--border-mid)] hover:text-[var(--text-primary)]",
			)}
		>
			{children}
			{typeof count === "number" && count > 0 && (
				<span
					className={cn(
						"rounded-sm px-1 text-[9px] tabular-nums",
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

export type ActivityFeedAuthor = {
	/** Avatar shown in tweet rows. */
	avatarUrl?: string | undefined;
	/** Twitter handle shown above tweet bodies. */
	twitterHandle?: string | undefined;
};

const FALLBACK_AVATAR = "/brand/agents/waifu/portrait-amber.webp";

export function ActivityFeed({
	rows,
	max = 8,
	author,
	live = false,
}: {
	rows: ActivityRowInput[];
	max?: number;
	author?: ActivityFeedAuthor;
	/** When true, a tiny "live" pulse renders next to the panel header. */
	live?: boolean;
}) {
	const [tab, setTab] = useState<Tab>("all");

	const counts = useMemo(() => {
		const c: Record<Tab, number> = { all: rows.length, trading: 0, apps: 0, treasury: 0, market: 0, system: 0 };
		for (const r of rows) c[categoryOf(r)]++;
		return c;
	}, [rows]);

	const filtered = useMemo(() => (tab === "all" ? rows : rows.filter((r) => categoryOf(r) === tab)), [rows, tab]);
	const visible = filtered.slice(0, max);

	const avatarUrl = resolveImageUrl(author?.avatarUrl) ?? FALLBACK_AVATAR;
	const handle = author?.twitterHandle ? `@${author.twitterHandle.replace(/^@/, "")}` : null;

	return (
		<Panel>
			<Label
				right={
					live ? (
						<span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
							<span className="relative inline-flex h-1.5 w-1.5">
								<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-60" />
								<span
									className="relative inline-flex h-1.5 w-1.5 rounded-full"
									style={{ backgroundColor: "var(--accent)", boxShadow: "0 0 6px var(--accent)" }}
								/>
							</span>
							live
						</span>
					) : undefined
				}
			>
				Activity Feed
			</Label>

			{/* tabs */}
			<div className="-mx-1 mb-2 flex flex-wrap items-center gap-1">
				{TABS.map((t) => (
					<TabPill key={t.key} active={tab === t.key} onClick={() => setTab(t.key)} count={counts[t.key]}>
						{t.label}
					</TabPill>
				))}
			</div>

			{visible.length === 0 ? (
				<div className="py-4 font-mono text-[11px] text-[var(--text-tertiary)]">
					{tab === "all" ? EMPTY_ACTIVITY_COPY : `no ${tab} events yet`}
				</div>
			) : (
				<ul className="divide-y divide-[var(--border-soft)]">
					{visible.map((r) => (
						<li key={r.id}>
							{r.type === "tweet" ? (
								<TweetRow row={r} avatarUrl={avatarUrl} handle={handle} />
							) : r.type === "pr" ? (
								<ShipRow row={r} />
							) : (
								<CompactRow row={r} />
							)}
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}
