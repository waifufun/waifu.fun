import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import { Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";
import Header from "@/components/header";
import FooterConditional from "@/components/footer-conditional";
// Moving gradient background (performance-heavy) — uncomment to re-enable
// import InteractiveBackground from "@/components/InteractiveBackground";
import StaticBackground from "@/components/StaticBackground";
import GrainOverlay from "@/components/grain-overlay";
import DevnetBanner from "@/components/devnet-banner";

const spaceGrotesk = Space_Grotesk({
	subsets: ["latin"],
	weight: ["300", "400", "500", "600", "700"],
	variable: "--font-space-grotesk",
});

export const metadata: Metadata = {
	title: {
		default: "waifu.fun",
		template: "%s | waifu.fun",
	},
	description: "they live if you trade. they die if you don't.",
	metadataBase: new URL(process.env.NEXT_PUBLIC_HOST || "https://waifufun.vercel.app"),
	icons: {
		icon: [
			{ url: "/favicon.svg", type: "image/svg+xml" },
			{ url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
			{ url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
			{ url: "/favicon.ico", sizes: "any" },
		],
		apple: "/apple-touch-icon.png",
	},
	openGraph: {
		title: "waifu.fun",
		description: "they live if you trade. they die if you don't.",
		siteName: "waifu.fun",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "waifu.fun",
		description: "they live if you trade. they die if you don't.",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark h-full" style={{ colorScheme: "dark" }}>
			<body className={cn("h-full font-sans antialiased", spaceGrotesk.variable, spaceGrotesk.className)}>
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
