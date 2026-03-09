"use client";

import { useTranslation } from "@/contexts/locale-context";

export default function HomeEmptyState() {
	const { t } = useTranslation();
	return (
		<div className="flex flex-col items-center gap-3">
			<span className="text-[#00ff87] text-lg font-semibold">{t("home.noAgentsFound")}</span>
			<span className="text-[#52525b] text-sm">{t("home.checkBackSoon")}</span>
		</div>
	);
}
