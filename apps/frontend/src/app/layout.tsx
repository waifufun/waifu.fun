import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import Header from "@/components/header";
import Footer from "@/components/footer";

const inter = Inter({
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: {
		default: "Auto.Fun",
		template: "%s | Auto.Fun",
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
								<div className="p-4">{children}</div>
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
