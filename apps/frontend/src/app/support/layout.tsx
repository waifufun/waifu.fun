import type { Metadata } from "next";

// Note: metadata is locale-static for now. SSR-aware metadata (per locale)
// would require reading a cookie/header in generateMetadata. Tracked as
// follow-up alongside the broader server-side i18n setup.
export const metadata: Metadata = {
	title: "support · waifu.fun",
	description: "get help with WAIFU agent launches, wallets, FLAP curves, and patron claims.",
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
	return children;
}
