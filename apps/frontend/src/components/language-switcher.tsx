"use client";

import { useTranslation } from "@/contexts/locale-context";
import { cn } from "@/lib/utils";

export default function LanguageSwitcher() {
	const { locale, setLocale, t } = useTranslation();

	return (
		<div
			className="flex items-center rounded-sm border border-[rgba(255,255,255,0.08)] bg-[rgba(17,17,20,0.4)] p-0.5"
			role="group"
			aria-label={t("language.label")}
		>
			<button
				type="button"
				onClick={() => setLocale("en")}
				className={cn(
					"px-2.5 py-1.5 text-xs font-mono transition-colors",
					locale === "en" ? "bg-[#00ff87] text-black rounded-sm" : "text-[#71717a] hover:text-[#e4e4e7]",
				)}
				aria-pressed={locale === "en"}
			>
				{t("language.en")}
			</button>
			<button
				type="button"
				onClick={() => setLocale("zh")}
				className={cn(
					"px-2.5 py-1.5 text-xs font-mono transition-colors",
					locale === "zh" ? "bg-[#00ff87] text-black rounded-sm" : "text-[#71717a] hover:text-[#e4e4e7]",
				)}
				aria-pressed={locale === "zh"}
			>
				{t("language.zh")}
			</button>
		</div>
	);
}
