import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import { Inter, Orbitron, Audiowide } from "next/font/google";
import { cn } from "@/lib/utils";
import AppShell from "@/components/app-shell";

const inter = Inter({
	subsets: ["latin"],
});

const orbitron = Orbitron({
	subsets: ["latin"],
	variable: "--font-orbitron",
	weight: ["700"],
});

const audiowide = Audiowide({
	subsets: ["latin"],
	variable: "--font-audiowide",
	weight: ["400"],
});

export const metadata: Metadata = {
	title: {
		default: "waifu.fun",
		template: "%s | waifu.fun",
	},
	description: "the agent token launchpad",
	metadataBase: new URL(process.env.NEXT_PUBLIC_HOST || "https://waifu.fun"),
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className={cn("dark h-full", orbitron.variable, audiowide.variable)}
			style={{
				colorScheme: "dark",
			}}
		>
			<body className={cn("h-full overflow-hidden bg-[#08080A] font-sans antialiased", inter.className)}>
				<Providers>
					<AppShell>{children}</AppShell>
				</Providers>
			</body>
		</html>
	);
}
