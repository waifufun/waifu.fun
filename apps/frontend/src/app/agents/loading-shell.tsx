"use client";

import { useTranslation } from "@/contexts/locale-context";

export default function LoadingShell() {
	const { t } = useTranslation();
	return (
		<div className="mb-8">
			<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87] mb-3">
				{t("discover.agents.pageEyebrow")}
			</div>
			<div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
				<h1 className="text-3xl md:text-4xl leading-tight tracking-tight">{t("discover.agents.pageTitle")}</h1>
				<div className="h-3 w-48 bg-white/5 rounded-sm" />
			</div>
		</div>
	);
}
