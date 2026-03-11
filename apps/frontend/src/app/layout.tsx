import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";

import { cn } from "@/lib/utils";
import Header from "@/components/header";
import FooterConditional from "@/components/footer-conditional";
// Moving gradient background (performance-heavy) — uncomment to re-enable
// import InteractiveBackground from "@/components/InteractiveBackground";
import StaticBackground from "@/components/StaticBackground";
import GrainOverlay from "@/components/grain-overlay";
import DevnetBanner from "@/components/devnet-banner";

const socialPreview = "/brand/previews/lockup/lockup_waifufun_1024_dark.png";

export const metadata: Metadata = {
	title: {
		default: "waifu.fun",
		template: "%s | waifu.fun",
	},
	description: "they live if you trade. they die if you don't.",
	metadataBase: new URL(process.env.NEXT_PUBLIC_HOST || "https://waifufun.vercel.app"),
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
				width: 1024,
				height: 512,
				alt: "waifu.fun",
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
		<html lang="en" className="dark h-full" style={{ colorScheme: "dark" }}>
			<body className={cn("h-full font-sans antialiased")}>
				<Providers>
					{/* Static layer prevents white flash when InteractiveBackground is off */}
					<StaticBackground />
					{/* Moving gradient background — uncomment to re-enable */}
					{/* <InteractiveBackground /> */}
					<GrainOverlay />
					<div className="relative z-10 flex flex-col min-h-screen">
						<Header />
						<main className="flex-1 flex flex-col" data-sidebar="inset">
							{process.env.NEXT_PUBLIC_NETWORK === "devnet" ? (
								<DevnetBanner />
							) : null}
							{children}
							<FooterConditional />
						</main>
					</div>
				</Providers>
			</body>
		</html>
	);
}
