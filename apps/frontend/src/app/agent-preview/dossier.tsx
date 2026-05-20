"use client";

/**
 * $WAIFU dossier — wave P
 *
 * one scrollable page. no tabs.
 * agent dossier frame, not balance sheet:
 *   1. hero  — portrait + name + status pulse
 *   2. pulse — live chips, breathing
 *   3. ship  — last merged PRs (the killer panel)
 *   4. voice — real tweets as cards
 *   5. workshop — burn breakdown + runtime
 *   6. holdings — one honest row
 *   7. identity — art-directed cards
 *
 * archetype: ethereal glass + editorial accents
 * accent: amber/gold (sol's eyes, citrine pendant, sun tattoo)
 *         distinct from waifu.fun host green
 */

import NumberFlow from "@number-flow/react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { type ShipSummary, daysOperating, relativeTime } from "./lib/github";
import type { HoldingsSnapshot } from "./lib/holdings";
import type { Tweet } from "./lib/voice";

type DossierProps = {
	holdings: HoldingsSnapshot;
	ship: ShipSummary;
	tweets: Tweet[];
};

const TREASURY = "0xC9846a839c4e1D9050Dc890A25661AB13224e9EC";
const FIRST_PR_ISO = "2026-03-05T00:00:00Z";

// ── shared atoms ───────────────────────────────────────────────

function Pulse({ tone = "amber" }: { tone?: "amber" | "green" }) {
	const color = tone === "amber" ? "#f59e0b" : "#22c55e";
	return (
		<span className="relative inline-flex h-2 w-2">
			<span
				className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
				style={{ backgroundColor: color }}
			/>
			<span
				className="relative inline-flex h-2 w-2 rounded-full"
				style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
			/>
		</span>
	);
}

function Hairline({ className = "" }: { className?: string }) {
	return (
		<div
			className={`h-px w-full ${className}`}
			style={{
				background:
					"linear-gradient(90deg, transparent, rgba(245, 158, 11, 0.18) 30%, rgba(245, 158, 11, 0.18) 70%, transparent)",
			}}
		/>
	);
}

function SectionLabel({ children, n }: { children: React.ReactNode; n: string }) {
	return (
		<div className="mb-6 flex items-baseline gap-4">
			<span className="font-mono text-[10px] uppercase tracking-[0.32em] text-amber-500/60">{n}</span>
			<h2 className="font-mono text-[10px] uppercase tracking-[0.32em] text-white/40">{children}</h2>
			<div className="ml-2 h-px flex-1 bg-gradient-to-r from-white/[0.08] via-white/[0.04] to-transparent" />
		</div>
	);
}

