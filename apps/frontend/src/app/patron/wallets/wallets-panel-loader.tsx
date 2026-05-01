"use client";

import dynamic from "next/dynamic";

const WalletManagementPanel = dynamic(() => import("@/components/patron/wallet-management-panel"), {
	ssr: false,
	loading: () => <p className="text-sm text-[#a1a1aa]">loading wallet tools…</p>,
});

export function WalletsPanelLoader() {
	return <WalletManagementPanel />;
}
