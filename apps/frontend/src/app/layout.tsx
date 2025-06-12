import "./globals.css";
import type { Metadata } from "next";
import Providers from "./providers";
import BottomNav from "@/components/bottom-nav";
import { Inter } from "next/font/google";

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
			<body className={`${inter.className} bg-[#080808] text-autofun-text-primary antialiased container`}>
				<Providers>
					{children}
					<BottomNav />
				</Providers>
			</body>
		</html>
	);
}
