import type { Metadata } from "next";

// Metadata is en-only for now (server-side). Localized metadata pending the
// broader SSR i18n setup. See handoff doc.
export const metadata: Metadata = {
	title: "privacy policy · waifu.fun",
	description: "how the waifu.fun open-source project handles information.",
};

export default function PrivacyPolicyLayout({ children }: { children: React.ReactNode }) {
	return children;
}