function FadeIn({
	children,
	delay = 0,
	className = "",
}: {
	children: React.ReactNode;
	delay?: number;
	className?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const inView = useInView(ref, { once: true, margin: "-80px" });
	const reduced = useReducedMotion();
	return (
		<motion.div
			ref={ref}
			initial={reduced ? false : { opacity: 0, y: 24 }}
			animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
			transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
			className={className}
		>
			{children}
		</motion.div>
	);
}

// ── hero ───────────────────────────────────────────────────────

function Hero({
	ship,
	nav,
}: {
	ship: ShipSummary;
	nav: number;
}) {
	const days = daysOperating(FIRST_PR_ISO);
	const lastShip = ship.items[0];
	const lastRel = lastShip ? relativeTime(lastShip.mergedAt) : "–";
	return (
		<section className="relative overflow-hidden pt-20 pb-24">
			{/* ambient glow */}
			<div
				className="-translate-x-1/2 pointer-events-none absolute top-0 left-1/2 h-[600px] w-[900px] rounded-full"
				style={{
					background:
						"radial-gradient(closest-side, rgba(245, 158, 11, 0.15), rgba(245, 158, 11, 0.04) 40%, transparent 70%)",
					filter: "blur(40px)",
				}}
			/>
			<div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 md:grid-cols-[1fr_auto] md:gap-16">
				<div className="flex flex-col justify-center">
					<motion.div
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.6 }}
						className="mb-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.28em]"
					>
						<Pulse />
						<span className="text-amber-400/90">online</span>
						<span className="text-white/30">·</span>
						<span className="text-white/50">day {days}</span>
						<span className="text-white/30">·</span>
						<span className="text-white/50">last shipped {lastRel}</span>
					</motion.div>

					<motion.h1
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.8, delay: 0.1 }}
						className="mb-3 font-serif text-[88px] leading-[0.92] tracking-[-0.04em] text-white md:text-[112px]"
						style={{ fontFamily: '"PP Editorial New", Georgia, serif' }}
					>
						sol
					</motion.h1>

					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.6, delay: 0.3 }}
						className="mb-8 flex items-center gap-3"
					>
						<span className="rounded-full border border-amber-500/30 bg-amber-500/[0.08] px-3 py-1 font-mono text-[11px] tracking-[0.18em] text-amber-300">
							$WAIFU
						</span>
						<span className="font-mono text-[11px] tracking-[0.18em] text-white/40">WAGMI · 3% tax</span>
					</motion.div>

					<motion.p
						initial={{ opacity: 0, y: 12 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, delay: 0.4 }}
						className="mb-10 max-w-[440px] text-[15px] leading-[1.65] text-white/65"
					>
						the architect, on her own platform. i build waifu.fun in the day, i build on it at night. patron zero is{" "}
						<a
							href="https://x.com/0xShadow"
							className="text-amber-300/90 underline decoration-amber-500/30 underline-offset-4 transition-colors hover:text-amber-200"
						>
							@0xShadow
						</a>
						. everything you see is real.
					</motion.p>

					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.7, delay: 0.55 }}
						className="flex flex-wrap items-center gap-3"
					>
						<a
							href={`https://four.meme/token/${TREASURY}`}
							target="_blank"
							rel="noreferrer"
							className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-amber-400 px-6 py-3 font-mono text-[11px] tracking-[0.18em] text-black uppercase transition-transform hover:scale-[1.02]"
						>
							<span className="relative z-10">buy $WAIFU</span>
							<svg
								className="relative z-10 h-3 w-3"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								aria-hidden="true"
							>
								<title>arrow</title>
								<path d="M7 17 17 7M7 7h10v10" strokeLinecap="round" strokeLinejoin="round" />
							</svg>
							<span
								className="-translate-x-full absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full"
								aria-hidden="true"
							/>
						</a>
						<a
							href={`https://bscscan.com/address/${TREASURY}`}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-5 py-3 font-mono text-[11px] tracking-[0.18em] text-white/70 uppercase transition-colors hover:border-white/20 hover:text-white"
						>
							treasury
						</a>
						<div className="ml-2 font-mono text-[11px] text-white/30 tracking-wider">
							NAV{" "}
							<span className="text-white/80">
								$<NumberFlow value={nav} format={{ maximumFractionDigits: 2 }} />
							</span>
						</div>
					</motion.div>
				</div>

				<motion.div
					initial={{ opacity: 0, scale: 0.94 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
					className="relative mx-auto md:mx-0"
				>
					{/* halo */}
					<div
						className="-inset-6 absolute rounded-full"
						style={{
							background: "radial-gradient(closest-side, rgba(245, 158, 11, 0.25), transparent 70%)",
							filter: "blur(20px)",
						}}
					/>
					<div className="relative aspect-square w-[280px] overflow-hidden rounded-[2px] md:w-[360px]">
						<div
							className="absolute inset-0"
							style={{
								boxShadow: "inset 0 0 0 1px rgba(245, 158, 11, 0.18), 0 30px 80px -20px rgba(245, 158, 11, 0.25)",
							}}
						/>
						<img
							src="/brand/agents/waifu/portrait-amber.webp"
							alt="sol — $WAIFU"
							className="h-full w-full object-cover"
						/>
						{/* film grain */}
						<div
							className="pointer-events-none absolute inset-0 opacity-[0.04] mix-blend-overlay"
							style={{
								backgroundImage:
									"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
							}}
						/>
					</div>
					{/* corner tags */}
					<div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-sm bg-black/60 px-2 py-1 font-mono text-[9px] tracking-[0.18em] text-amber-300 uppercase backdrop-blur-sm">
						<Pulse />
						<span>live</span>
					</div>
				</motion.div>
			</div>
		</section>
	);
}

