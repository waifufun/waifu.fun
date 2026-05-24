"use client";

import { useTranslation } from "@/contexts/locale-context";
import { WalletsPanelLoader } from "./wallets-panel-loader";

export function WalletsContent() {
	const { t } = useTranslation();
	return (
		<div className="max-w-4xl mx-auto px-5 md:px-8 py-12">
			<div className="mb-8">
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a] mb-2">
					{t("patron.walletsPage.breadcrumb")}
				</p>
				<h1 className="text-2xl md:text-3xl font-medium text-[#e4e4e7] tracking-tight">
					{t("patron.walletsPage.title")}
				</h1>
				<p className="mt-2 text-sm text-[#a1a1aa] max-w-[68ch] leading-relaxed">{t("patron.walletsPage.subtitle")}</p>
			</div>
			<WalletsPanelLoader />
		</div>
	);
}
