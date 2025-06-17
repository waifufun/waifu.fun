import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import BottomNav from "@/components/bottom-nav";
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
	metadataBase: new URL("https://auto.fun"),
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html
			lang="en"
			className="dark"
			style={{
				colorScheme: "dark",
			}}
		>
			<body className={cn("min-h-screen bg-[##0a0a0a00] font-sans antialiased", inter.className)}>
				<Providers>
					<SidebarProvider>
						<SidebarInset>
							<Header />
							<main className="flex-1 p-4">{children}</main>
							<Footer />
							<BottomNav />
						</SidebarInset>
						<AppSidebar />
					</SidebarProvider>
				</Providers>
			</body>
		</html>
	);
}
