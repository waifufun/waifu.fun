"use client";

import { useTranslation } from "@/contexts/locale-context";
import { AlertTriangle } from "lucide-react";

export default function ScamWarning({ isHidden }: { isHidden?: boolean }) {
	const { t } = useTranslation();
	if (!isHidden) return null;
	return (
		<div className="p-4 flex flex-col bg-[#333333]/10 rounded-sm " role="alert">
			<div className="flex items-center">
				<AlertTriangle className="w-6 h-6 mr-2 flex-shrink-0 text-red-500" />
				<span className="font-semibold text-red-500 tracking-wide">{t("layout.scamNotice.title")}</span>
			</div>
			<p className="mt-2 text-sm">
				{t("layout.scamNotice.bodyBefore")} <strong>{t("layout.scamNotice.bodyEmphasis")}</strong>
				{t("layout.scamNotice.bodyAfter")}
			</p>
		</div>
	);
}
