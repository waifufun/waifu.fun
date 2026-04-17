"use client";

import { getAdminStats, getAdminTokens, getAgentAvailability } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, CircleDot, Clock, Coins, Cpu, Rocket, Shield, Users } from "lucide-react";
import Link from "next/link";

/* ─── stat card ─── */
function StatCard({
	label,
	value,
	icon: Icon,
	accent = "green",
	loading,
}: {
	label: string;
	value: string | number;
	icon: React.ComponentType<{ className?: string }>;
	accent?: "green" | "purple";
	loading?: boolean;
}) {
	const iconCls = "w-4 h-4 text-[#00ff87]";
	const bgCls = "w-9 h-9 rounded-sm flex items-center justify-center shrink-0 bg-[#00ff87]/10";

	return (
		<div className="bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 flex items-center gap-4 hover:border-[rgba(255,255,255,0.12)] transition-colors">
			<div className={bgCls}>
				<Icon className={iconCls} />
			</div>
			<div className="min-w-0">
				<p className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider">{label}</p>
				<p className="text-lg font-mono text-white leading-tight mt-0.5">{loading ? "—" : value}</p>
			</div>
		</div>
	);
}

/* ─── nav card ─── */
function NavCard({
	label,
	href,
	icon: Icon,
	count,
	loading,
}: {
	label: string;
	href: string;
	icon: React.ComponentType<{ className?: string }>;
	count?: number;
	loading?: boolean;
}) {
	return (
		<Link href={href}>
			<div className="bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 flex items-center justify-between group hover:border-[rgba(255,255,255,0.12)] transition-colors cursor-pointer">
				<div className="flex items-center gap-3">
					<Icon className="w-4 h-4 text-[#71717a] group-hover:text-[#00ff87] transition-colors" />
					<span className="text-sm text-[#a1a1aa] group-hover:text-white transition-colors font-mono lowercase">
						{label}
					</span>
					{!loading && count !== undefined && (
						<span className="text-[10px] font-mono text-[#52525b] bg-[#1a1a1e] px-1.5 py-0.5 rounded-sm">{count}</span>
					)}
				</div>
				<ArrowUpRight className="w-3.5 h-3.5 text-[#3f3f46] group-hover:text-[#00ff87] transition-colors" />
			</div>
		</Link>
	);
}

/* ─── activity item ─── */
function ActivityItem({
	name,
	symbol,
	time,
	status,
}: {
	name: string;
	symbol?: string | undefined;
	time?: string | undefined;
	status?: string | undefined;
}) {
	const statusColor =
		status === "active" || status === "tradable" ? "#00ff87" : status === "pending" ? "#facc15" : "#71717a";

	return (
		<div className="flex items-center justify-between py-2.5 border-b border-[rgba(255,255,255,0.04)] last:border-0">
			<div className="flex items-center gap-3 min-w-0">
				<CircleDot className="w-3 h-3 shrink-0" style={{ color: statusColor }} />
				<div className="min-w-0">
					<p className="text-sm text-[#e4e4e7] font-mono truncate">
						{name}
						{symbol && <span className="text-[#52525b] ml-1.5">${symbol}</span>}
					</p>
				</div>
			</div>
			{time && (
				<div className="flex items-center gap-1 shrink-0 ml-3">
					<Clock className="w-3 h-3 text-[#3f3f46]" />
					<span className="text-[10px] text-[#52525b] font-mono">{time}</span>
				</div>
			)}
		</div>
	);
}

/* ─── format relative time ─── */
function relativeTime(dateStr: string): string {
	const now = Date.now();
	const then = new Date(dateStr).getTime();
	if (Number.isNaN(then)) return "";
	const diffSec = Math.floor((now - then) / 1000);
	if (diffSec < 60) return "just now";
	if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
	if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
	return `${Math.floor(diffSec / 86400)}d ago`;
}

