/**
 * Worker C - Activity Feed
 *
 * Unified, typed stream merging PRs, tweets, on-chain txs, and revenue events.
 * Each row carries its own brand icon and color tint so a user can scan the
 * feed at a glance and know what kind of work just happened.
 *
 * Visual contract:
 * - Header label + "All Events" filter dropdown on the right.
 * - 5 visible rows by default. Each row: brand icon (tinted square) +
 *   action title + sub-text + timestamp + amount/status.
 * - Footer link to the full activity stream.
 */

"use client";

import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { BnbChainIcon, GithubIcon, WaifuIcon, XIcon } from "@/components/brand-icons";
import { cn } from "@/lib/utils";

import type { ActivityItem } from "../lib/activity";
import { formatCompactNum, formatCompactUsd } from "../lib/format";
import { relativeTime } from "../lib/github";
import { Label, Panel } from "./_primitives";

type Filter = "all" | "pr" | "tweet" | "tx" | "revenue";

const FILTER_LABELS: Record<Filter, string> = {
	all: "All Events",
	pr: "Ships",
	tweet: "Voice",
	tx: "On-chain",
	revenue: "Revenue",
};

type RowMeta = {
	icon: ReactNode;
	tint: string; // tailwind text class
	bg: string; // tailwind bg class
	title: string;
	sub: string;
	right: ReactNode;
	url?: string;
};

function describe(item: ActivityItem): RowMeta {
	if (item.type === "pr") {
		return {
			icon: <GithubIcon className="h-3.5 w-3.5" />,
			tint: "text-[var(--accent)]",
			bg: "bg-[var(--accent-soft)]",
			title: `Merged PR #${item.number}`,
			sub: item.title,
			right: <span className="text-[var(--positive)]">merged</span>,
			url: item.url,
		};
	}
	if (item.type === "tweet") {
		return {
			icon: <XIcon className="h-3.5 w-3.5" />,
			tint: "text-sky-300",
			bg: "bg-sky-300/10",
			title: "Posted on X",
			sub: item.text.length > 60 ? `${item.text.slice(0, 60)}…` : item.text,
			right: <span className="text-[var(--text-secondary)]">{formatCompactNum(item.impressions)} views</span>,
			url: item.url,
		};
	}
	if (item.type === "tx") {
		return {
			icon: <BnbChainIcon className="h-3.5 w-3.5" />,
			tint: "text-amber-300",
			bg: "bg-amber-300/10",
			title: "Executed BSC tx",
			sub: item.method,
			right: <span className="text-[var(--text-primary)] tabular-nums">{item.valueBnb.toFixed(4)} BNB</span>,
			url: item.url,
		};
	}
	// revenue
	return {
		icon: <WaifuIcon className="h-3.5 w-3.5" />,
		tint: "text-[var(--positive)]",
		bg: "bg-[var(--positive)]/10",
		title: "Revenue collected",
		sub: `${item.source} stream`,
		right: <span className="text-[var(--positive)] tabular-nums">+{formatCompactUsd(item.usd)}</span>,
	};
}

function Row({ item }: { item: ActivityItem }) {
	const m = describe(item);
	const body = (
		<>
			<span className={cn("mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded", m.bg, m.tint)}>
				{m.icon}
			</span>
			<div className="min-w-0 flex-1">
				<div className="truncate font-mono text-[12px] text-[var(--text-primary)]">{m.title}</div>
				<div className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">{m.sub}</div>
			</div>
			<div className="flex shrink-0 flex-col items-end gap-0.5">
				<span className="font-mono text-[10px] text-[var(--text-tertiary)]">{relativeTime(item.timestamp)}</span>
				<span className="font-mono text-[11px] tabular-nums">{m.right}</span>
			</div>
		</>
	);

	if (m.url) {
		return (
			<a
				href={m.url}
				rel="noreferrer"
				target="_blank"
				className="-mx-2 flex items-start gap-3 rounded px-2 py-2.5 transition-colors hover:bg-white/[0.025]"
			>
				{body}
			</a>
		);
	}
	return <div className="-mx-2 flex items-start gap-3 rounded px-2 py-2.5">{body}</div>;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
	const [filter, setFilter] = useState<Filter>("all");
	const [open, setOpen] = useState(false);

	const filtered = useMemo(() => (filter === "all" ? items : items.filter((i) => i.type === filter)), [items, filter]);
	const visible = filtered.slice(0, 5);

	return (
		<Panel>
			<Label
				right={
					<div className="relative">
						<button
							type="button"
							onClick={() => setOpen((v) => !v)}
							className={cn(
								"inline-flex items-center gap-1.5 rounded border border-[var(--border-soft)]",
								"bg-white/[0.02] px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
								"text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]",
							)}
							aria-haspopup="menu"
							aria-expanded={open}
						>
							{FILTER_LABELS[filter]}
							<ChevronDownIcon className="h-3 w-3" />
						</button>
						{open && (
							<div
								role="menu"
								className={cn(
									"absolute right-0 top-full z-10 mt-1 w-36 overflow-hidden rounded border",
									"border-[var(--border-mid)] bg-[var(--bg-panel-hi)] shadow-lg",
								)}
							>
								{(Object.keys(FILTER_LABELS) as Filter[]).map((k) => (
									<button
										key={k}
										type="button"
										onClick={() => {
											setFilter(k);
											setOpen(false);
										}}
										className={cn(
											"flex w-full items-center px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em]",
											"transition-colors hover:bg-white/[0.04]",
											filter === k ? "text-[var(--accent)]" : "text-[var(--text-secondary)]",
										)}
									>
										{FILTER_LABELS[k]}
									</button>
								))}
							</div>
						)}
					</div>
				}
			>
				Activity Feed
			</Label>

			{visible.length === 0 ? (
				<div className="py-6 text-center font-mono text-[11px] text-[var(--text-tertiary)]">
					no events yet · stream pending
				</div>
			) : (
				<ul className="divide-y divide-[var(--border-soft)]">
					{visible.map((it) => (
						<li key={it.id}>
							<Row item={it} />
						</li>
					))}
				</ul>
			)}

			<a
				href="/agent-preview/activity"
				className={cn(
					"mt-3 flex items-center justify-center gap-1.5 border-t border-[var(--border-soft)] pt-3",
					"font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]",
					"transition-colors hover:text-[var(--accent)]",
				)}
			>
				View all activity
				<span aria-hidden>→</span>
			</a>
		</Panel>
	);
}
