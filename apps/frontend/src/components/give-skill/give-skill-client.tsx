"use client";

import { useTranslation } from "@/contexts/locale-context";
import Link from "next/link";
import PromptBlock from "./prompt-block";

export default function GiveSkillClient() {
	const { t } = useTranslation();

	return (
		<main className="relative mx-auto flex w-full max-w-3xl flex-col px-5 py-16 md:px-8 md:py-20">
			<div className="mb-2 text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
				{t("wizard.giveSkill.badge")}
			</div>

			<h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-medium tracking-tight text-white">
				{t("wizard.giveSkill.title")}
			</h1>

			<p className="mt-3 max-w-xl text-[15px] leading-relaxed text-[#a1a1aa]">{t("wizard.giveSkill.intro")}</p>

			<div className="mt-8">
				<div className="mb-3 flex items-center gap-3">
					<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">
						{t("wizard.giveSkill.pasteThis")}
					</span>
					<span className="h-px flex-1 bg-white/10" />
				</div>
				<PromptBlock prompt={t("wizard.giveSkill.prompt")} />
			</div>

			<div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
				<Link
					href="/skill.md"
					className="group flex flex-col gap-1.5 border border-white/10 bg-[#0b0b0d] px-5 py-4 transition-colors hover:border-white/25"
				>
					<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">
						{t("wizard.giveSkill.skillBadge")}
					</span>
					<span className="text-[14px] text-[#e4e4e7]">{t("wizard.giveSkill.skillTitle")}</span>
					<span className="text-[12px] text-[#71717a]">{t("wizard.giveSkill.skillBody")}</span>
				</Link>
				<Link
					href="/quickstart"
					className="group flex flex-col gap-1.5 border border-white/10 bg-[#0b0b0d] px-5 py-4 transition-colors hover:border-white/25"
				>
					<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">
						{t("wizard.giveSkill.quickstartBadge")}
					</span>
					<span className="text-[14px] text-[#e4e4e7]">{t("wizard.giveSkill.quickstartTitle")}</span>
					<span className="text-[12px] text-[#71717a]">{t("wizard.giveSkill.quickstartBody")}</span>
				</Link>
			</div>

			<div className="mt-12 border-t border-white/10 pt-8">
				<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a]">
					{t("wizard.giveSkill.noAgent")}
				</div>
				<p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#a1a1aa]">{t("wizard.giveSkill.noAgentBody")}</p>
				<Link
					href="/create/wizard"
					className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-[#71717a] hover:text-[#e4e4e7] transition-colors"
				>
					{t("wizard.giveSkill.openWizard")}
				</Link>
			</div>
		</main>
	);
}
