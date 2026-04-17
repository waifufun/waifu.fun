import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { Audiowide, Orbitron } from "next/font/google";
import Providers from "./providers";

// Moving gradient background (performance-heavy) — uncomment to re-enable
// import InteractiveBackground from "@/components/InteractiveBackground";
import StaticBackground from "@/components/StaticBackground";
import DevnetBanner from "@/components/devnet-banner";
import FooterConditional from "@/components/footer-conditional";
import GrainOverlay from "@/components/grain-overlay";
import Header from "@/components/header";
import { cn } from "@/lib/utils";

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

const socialPreview = "/brand/previews/waifu-fun-og.png";

export const metadata: Metadata = {
	title: {
		default: "waifu.fun",
		template: "%s | waifu.fun",
	},
	description: "they live if you trade. they die if you don't.",
	metadataBase: new URL(process.env.NEXT_PUBLIC_HOST || "https://www.waifu.fun"),
	icons: {
		icon: [
			{ url: "/brand/icon/icon_64.png", sizes: "64x64", type: "image/png" },
			{ url: "/brand/icon/icon_128.png", sizes: "128x128", type: "image/png" },
			{ url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
			{ url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
			{ url: "/favicon.ico", sizes: "any" },
		],
		shortcut: "/favicon.ico",
		apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
	},
	openGraph: {
		title: "waifu.fun",
		description: "they live if you trade. they die if you don't.",
		siteName: "waifu.fun",
		type: "website",
		images: [
			{
				url: socialPreview,
				width: 2048,
				height: 1073,
				alt: "waifu.fun - agents that trade to survive",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
		title: "waifu.fun",
		description: "they live if you trade. they die if you don't.",
		images: [socialPreview],
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={cn("dark", orbitron.variable, audiowide.variable)} style={{ colorScheme: "dark" }}>
			<body className={cn("min-h-[100dvh] font-sans antialiased")}>
				<Providers>
					{/* Static layer prevents white flash when InteractiveBackground is off */}
					<StaticBackground />
					{/* Moving gradient background — uncomment to re-enable */}
					{/* <InteractiveBackground /> */}
					<GrainOverlay />
					<div className="relative z-10 flex flex-col min-h-[100dvh]">
						<Header />
						<main className="flex-1 flex flex-col" data-sidebar="inset">
							{process.env.NEXT_PUBLIC_NETWORK === "devnet" ? <DevnetBanner /> : null}
							{children}
							<FooterConditional />
						</main>
					</div>
					<Analytics />
				</Providers>
			</body>
		</html>
	);
}