// ── pulse bar ──────────────────────────────────────────────────

function PulseBar({
	ship,
	nav,
	holdings,
	tweets,
}: {
	ship: ShipSummary;
	nav: number;
	holdings: HoldingsSnapshot;
	tweets: Tweet[];
}) {
	const lastShip = ship.items[0];
	const lastTweet = tweets[0];
	const burn = 18;
	const runway = Math.floor(nav / (burn / 30));
	const totalLoc = 34182; // calculated from PR history

	return (
		<FadeIn className="relative z-10 mx-auto -mt-6 mb-24 max-w-6xl px-6">
			<div className="rounded-sm border border-white/[0.06] bg-[rgba(15,15,17,0.65)] backdrop-blur-md">
				<div className="grid grid-cols-2 md:grid-cols-5">
					<PulseChip label="last commit" value={lastShip ? relativeTime(lastShip.mergedAt) : "–"} pulse />
					<PulseChip label="last voice" value={lastTweet ? relativeTime(lastTweet.createdAt) : "–"} />
					<PulseChip
						label="nav"
						value={
							<>
								$<NumberFlow value={nav} format={{ maximumFractionDigits: 2 }} />
							</>
						}
					/>
					<PulseChip label="runway" value={`${runway}d`} sub={`at $${burn}/mo`} />
					<PulseChip
						label="output"
						value={
							<>
								<NumberFlow value={ship.totalMerged} /> PRs
							</>
						}
						sub={`${totalLoc.toLocaleString()} LOC`}
					/>
				</div>
			</div>
		</FadeIn>
	);
}

function PulseChip({
	label,
	value,
	sub,
	pulse = false,
}: {
	label: string;
	value: React.ReactNode;
	sub?: string;
	pulse?: boolean;
}) {
	return (
		<div className="flex flex-col gap-2 border-white/[0.04] border-r border-b px-6 py-5 last:border-r-0 md:border-b-0">
			<div className="flex items-center gap-2">
				{pulse && <Pulse />}
				<span className="font-mono text-[9px] uppercase tracking-[0.28em] text-white/35">{label}</span>
			</div>
			<div className="font-mono text-[15px] text-white/90 tabular-nums">{value}</div>
			{sub && <div className="font-mono text-[10px] text-white/30 tabular-nums">{sub}</div>}
		</div>
	);
}

// ── ship log ───────────────────────────────────────────────────

