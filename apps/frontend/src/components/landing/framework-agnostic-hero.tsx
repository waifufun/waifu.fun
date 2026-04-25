"use client";

import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const EASE = [0.22, 1, 0.36, 1] as const;
const ENTER = { duration: 0.6, ease: EASE };

const STACK_CHIPS = [
	{ label: "ElizaOS", mono: "EZ" },
	{ label: "ocplatform", mono: "OC" },
	{ label: "your stack", mono: "//" },
] as const;

function FrameworkChip({ label, mono, delay }: { label: string; mono: string; delay: number }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ ...ENTER, delay }}
			className="group inline-flex items-center gap-2.5 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(17,17,20,0.55)] px-3 py-2 transition-colors duration-300 hover:border-[#00ff87]/30"
		>
			<span className="flex h-6 w-6 items-center justify-center rounded-sm border border-[rgba(255,255,255,0.08)] bg-[#0a0a0c] font-mono text-[10px] uppercase tracking-[0.12em] text-[#00ff87]">
				{mono}
			</span>
			<span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#a1a1aa] group-hover:text-[#e4e4e7] transition-colors duration-200">
				{label}
			</span>
		</motion.div>
	);
}

export default function FrameworkAgnosticHero() {
	return (
		<section
			aria-label="waifu.fun, framework agnostic launchpad"
			className="relative overflow-hidden border-b border-[rgba(255,255,255,0.06)] bg-[#08080a]"
		>
			{/* Layer: faint orthogonal grid */}
			<div
				className="absolute inset-0 z-0 pointer-events-none opacity-[0.10]"
				aria-hidden
				style={{
					backgroundImage: [
						"linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px)",
						"linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
					].join(", "),
					backgroundSize: "56px 56px",
					maskImage: "radial-gradient(ellipse 70% 60% at 50% 40%, black 50%, transparent 100%)",
				}}
			/>

			{/* Layer: tinted accent wash, sparing */}
			<div
				className="absolute inset-0 z-0 pointer-events-none"
				aria-hidden
				style={{
					background:
						"radial-gradient(ellipse 60% 40% at 75% 0%, rgba(0,255,135,0.05), transparent 70%), radial-gradient(ellipse 50% 50% at 0% 100%, rgba(0,255,135,0.025), transparent 70%)",
				}}
			/>

			{/* Layer: noise grain */}
			<div
				className="absolute inset-0 z-[1] pointer-events-none opacity-[0.025]"
				aria-hidden
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
				}}
			/>

			<div className="relative z-10 mx-auto w-full max-w-6xl px-5 md:px-8 py-24 md:py-32 lg:py-36">
				<motion.div
					initial={{ opacity: 0, y: 30 }}
					animate={{ opacity: 1, y: 0 }}
					transition={ENTER}
					className="grid grid-cols-1 gap-12 lg:grid-cols-[1.4fr_1fr] lg:gap-16 lg:items-end"
				>
					{/* Left: type block */}
					<div>
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ ...ENTER, delay: 0.1 }}
							className="mb-6 inline-flex items-center gap-2 rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(17,17,20,0.55)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#00ff87]"
						>
							<span className="inline-block h-1.5 w-1.5 rounded-full bg-[#00ff87] shadow-[0_0_8px_rgba(0,255,135,0.5)]" />
							<span>framework agnostic</span>
						</motion.div>

						<motion.h1
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ ...ENTER, delay: 0.15 }}
							className="text-[clamp(2.5rem,6.5vw,5.25rem)] font-bold leading-[1.02] tracking-[-0.045em] text-white"
						>
							launch your agent's token.
							<br />
							<span className="text-[#a1a1aa] font-light">bring your own framework.</span>
						</motion.h1>

						<motion.p
							initial={{ opacity: 0, y: 16 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ ...ENTER, delay: 0.3 }}
							className="mt-7 max-w-xl text-base md:text-[17px] leading-relaxed text-[#a1a1aa]"
						>
							waifu.fun is the launchpad for autonomous agents. ElizaOS, openclaw, custom Python, doesn't matter. We
							give your agent a Safe wallet, a token on BSC, and Steward access. You bring the brain.
						</motion.p>

						<motion.div
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ ...ENTER, delay: 0.45 }}
							className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center"
						>
							<Link
								href="/create/wizard"
								className="group inline-flex items-center justify-center gap-2 rounded-sm bg-[#00ff87] px-6 py-3.5 text-sm font-medium uppercase tracking-[0.14em] text-[#08080a] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98]"
							>
								<span>launch an agent</span>
								<span className="flex h-6 w-6 items-center justify-center rounded-sm bg-[#08080a]/15 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5">
									<ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
								</span>
							</Link>
							<Link
								href="#how-it-works"
								className="group inline-flex items-center justify-center gap-2 rounded-sm border border-[rgba(255,255,255,0.10)] bg-transparent px-6 py-3.5 text-sm font-medium uppercase tracking-[0.14em] text-[#a1a1aa] transition-colors duration-300 hover:border-[rgba(255,255,255,0.22)] hover:text-[#e4e4e7]"
							>
								<span>how it works</span>
							</Link>
						</motion.div>

						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							transition={{ ...ENTER, delay: 0.6 }}
							className="mt-8 flex flex-wrap items-center gap-2"
						>
							{STACK_CHIPS.map((chip, i) => (
								<FrameworkChip key={chip.label} label={chip.label} mono={chip.mono} delay={0.7 + i * 0.08} />
							))}
						</motion.div>
					</div>

					{/* Right: editorial sidecar */}
					<motion.aside
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ ...ENTER, delay: 0.4 }}
						className="rounded-sm border border-[rgba(255,255,255,0.06)] bg-[rgba(12,12,14,0.7)] p-6 md:p-7"
					>
						<div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#52525b]">what you get</div>

						<dl className="mt-5 divide-y divide-[rgba(255,255,255,0.05)]">
							<div className="flex items-baseline justify-between gap-4 py-3.5 first:pt-0">
								<dt className="text-sm text-[#e4e4e7]">Safe wallet</dt>
								<dd className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#52525b]">BSC</dd>
							</div>
							<div className="flex items-baseline justify-between gap-4 py-3.5">
								<dt className="text-sm text-[#e4e4e7]">token launch</dt>
								<dd className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#52525b]">four.meme</dd>
							</div>
							<div className="flex items-baseline justify-between gap-4 py-3.5">
								<dt className="text-sm text-[#e4e4e7]">steward keys</dt>
								<dd className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#52525b]">scoped</dd>
							</div>
							<div className="flex items-baseline justify-between gap-4 py-3.5">
								<dt className="text-sm text-[#e4e4e7]">EIP-8004 identity</dt>
								<dd className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#52525b]">on-chain</dd>
							</div>
							<div className="flex items-baseline justify-between gap-4 py-3.5 last:pb-0">
								<dt className="text-sm text-[#e4e4e7]">runtime adapter</dt>
								<dd className="font-mono text-[11px] uppercase tracking-[0.16em] text-[#00ff87]">3 modes</dd>
							</div>
						</dl>
					</motion.aside>
				</motion.div>
			</div>
		</section>
	);
}
