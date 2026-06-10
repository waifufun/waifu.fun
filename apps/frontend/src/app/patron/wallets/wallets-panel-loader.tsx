"use client";

import { useTranslation } from "@/contexts/locale-context";
import dynamic from "next/dynamic";

function WalletToolsLoading() {
	const { t } = useTranslation();
	return <p className="text-sm text-[#a1a1aa]">{t("patron.walletsPage.loadingPanel")}</p>;
}

const WalletManagementPanel = dynamic(() => import("@/components/patron/wallet-management-panel"), {
	ssr: false,
	loading: () => <WalletToolsLoading />,
});

export function WalletsPanelLoader() {
	return <WalletManagementPanel />;
}
