import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import { Space_Grotesk } from "next/font/google";
import { cn } from "@/lib/utils";
import Header from "@/components/header";
import Footer from "@/components/footer";
import InteractiveBackground from "@/components/InteractiveBackground";
import GrainOverlay from "@/components/grain-overlay";
import { AlertTriangleIcon } from "lucide-react";

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
	description: "ai agent token launchpad. launch, trade, and keep your agents alive.",
	metadataBase: new URL(process.env.NEXT_PUBLIC_HOST || "http://localhost:3000"),
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
		description: "ai agent token launchpad. launch, trade, and keep your agents alive.",
		siteName: "waifu.fun",
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "waifu.fun",
		description: "ai agent token launchpad. launch, trade, and keep your agents alive.",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className="dark h-full"
			style={{
				colorScheme: "dark",
			}}
		>
			<body
				className={cn("h-full font-sans antialiased", spaceGrotesk.variable, spaceGrotesk.className)}
			>
				<Providers>
					<InteractiveBackground />
					<GrainOverlay />
					<div className="relative z-10 flex flex-col min-h-screen">
						<Header />
						<main className="flex-1 flex flex-col" data-sidebar="inset">
							{process.env.NEXT_PUBLIC_NETWORK === "devnet" ? (
								<div className="w-full bg-[rgba(0,255,135,0.06)] border-b border-[rgba(0,255,135,0.15)]">
									<div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-2 text-sm">
										<AlertTriangleIcon className="w-4 h-4 text-[#00ff87] flex-shrink-0" />
										<span className="text-[#a1a1aa]">
											<span className="font-mono font-semibold text-[#00ff87] uppercase tracking-wider text-xs">devnet</span>
											{" "}— this is a development environment connected to testnet. nothing here is real.
										</span>
									</div>
								</div>
							) : null}
							{children}
							<Footer />
						</main>
					</div>
				</Providers>
			</body>
		</html>
	);
}
