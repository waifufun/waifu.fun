import type { Metadata } from "next";
import LitepaperShell from "@/components/litepaper/litepaper-shell";

export const metadata: Metadata = {
	title: "litepaper | waifu.fun",
	description:
		"The agent launchpad where trading fees fine-tune your waifu's model. Launch tokens with AI agents that get smarter the more people trade them.",
};

export default function LitepaperLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return <LitepaperShell>{children}</LitepaperShell>;
}
