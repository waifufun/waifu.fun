import type { Metadata } from "next";
import LitepaperShell from "@/components/litepaper/litepaper-shell";

export const metadata: Metadata = {
	title: "waifu.fun",
	description: "The agent launchpad where trading fees fine-tune your waifu's model.",
};

export default function LitepaperLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return <LitepaperShell>{children}</LitepaperShell>;
}