/* ─── main dashboard ─── */
export default function AdminPage() {
	const { data: stats, isLoading: statsLoading } = useQuery({
		queryKey: ["admin-stats"],
		queryFn: getAdminStats,
		refetchInterval: 30000,
	});

	const { data: agents, isLoading: agentsLoading } = useQuery({
		queryKey: ["admin-agent-availability"],
		queryFn: getAgentAvailability,
		retry: 1,
		refetchInterval: 60000,
	});

	const { data: launches, isLoading: launchesLoading } = useQuery({
		queryKey: ["admin-recent-launches"],
		queryFn: () => getAdminTokens({ limit: 10, page: 1 }),
		refetchInterval: 30000,
	});

	const loading = statsLoading;
	const totalTokens = stats?.totalTokens ?? stats?.tokenCount ?? 0;
	const totalUsers = stats?.totalUsers ?? stats?.userCount ?? 0;
	const activeSlots = agents ? agents.totalSlots - agents.availableSlots : 0;
	const pendingLaunches = launches?.total ?? 0;

	const recentItems = (launches?.docs ?? launches?.tokens ?? []).slice(0, 8);

	return (
		<div className="min-h-screen bg-[#08080a] px-4 py-6 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-8">
			{/* header */}
			<div>
				<h1 className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider">admin / overview</h1>
				<p className="text-white text-lg font-mono mt-1">operations dashboard</p>
			</div>

			{/* stats row */}
			<section>
				<p className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider mb-3">platform metrics</p>
				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
					<StatCard label="total tokens" value={totalTokens.toLocaleString()} icon={Coins} loading={loading} />
					<StatCard label="total users" value={totalUsers.toLocaleString()} icon={Users} loading={loading} />
					<StatCard
						label="active agents"
						value={agentsLoading ? "—" : activeSlots.toLocaleString()}
						icon={Cpu}
						accent="purple"
						loading={agentsLoading}
					/>
					<StatCard
						label="launches"
						value={launchesLoading ? "—" : pendingLaunches.toLocaleString()}
						icon={Rocket}
						accent="purple"
						loading={launchesLoading}
					/>
				</div>
			</section>

			{/* nav grid */}
			<section>
				<p className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider mb-3">manage</p>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
					<NavCard label="users" href="/admin/users" icon={Users} count={totalUsers} loading={loading} />
					<NavCard label="tokens" href="/admin/tokens" icon={Coins} count={totalTokens} loading={loading} />
					<NavCard label="moderators" href="/admin/moderators" icon={Shield} />
				</div>
			</section>

			{/* recent activity */}
			<section>
				<p className="text-[10px] text-[#71717a] font-mono uppercase tracking-wider mb-3">recent launches</p>
				<div className="bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm">
					{launchesLoading ? (
						<div className="px-4 py-8 text-center">
							<Activity className="w-4 h-4 text-[#3f3f46] mx-auto animate-pulse" />
							<p className="text-[11px] text-[#52525b] font-mono mt-2">loading activity...</p>
						</div>
					) : recentItems.length === 0 ? (
						<div className="px-4 py-8 text-center">
							<Activity className="w-4 h-4 text-[#3f3f46] mx-auto" />
							<p className="text-[11px] text-[#52525b] font-mono mt-2">no recent activity</p>
						</div>
					) : (
						<div className="px-4 py-1">
							{recentItems.map(
								(
									item: {
										address?: string;
										contractAddress?: string;
										name?: string;
										symbol?: string;
										status?: string;
										createdAt?: string;
										launchedAt?: string;
									},
									i: number,
								) => (
									<ActivityItem
										key={item.address ?? item.contractAddress ?? i}
										name={item.name || "unnamed token"}
										symbol={item.symbol}
										status={item.status}
										time={
											item.createdAt || item.launchedAt
												? relativeTime(item.createdAt || item.launchedAt || "")
												: undefined
										}
									/>
								),
							)}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
