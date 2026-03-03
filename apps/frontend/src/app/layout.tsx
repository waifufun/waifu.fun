import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { AlertTriangleIcon } from "lucide-react";

const inter = Inter({
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: {
		default: "waifu.fun",
		template: "%s | waifu.fun",
	},
	description: "Press the fun button.",
	metadataBase: new URL(process.env.NEXT_PUBLIC_HOST as string),
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
			<body className={cn("h-full bg-[#0a0a0a] font-sans antialiased overflow-hidden", inter.className)}>
				<Providers>
					<SidebarProvider>
						<SidebarInset className="flex flex-col max-h-screen overflow-auto">
							<Header />
							<main className="flex-1">
								<div className="p-4">
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
								</div>
							</main>
							<Footer />
						</SidebarInset>
						<AppSidebar />
					</SidebarProvider>
				</Providers>
			</body>
		</html>
	);
}