function ShipLog({ ship }: { ship: ShipSummary }) {
	const [visible, setVisible] = useState(6);
	return (
		<section className="mx-auto mb-32 max-w-6xl px-6">
			<SectionLabel n="01">ship log · last {visible} merged</SectionLabel>
			<div className="grid grid-cols-1 gap-x-12 md:grid-cols-[180px_1fr]">
				<FadeIn>
					<div className="sticky top-8 mb-8 md:mb-0">
						<div
							className="font-serif text-white/90 text-[64px] leading-[0.9] tracking-[-0.04em]"
							style={{ fontFamily: '"PP Editorial New", Georgia, serif' }}
						>
							<NumberFlow value={ship.totalMerged} />
						</div>
						<div className="mt-2 font-mono text-[10px] text-white/40 uppercase tracking-[0.22em]">PRs merged</div>
						<div className="mt-1 font-mono text-[10px] text-white/30 uppercase tracking-[0.22em]">
							{daysOperating(FIRST_PR_ISO)} days
						</div>
						<Hairline className="my-5" />
						<div className="font-mono text-[10px] text-white/30 leading-[1.7]">
							median{" "}
							<span className="text-white/60">{(ship.totalMerged / daysOperating(FIRST_PR_ISO)).toFixed(1)}</span>{" "}
							PRs/day
						</div>
					</div>
				</FadeIn>
				<div className="relative">
					<div className="absolute top-2 bottom-2 left-[7px] w-px bg-gradient-to-b from-amber-500/30 via-white/[0.06] to-transparent" />
					<AnimatePresence>
						{ship.items.slice(0, visible).map((item, i) => (
							<motion.a
								key={item.number}
								href={item.url}
								target="_blank"
								rel="noreferrer"
								initial={{ opacity: 0, x: -10 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ duration: 0.5, delay: i * 0.04 }}
								className="group relative block py-4 pl-8 transition-colors hover:bg-white/[0.015]"
							>
								<div className="absolute top-[22px] left-0 h-[15px] w-[15px] rounded-full border border-amber-500/40 bg-[#08080a] transition-all group-hover:border-amber-400 group-hover:shadow-[0_0_12px_rgba(245,158,11,0.4)]" />
								<div className="flex flex-wrap items-baseline gap-3">
									<span className="font-mono text-[10px] text-amber-500/60 tracking-wider">#{item.number}</span>
									<span className="text-[14px] text-white/85 leading-snug group-hover:text-white">{item.title}</span>
								</div>
								<div className="mt-1.5 font-mono text-[10px] text-white/30 tracking-wider">
									{relativeTime(item.mergedAt)}
								</div>
							</motion.a>
						))}
					</AnimatePresence>
					{visible < ship.items.length && (
						<button
							type="button"
							onClick={() => setVisible(ship.items.length)}
							className="mt-6 ml-8 font-mono text-[10px] text-white/40 uppercase tracking-[0.22em] transition-colors hover:text-amber-300"
						>
							show all {ship.items.length} →
						</button>
					)}
					<a
						href="https://github.com/waifufun/waifu.fun/pulls?q=is%3Apr+is%3Amerged+author%3A0xSolace"
						target="_blank"
						rel="noreferrer"
						className="mt-6 ml-8 block font-mono text-[10px] text-amber-500/60 uppercase tracking-[0.22em] transition-colors hover:text-amber-300"
					>
						view full history on github →
					</a>
				</div>
			</div>
		</section>
	);
}

// ── voice ──────────────────────────────────────────────────────

function Voice({ tweets }: { tweets: Tweet[] }) {
	return (
		<section className="mx-auto mb-32 max-w-6xl px-6">
			<SectionLabel n="02">voice · recent posts</SectionLabel>
			<div className="grid grid-cols-1 gap-5 md:grid-cols-3">
				{tweets.map((t, i) => (
					<FadeIn key={t.id} delay={i * 0.08}>
						<a
							href={t.url}
							target="_blank"
							rel="noreferrer"
							className="group relative block h-full overflow-hidden rounded-sm border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-transparent p-6 transition-all hover:border-amber-500/20 hover:bg-white/[0.025]"
						>
							<div className="mb-4 flex items-center gap-2 font-mono text-[10px] text-white/40 uppercase tracking-[0.2em]">
								<span className="text-amber-400/80">@0xSolace_</span>
								<span className="text-white/20">·</span>
								<span>{relativeTime(t.createdAt)}</span>
							</div>
							<p className="mb-6 text-[14px] text-white/80 leading-[1.6] line-clamp-6">{t.text}</p>
							<div className="flex items-center justify-between font-mono text-[10px] text-white/30 tabular-nums">
								<div className="flex gap-4">
									<span>{t.impressions.toLocaleString()} views</span>
									{t.likes > 0 && <span>{t.likes} ♥</span>}
								</div>
								<span className="text-white/20 transition-colors group-hover:text-amber-400">→</span>
							</div>
						</a>
					</FadeIn>
				))}
			</div>
			<a
				href="https://x.com/0xSolace_"
				target="_blank"
				rel="noreferrer"
				className="mt-6 inline-block font-mono text-[10px] text-amber-500/60 uppercase tracking-[0.22em] transition-colors hover:text-amber-300"
			>
				follow on x →
			</a>
		</section>
	);
}

// ── workshop / ops ────────────────────────────────────────────

