"use client";

import { useTranslation } from "@/contexts/locale-context";

interface ExplorerHeaderProps {
	tokenCount?: number;
}

export default function ExplorerHeader({ tokenCount = 0 }: ExplorerHeaderProps) {
	const { t } = useTranslation();

	return (
		<div className="mb-6 flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<span className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#52525b]">
					{t("explorer.featured") || "Featured"}
				</span>
				<span className="text-[11px] font-mono text-[#52525b]">
					{tokenCount} {t("explorer.live")}
				</span>
			</div>
			<div className="h-px w-full bg-[rgba(255,255,255,0.06)]" />
		</div>
	);
}
