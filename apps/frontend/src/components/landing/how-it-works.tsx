"use client";

import { useTranslation } from "@/contexts/locale-context";

/**
 * HowItWorks
 *
 * A compact, static-export-safe strip on the homepage that makes the DEFAULT
 * launch path legible without leaving the page: permissionless cloud agent.
 * Name it -> it gets a wallet + guardrails -> the cloud runs it. The curated /
 * bring-your-own (skill.md) lane is demoted to a single secondary line.
 */
export default function HowItWorks() {
	const { t } = useTranslation();

	const steps = [
		{ n: "01", title: t("home.howStep1Title"), body: t("home.howStep1Body") },
		{ n: "02", title: t("home.howStep2Title"), body: t("home.howStep2Body") },
		{ n: "03", title: t("home.howStep3Title"), body: t("home.howStep3Body") },
	];

	return (
		<section className="relative z-20 w-full border-t border-white/[0.06]">
			<div className="mx-auto w-full max-w-6xl px-5 md:px-8 py-16 md:py-20">
				<div className="mb-2 text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
					{t("home.howLabel")}
				</div>
				<h2 className="text-2xl md:text-3xl leading-tight tracking-tight text-white max-w-2xl">{t("home.howTitle")}</h2>

				<ol className="mt-10 grid grid-cols-1 gap-px border border-white/[0.06] bg-white/[0.06] md:grid-cols-3">
					{steps.map((s) => (
						<li key={s.n} className="flex flex-col gap-2 bg-[#08080a] px-6 py-7">
							<span className="font-mono text-[10px] uppercase tracking-[0.24em] text-[#00ff87] tabular-nums">
								[{s.n}]
							</span>
							<h3 className="text-base text-white tracking-tight lowercase">{s.title}</h3>
							<p className="text-sm leading-relaxed text-white/55">{s.body}</p>
						</li>
					))}
				</ol>

				<div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<p className="text-[13px] leading-relaxed text-white/40 max-w-[60ch]">{t("home.howCurated")}</p>
					<a
						href="/give-skill"
						className="shrink-0 text-[11px] font-mono uppercase tracking-[0.2em] text-white/50 hover:text-white/90 transition-colors duration-150"
					>
						{t("home.howCuratedCta")}
					</a>
				</div>
			</div>
		</section>
	);
}