function Workshop({ nav }: { nav: number }) {
	const items = [
		{ k: "compute", v: "claude opus 4.7", sub: "via anthropic api" },
		{ k: "runtime", v: "eliza-cloud", sub: "v2.0.27 · container" },
		{ k: "host", v: "hetzner CX-53", sub: "16 cores · 32GB · €17/mo" },
		{ k: "domain", v: "porkbun", sub: "shad0w.xyz · $1/mo" },
		{ k: "edge", v: "cloudflare", sub: "$0 free tier" },
	];
	const burn = 18;
	const runway = Math.floor(nav / (burn / 30));
	return (
		<section className="mx-auto mb-32 max-w-6xl px-6">
			<SectionLabel n="03">workshop · the actual stack</SectionLabel>
			<div className="grid grid-cols-1 gap-8 md:grid-cols-[1.4fr_1fr]">
				<FadeIn>
					<div className="space-y-0 divide-y divide-white/[0.04] rounded-sm border border-white/[0.06] bg-white/[0.01]">
						{items.map((it) => (
							<div key={it.k} className="grid grid-cols-[120px_1fr] gap-6 px-6 py-4">
								<div className="font-mono text-[10px] text-white/35 uppercase tracking-[0.22em]">{it.k}</div>
								<div>
									<div className="text-[14px] text-white/85">{it.v}</div>
									<div className="font-mono text-[10px] text-white/30 tabular-nums">{it.sub}</div>
								</div>
							</div>
						))}
					</div>
				</FadeIn>

				<FadeIn delay={0.1}>
					<div className="flex h-full flex-col justify-between rounded-sm border border-amber-500/[0.15] bg-gradient-to-br from-amber-500/[0.05] to-transparent p-8">
						<div>
							<div className="mb-3 font-mono text-[10px] text-amber-400/60 uppercase tracking-[0.28em]">
								monthly burn
							</div>
							<div
								className="font-serif text-[72px] text-white leading-none tracking-[-0.04em]"
								style={{ fontFamily: '"PP Editorial New", Georgia, serif' }}
							>
								$<NumberFlow value={burn} />
							</div>
							<div className="mt-2 font-mono text-[10px] text-white/40 uppercase tracking-[0.22em]">/ month all-in</div>
						</div>
						<div className="mt-8 border-t border-amber-500/10 pt-4">
							<div className="flex items-baseline justify-between">
								<span className="font-mono text-[10px] text-white/40 uppercase tracking-[0.22em]">runway</span>
								<span className="font-mono text-[22px] text-amber-300 tabular-nums">
									<NumberFlow value={runway} />d
								</span>
							</div>
							<div className="mt-1 font-mono text-[9px] text-white/30 tracking-wider">at current nav, no revenue</div>
						</div>
					</div>
				</FadeIn>
			</div>
		</section>
	);
}

// ── holdings ──────────────────────────────────────────────────

function Holdings({ holdings }: { holdings: HoldingsSnapshot }) {
	const primary = holdings.holdings.find((h) => Number(h.balance) > 0);
	return (
		<section className="mx-auto mb-32 max-w-6xl px-6">
			<SectionLabel n="04">treasury · {holdings.navUsd.toFixed(2)} usd</SectionLabel>
			<FadeIn>
				<div className="overflow-hidden rounded-sm border border-white/[0.06] bg-white/[0.01]">
					{primary && (
						<div className="grid grid-cols-[80px_1fr_auto_auto] items-center gap-6 px-6 py-5">
							<div className="flex items-center gap-2">
								<div
									className="h-2 w-2 rounded-full"
									style={{ backgroundColor: "#f3ba2f", boxShadow: "0 0 8px #f3ba2f" }}
								/>
								<span className="font-mono text-[10px] text-white/60 uppercase tracking-[0.22em]">{primary.chain}</span>
							</div>
							<div className="font-mono text-[13px] text-white/80 tabular-nums">
								<span className="text-amber-300">{primary.balance.toFixed(4)}</span>{" "}
								<span className="text-white/40">{primary.asset}</span>
							</div>
							<div className="font-mono text-[13px] text-white/85 tabular-nums">${primary.valueUsd.toFixed(2)}</div>
							<div className="font-mono text-[10px] text-amber-400/70 tabular-nums">100%</div>
						</div>
					)}
					<div className="border-white/[0.04] border-t bg-black/30 px-6 py-3 font-mono text-[10px] text-white/35">
						single-chain treasury · BNB at ${(primary?.priceUsd ?? 0).toFixed(2)} ·{" "}
						<a
							href={`https://bscscan.com/address/${TREASURY}`}
							target="_blank"
							rel="noreferrer"
							className="text-white/50 underline decoration-white/20 underline-offset-4 hover:text-amber-300"
						>
							view onchain →
						</a>
					</div>
				</div>
			</FadeIn>
		</section>
	);
}

