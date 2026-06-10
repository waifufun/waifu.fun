/**
 * Loading shell for /agent/[address]. Mirrors the AgentHomeV2 page rhythm:
 * top bar, hero (poster + identity stack), economics card, treasury card.
 *
 * Real shape, never a generic spinner or 'loading...' text.
 */
"use client";

import { ArrowLeft } from "lucide-react";

import { SurfaceCard } from "@/components/ui/surface-card";
import { useTranslation } from "@/contexts/locale-context";

export default function Loading() {
	const { t } = useTranslation();
	return (
		<main className="min-h-[100dvh] text-white">
			<div className="mx-auto w-full max-w-6xl px-5 pb-24 pt-8 md:px-8">
				{/* top bar */}
				<div className="flex items-center justify-between">
					<span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-white/40">
						<ArrowLeft className="h-3 w-3" strokeWidth={1.5} />
						{t("agent.loading.agents")}
					</span>
					<div className="font-mono text-[10px] uppercase tracking-[0.24em] text-white/25">
						{t("agent.loading.brand")}
					</div>
				</div>

				{/* hero */}
				<section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
					<div className="lg:col-span-5">
						<SurfaceCard padding="none" className="relative aspect-square w-full overflow-hidden">
							<div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/[0.04] to-transparent" />
							<div className="absolute left-3 top-3 h-6 w-20 rounded-sm bg-white/[0.06]" />
							<div className="absolute right-3 top-3 h-6 w-20 rounded-sm bg-white/[0.06]" />
						</SurfaceCard>
					</div>
					<div className="flex flex-col gap-5 lg:col-span-7">
						<div className="flex flex-col gap-3">
							<div className="flex items-baseline gap-3">
								<div className="h-9 w-48 rounded-sm bg-white/10" />
								<div className="h-7 w-16 rounded-sm bg-white/[0.06]" />
							</div>
							<div className="h-3 w-3/4 rounded-sm bg-white/[0.05]" />
							<div className="h-3 w-1/2 rounded-sm bg-white/[0.05]" />
						</div>
						<SurfaceCard padding="none" className="divide-y divide-white/[0.06]">
							{[0, 1, 2].map((i) => (
								<div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
									<div className="h-3 w-20 rounded-sm bg-white/[0.06]" />
									<div className="h-3 w-48 rounded-sm bg-white/[0.06]" />
								</div>
							))}
						</SurfaceCard>
					</div>
				</section>

				{/* economics */}
				<SectionShell title={t("agent.loading.economics")}>
					<SurfaceCard padding="lg">
						<div className="space-y-4">
							<div className="h-4 w-32 rounded-sm bg-white/10" />
							<div className="grid grid-cols-4 gap-2">
								{[0, 1, 2, 3].map((i) => (
									<div key={i} className="h-16 rounded-sm bg-white/[0.04]" />
								))}
							</div>
							<div className="h-3 w-full rounded-sm bg-white/[0.06]" />
						</div>
					</SurfaceCard>
				</SectionShell>

				{/* treasury */}
				<SectionShell title={t("agent.loading.treasury")}>
					<SurfaceCard padding="none" className="divide-y divide-white/[0.06]">
						{[0, 1, 2].map((i) => (
							<div
								key={i}
								className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center md:gap-6 md:px-6"
							>
								<div className="flex flex-col gap-1.5">
									<div className="h-2 w-24 rounded-sm bg-white/10" />
									<div className="h-3 w-40 rounded-sm bg-white/[0.06]" />
								</div>
								<div className="h-5 w-20 rounded-sm bg-white/[0.06]" />
							</div>
						))}
					</SurfaceCard>
				</SectionShell>
			</div>
		</main>
	);
}

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="mt-12">
			<div className="mb-4 flex items-baseline justify-between gap-3">
				<span className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/60">{title}</span>
				<div className="h-2.5 w-24 rounded-sm bg-white/[0.04]" />
			</div>
			{children}
		</section>
	);
}
