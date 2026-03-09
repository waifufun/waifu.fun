"use client";

import { useTranslation } from "@/contexts/locale-context";
import { AlertTriangleIcon } from "lucide-react";

export default function DevnetBanner() {
	const { t } = useTranslation();
	return (
		<div className="w-full bg-[rgba(0,255,135,0.06)] border-b border-[rgba(0,255,135,0.15)]">
			<div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-sm">
				<AlertTriangleIcon className="w-4 h-4 text-[#00ff87] flex-shrink-0" />
				<span className="text-[#a1a1aa]">
					<span className="font-mono font-semibold text-[#00ff87] uppercase tracking-wider text-xs">
						{t("layout.devnet")}
					</span>{" "}
					{t("layout.devnetBanner")}
				</span>
			</div>
		</div>
	);
}
