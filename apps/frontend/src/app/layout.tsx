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
	description: "Press the fun button.",
	metadataBase: new URL(process.env.NEXT_PUBLIC_HOST || "http://localhost:3000"),
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
								<div className="px-4 py-2 bg-amber-400 text-amber-700 max-w-4xl mx-auto my-4 text-lg">
									<div className="inline-flex gap-x-2">
										<AlertTriangleIcon />
										<span>
											<span className="font-bold">WARNING</span> This is a development environment connected to
											Testnet. Nothing you do here is real.
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
