"use client";

/**
 * One row per launch the patron has backed.
 *
 * Renders state + position + claimable amount. Pulls live `claimableOf`
 * from the vault as a fallback when the backend couldn't reach RPC. The
 * row is intentionally non-interactive, claim happens via the bulk
 * ClaimAllButton at the top of the page.
 */
import Link from "next/link";
import { useMemo } from "react";

import { useTranslation } from "@/contexts/locale-context";
import type { UserLaunchEntry } from "@/lib/api/portfolio";
import { formatBnb, formatTokens } from "@/lib/portfolio/format";

type Props = {
	entry: UserLaunchEntry;
};

const STATE_BADGE_STYLES: Record<string, string> = {
	open: "border-[#00ff87]/40 text-[#00ff87] bg-[#00ff87]/5",
	closed: "border-yellow-400/40 text-yellow-300 bg-yellow-400/5",
	launched: "border-blue-400/40 text-blue-300 bg-blue-400/5",
	failed: "border-red-400/40 text-red-300 bg-red-400/5",
};

export default function LaunchPositionRow({ entry }: Props) {
	const { t } = useTranslation();
	const { launch, position } = entry;
	const symbol =
		(typeof launch.metadata?.symbol === "string" ? (launch.metadata.symbol as string) : null) ??
		launch.token.slice(0, 6);
	const name =
		(typeof launch.metadata?.name === "string" ? (launch.metadata.name as string) : null) ??
		t("portfolio.row.launchFallbackName", { idShort: launch.id.slice(0, 8) });

	// Backend is the authoritative source for claimable; the parent page
	// also runs a wagmi multicall fallback when needed and refreshes after
	// each successful claim tx.
	const claimableWei = useMemo(() => {
		if (!position.claimable) return 0n;
		try {
			return BigInt(position.claimable);
		} catch {
			return 0n;
		}
	}, [position.claimable]);

	const stateBadge = STATE_BADGE_STYLES[launch.state] ?? "border-white/20 text-zinc-300 bg-white/5";
	const vestingPctRaw = position.vestingProgress;
	const vestingPct = Math.max(0, Math.min(100, Math.round(vestingPctRaw * 100)));

	return (
		<div className="border-b border-stroke-strong last:border-b-0 bg-[#0C0C0C] px-4 py-3 text-sm hover:bg-[#0F0F0F] transition-colors">
			{/* mobile: stacked card */}
			<div className="flex flex-col gap-3 md:hidden">
				<div className="flex items-start justify-between gap-3">
					<Link href={`/launch/${encodeURIComponent(launch.id)}`} className="block min-w-0 group">
						<div className="text-white truncate font-medium group-hover:text-[#00ff87] transition-colors">{name}</div>
						<div className="text-[11px] font-mono text-neutral-500 truncate">${symbol}</div>
					</Link>
					<div className="flex flex-col items-end gap-1 shrink-0">
						<span
							className={`inline-block border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] rounded-sm ${stateBadge}`}
						>
							{launch.state}
						</span>
						<span className="text-[10px] font-mono text-neutral-500 uppercase tracking-[0.18em]">
							{t("portfolio.row.tierLabel", { tier: String(launch.tier) })}
						</span>
					</div>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div>
						<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
							{t("portfolio.row.deposited")}
						</div>
						<div className="text-white tabular-nums">{formatBnb(position.deposited)} BNB</div>
					</div>
					<div className="text-right">
						<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
							{t("portfolio.row.claimable")}
						</div>
						<div className={`tabular-nums ${claimableWei > 0n ? "text-[#00ff87]" : "text-neutral-400"}`}>
							{formatTokens(claimableWei)}
						</div>
					</div>
				</div>
				{launch.state === "launched" && position.totalAllocation ? (
					<div>
						<div className="flex items-baseline justify-between text-[10px] font-mono text-neutral-500 uppercase tracking-[0.18em]">
							<span>{t("portfolio.row.vesting")}</span>
							<span className="tabular-nums text-neutral-300">{vestingPct}%</span>
						</div>
						<div
							className="mt-1 h-1 w-full overflow-hidden bg-[#141414] rounded-sm"
							aria-label={t("portfolio.row.vestingAria")}
						>
							<div
								className="h-full bg-[#00ff87]/70 transition-[width] duration-500"
								style={{ width: `${vestingPct}%` }}
							/>
						</div>
					</div>
				) : null}
				<Link
					href={`/launch/${encodeURIComponent(launch.id)}`}
					className="self-end text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-400 hover:text-[#00ff87] transition-colors"
				>
					{t("portfolio.row.view")} &rarr;
				</Link>
			</div>

			{/* desktop: tabular grid */}
			<div className="hidden md:grid grid-cols-12 gap-3 items-center">
				<div className="col-span-3 min-w-0">
					<Link href={`/launch/${encodeURIComponent(launch.id)}`} className="block min-w-0 group">
						<div className="text-white truncate font-medium group-hover:text-[#00ff87] transition-colors">{name}</div>
						<div className="text-[11px] font-mono text-neutral-500 truncate">${symbol}</div>
					</Link>
				</div>

				<div className="col-span-2">
					<span
						className={`inline-block border px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.2em] rounded-sm ${stateBadge}`}
					>
						{launch.state}
					</span>
					<div className="text-[10px] font-mono text-neutral-500 mt-1 uppercase tracking-[0.18em]">
						{t("portfolio.row.tierLabel", { tier: String(launch.tier) })}
					</div>
				</div>

				<div className="col-span-2">
					<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
						{t("portfolio.row.deposited")}
					</div>
					<div className="text-white tabular-nums">{formatBnb(position.deposited)} BNB</div>
				</div>

				<div className="col-span-2">
					<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
						{t("portfolio.row.allocation")}
					</div>
					<div className="text-white tabular-nums">
						{position.totalAllocation ? `${formatTokens(position.totalAllocation)}` : "–"}
					</div>
					{launch.state === "launched" ? (
						<div
							className="mt-1 h-1 w-full overflow-hidden bg-[#141414] rounded-sm"
							aria-label={t("portfolio.row.vestingAria")}
						>
							<div
								className="h-full bg-[#00ff87]/70 transition-[width] duration-500"
								style={{ width: `${vestingPct}%` }}
							/>
						</div>
					) : null}
				</div>

				<div className="col-span-2 text-right">
					<div className="text-[10px] font-mono uppercase tracking-[0.18em] text-neutral-500">
						{t("portfolio.row.claimable")}
					</div>
					<div className={`tabular-nums ${claimableWei > 0n ? "text-[#00ff87]" : "text-neutral-400"}`}>
						{formatTokens(claimableWei)}
					</div>
				</div>

				<div className="col-span-1 text-right">
					<Link
						href={`/launch/${encodeURIComponent(launch.id)}`}
						className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-400 hover:text-[#00ff87] transition-colors"
					>
						{t("portfolio.row.view")} &rarr;
					</Link>
				</div>
			</div>
		</div>
	);
}
