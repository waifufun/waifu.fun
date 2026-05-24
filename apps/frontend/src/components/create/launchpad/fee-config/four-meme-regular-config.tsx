"use client";

import { useTranslation } from "@/contexts/locale-context";
import { InfoIcon } from "../launchpad-icons";

export default function FourMemeRegularConfig() {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col gap-6">
			<section>
				<header className="mb-3">
					<h2 className="text-xs font-mono uppercase tracking-[0.2em] text-neutral-400">
						{t("wizard.launchpad.regular.feeSummary")}
					</h2>
					<p className="mt-1 text-[11px] text-neutral-500 leading-relaxed">{t("wizard.launchpad.regular.helper")}</p>
				</header>

				<div className="border border-white/8 bg-white/[0.012] divide-y divide-white/5">
					<div className="grid grid-cols-[140px_1fr] py-4 px-4 gap-3 items-center">
						<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
							{t("wizard.launchpad.regular.curvePhase")}
						</dt>
						<dd className="text-sm font-mono text-white tabular-nums">
							{t("wizard.launchpad.regular.curvePhaseValue")}
						</dd>
					</div>
					<div className="grid grid-cols-[140px_1fr] py-4 px-4 gap-3 items-center">
						<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
							{t("wizard.launchpad.regular.postGraduation")}
						</dt>
						<dd className="text-sm font-mono text-white tabular-nums">
							{t("wizard.launchpad.regular.postGraduationValue")}
						</dd>
					</div>
					<div className="grid grid-cols-[140px_1fr] py-4 px-4 gap-3 items-center">
						<dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">
							{t("wizard.launchpad.regular.platformCut")}
						</dt>
						<dd className="text-sm font-mono text-neutral-300 tabular-nums">
							{t("wizard.launchpad.regular.platformCutValue")}
						</dd>
					</div>
				</div>
			</section>

			<section className="border border-white/8 bg-white/[0.012] p-4 flex gap-3">
				<InfoIcon className="h-4 w-4 text-neutral-500 shrink-0 mt-0.5" />
				<p className="text-xs text-neutral-400 leading-relaxed">{t("wizard.launchpad.regular.note")}</p>
			</section>
		</div>
	);
}