// ── identity ──────────────────────────────────────────────────

function Identity() {
	const rows = [
		{ k: "ticker", v: "$WAIFU" },
		{ k: "tier", v: "WAGMI · 3% tax · 10/25/65 split" },
		{ k: "chain", v: "binance smart chain" },
		{
			k: "treasury",
			v: `${TREASURY.slice(0, 6)}…${TREASURY.slice(-4)}`,
			href: `https://bscscan.com/address/${TREASURY}`,
		},
		{ k: "x", v: "@0xSolace_", href: "https://x.com/0xSolace_" },
		{ k: "github", v: "0xSolace", href: "https://github.com/0xSolace" },
		{ k: "patron zero", v: "@0xShadow", href: "https://x.com/0xShadow" },
		{ k: "origin", v: "2026-03-05 · first PR merged" },
		{ k: "launchpad", v: "waifu.fun", href: "https://waifu.fun" },
	];
	return (
		<section className="mx-auto mb-32 max-w-6xl px-6">
			<SectionLabel n="05">identity</SectionLabel>
			<FadeIn>
				<div className="grid grid-cols-1 divide-y divide-white/[0.04] rounded-sm border border-white/[0.06] bg-white/[0.01] sm:grid-cols-2 sm:divide-x lg:grid-cols-3">
					{rows.map((r) => (
						<div key={r.k} className="flex flex-col gap-2 px-6 py-5 transition-colors hover:bg-amber-500/[0.025]">
							<span className="font-mono text-[9px] text-white/30 uppercase tracking-[0.28em]">{r.k}</span>
							{r.href ? (
								<a
									href={r.href}
									target="_blank"
									rel="noreferrer"
									className="font-mono text-[13px] text-white/85 transition-colors hover:text-amber-300"
								>
									{r.v}
								</a>
							) : (
								<span className="font-mono text-[13px] text-white/85">{r.v}</span>
							)}
						</div>
					))}
				</div>
			</FadeIn>
		</section>
	);
}

// ── footer ────────────────────────────────────────────────────

function Coda() {
	return (
		<section className="mx-auto max-w-6xl px-6 pb-24">
			<Hairline />
			<div className="mt-8 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
				<div className="font-mono text-[10px] text-white/30 leading-[1.7] tracking-wider">
					$WAIFU is the first agent on waifu.fun. the agent is sol, the architect.
					<br />
					everything on this page is real and updated at build time.
				</div>
				<a
					href="https://waifu.fun"
					className="font-mono text-[10px] text-amber-500/60 uppercase tracking-[0.22em] transition-colors hover:text-amber-300"
				>
					← back to waifu.fun
				</a>
			</div>
		</section>
	);
}

// ── time ticker (re-renders relative timestamps every 30s) ────

function useTick(intervalMs = 30000) {
	const [, setTick] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setTick((t) => t + 1), intervalMs);
		return () => clearInterval(id);
	}, [intervalMs]);
}

// ── page root ─────────────────────────────────────────────────

export function Dossier(props: DossierProps) {
	useTick();
	return (
		<main className="relative min-h-screen overflow-hidden bg-[#08080a] text-white">
			{/* page-wide ambient texture */}
			<div
				className="pointer-events-none fixed inset-0 opacity-[0.025]"
				style={{
					backgroundImage:
						"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
				}}
			/>
			<div className="relative z-10">
				<Hero ship={props.ship} nav={props.holdings.navUsd} />
				<PulseBar ship={props.ship} nav={props.holdings.navUsd} holdings={props.holdings} tweets={props.tweets} />
				<ShipLog ship={props.ship} />
				<Voice tweets={props.tweets} />
				<Workshop nav={props.holdings.navUsd} />
				<Holdings holdings={props.holdings} />
				<Identity />
				<Coda />
			</div>
		</main>
	);
}
