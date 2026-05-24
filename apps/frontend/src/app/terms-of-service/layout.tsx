import type { Metadata } from "next";

// Metadata is en-only for now (server-side). Localized metadata pending the
// broader SSR i18n setup. See handoff doc.
export const metadata: Metadata = {
	title: "terms of service · waifu.fun",
	description: "the terms that govern WAIFU platform access, wallet usage, and launch participation.",
};

export default function TermsOfServiceLayout({ children }: { children: React.ReactNode }) {
	return children;
}
