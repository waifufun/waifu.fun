"use client";

import { useTranslation } from "@/contexts/locale-context";
import type { IToken } from "@waifufun/types";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

function formatMarketCap(mc: number): string {
	if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(1)}m`;
	if (mc >= 1_000) return `$${(mc / 1_000).toFixed(1)}k`;
	return `$${mc}`;
}

function truncateDescription(desc: string | undefined, maxLen: number): string {
	if (!desc) return "";
	if (desc.length <= maxLen) return desc;
	return `${desc.slice(0, maxLen).trimEnd()}…`;
}

function StatBlock({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 min-w-0">
			<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#5f5f66]">{label}</span>
			<span className="truncate text-lg font-semibold tracking-tight text-[#f4f4f5]">{value}</span>
		</div>
	);
}

function StatusPills({
	isBonded,
	isDead,
	isVerified,
}: {
	isBonded: boolean;
	isDead: boolean;
	isVerified: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			{isDead ? (
				<span className="rounded-full border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.12)] px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-red-300">
					inactive
				</span>
			) : isBonded ? (
				<span className="rounded-full border border-[rgba(0,255,135,0.24)] bg-[rgba(0,255,135,0.1)] px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[#8df7c0]">
					bonded
				</span>
			) : (
				<span className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(34,197,94,0.22)] bg-[rgba(34,197,94,0.1)] px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[#9ae6b4]">
					<span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
					active
				</span>
			)}
			{isVerified && (
				<span className="rounded-full border border-[rgba(255,255,255,0.11)] bg-[rgba(255,255,255,0.06)] px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[#d4d4d8]">
					verified
				</span>
			)}
		</div>
	);
}

export const GridItem = ({
	token,
	variant = "portrait",
	imageSrc,
}: {
	token: IToken;
	variant?: "hero" | "portrait";
	imageSrc?: string;
}) => {
	const { t } = useTranslation();
	const curveProgress = Math.min(100, Math.max(0, Number(token?.curveProgress ?? 0)));
	const isBonded = token?.curveCompleted || curveProgress >= 100;
	const isDead = token?.status === "finalized" || (isBonded && (token?.marketcap ?? 0) === 0);
	const isHero = variant === "hero";
	const description = truncateDescription(token.description, isHero ? 180 : 96);
	const displayImage = imageSrc ?? token.image;
	const href = `/token/${token.chain}/${token.chainId}/${token.contractAddress}`;
	const progressLabel = t("token.bondingCurveProgress");

	if (isHero) {
		return (
			<Link href={href} className="group block h-full w-full">
				<motion.div
					className="relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(16,16,20,0.98),rgba(10,10,13,0.98))]"
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.55, ease: "easeOut" }}
					whileHover={{
						y: -2,
						boxShadow: "0 28px 72px rgba(0,0,0,0.46)",
						borderColor: "rgba(255,255,255,0.14)",
					}}
				>
					<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_38%),radial-gradient(circle_at_80%_0%,rgba(0,255,135,0.08),transparent_26%)] opacity-80" />
					<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.12)] to-transparent opacity-70" />
					<div className="relative grid h-full grid-cols-1 lg:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
						<div className="relative min-h-[300px] overflow-hidden lg:min-h-full">
							<motion.div
								className="absolute inset-0"
								whileHover={{ scale: 1.02 }}
								transition={{ duration: 0.8, ease: "easeOut" }}
							>
								<Image src={displayImage} fill unoptimized alt={token.name} className="object-cover object-top" />
							</motion.div>
							<div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[rgba(10,10,13,0.95)] hidden lg:block" />
							<div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,10,13,0.95)] via-[rgba(10,10,13,0.18)] to-transparent lg:hidden" />
						</div>

						<div className="flex h-full flex-col justify-between gap-6 p-5 sm:p-6 lg:p-8 lg:pl-5">
							<div className="flex flex-col gap-5">
								<StatusPills isBonded={isBonded} isDead={isDead} isVerified={Boolean(token.verified)} />

								<div className="flex flex-col gap-2">
									<div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#7f7f86]">curated explorer</div>
									<div>
										<h3 className="text-3xl font-semibold leading-none tracking-tight text-[#f4f4f5] sm:text-4xl">
											{token.name}
										</h3>
										<span className="mt-2 inline-block font-mono text-base text-[#00ff87]">${token.ticker}</span>
									</div>
								</div>

								{description && (
									<p className="max-w-[44ch] text-sm leading-7 text-[#9a9aa2] sm:text-[15px]">{description}</p>
								)}
							</div>

							<div className="flex flex-col gap-5">
								<div className="grid grid-cols-2 gap-4 border-t border-[rgba(255,255,255,0.06)] pt-5 sm:grid-cols-3">
									<StatBlock label="market cap" value={formatMarketCap(token.marketcap ?? 0)} />
									<StatBlock label="holders" value={(token.holders ?? 0).toLocaleString()} />
									{(token.volume24h ?? 0) > 0 ? (
										<StatBlock label="24h volume" value={formatMarketCap(token.volume24h ?? 0)} />
									) : token.price ? (
										<StatBlock label="price" value={`$${Number(token.price).toFixed(6)}`} />
									) : null}
								</div>

								{!isBonded && (
									<div className="space-y-2">
										<div className="flex items-center justify-between gap-3">
											<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#5f5f66]">{progressLabel}</span>
											<span className="text-[11px] font-mono text-[#8df7c0]">{curveProgress}%</span>
										</div>
										<div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
											<motion.div
												className="h-full rounded-full bg-gradient-to-r from-[#0f5132] via-[#22c55e] to-[#7fffbf]"
												initial={{ width: 0 }}
												animate={{ width: `${curveProgress}%` }}
												transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
											/>
										</div>
									</div>
								)}
							</div>
						</div>
					</div>
				</motion.div>
			</Link>
		);
	}

	return (
		<Link href={href} className="group block h-full">
			<motion.div
				className="relative flex h-full flex-col overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.08)] bg-[linear-gradient(180deg,rgba(17,17,20,0.98),rgba(11,11,14,0.98))]"
				initial={{ opacity: 0, y: 12 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.55, ease: "easeOut" }}
				whileHover={{
					y: -4,
					boxShadow: "0 24px 64px rgba(0,0,0,0.42)",
					borderColor: "rgba(255,255,255,0.14)",
				}}
			>
				<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.07),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(0,255,135,0.08),transparent_28%)] opacity-80" />
				<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[rgba(255,255,255,0.12)] to-transparent opacity-70" />

				<div className="relative aspect-[4/5] overflow-hidden">
					<motion.div
						className="absolute inset-0"
						whileHover={{ scale: 1.025 }}
						transition={{ duration: 0.75, ease: "easeOut" }}
					>
						<Image src={displayImage} fill unoptimized alt={token.name} className="object-cover object-top" />
					</motion.div>
					<div className="absolute inset-0 bg-gradient-to-t from-[rgba(10,10,13,0.95)] via-[rgba(10,10,13,0.18)] to-transparent" />

					<div className="absolute left-4 top-4 right-4 flex items-start justify-between gap-3">
						<StatusPills isBonded={isBonded} isDead={isDead} isVerified={Boolean(token.verified)} />
					</div>

					<div className="absolute bottom-0 inset-x-0 p-5 sm:p-6">
						<div className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#7f7f86]">gallery selection</div>
						<h3 className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-[#f4f4f5] sm:text-[32px]">
							{token.name}
						</h3>
						<span className="mt-2 inline-block font-mono text-sm text-[#00ff87]">${token.ticker}</span>
					</div>
				</div>

				<div className="relative flex flex-1 flex-col gap-4 p-5 sm:p-6">
					{description && <p className="text-sm leading-7 text-[#9a9aa2]">{description}</p>}

					<div className="grid grid-cols-2 gap-4 border-t border-[rgba(255,255,255,0.06)] pt-4">
						<StatBlock label="market cap" value={formatMarketCap(token.marketcap ?? 0)} />
						<StatBlock label="holders" value={(token.holders ?? 0).toLocaleString()} />
					</div>

					{!isBonded && (
						<div className="space-y-2 pt-1">
							<div className="flex items-center justify-between gap-3">
								<span className="text-[10px] font-mono uppercase tracking-[0.18em] text-[#5f5f66]">{progressLabel}</span>
								<span className="text-[11px] font-mono text-[#8df7c0]">{curveProgress}%</span>
							</div>
							<div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
								<motion.div
									className="h-full rounded-full bg-gradient-to-r from-[#0f5132] via-[#22c55e] to-[#7fffbf]"
									initial={{ width: 0 }}
									animate={{ width: `${curveProgress}%` }}
									transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
								/>
							</div>
						</div>
					)}
				</div>
			</motion.div>
		</Link>
	);
};
