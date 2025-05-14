"use client";

import "./globals.css";
import Header from "@/components/header";
import { ProgressProvider } from "@bprogress/next/app";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

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
			<body className={"font-satoshi bg-autofun-background-primary text-autofun-text-primary antialiased"}>
				<ProgressProvider
					height="4px"
					color="#03FF24"
					options={{
						showSpinner: false,
					}}
					disableSameURL={false}
				>
					<QueryClientProvider client={queryClient}>
						<Header />
						<div className="xl:px-4">{children}</div>
						<Toaster />
					</QueryClientProvider>
				</ProgressProvider>
			</body>
		</html>
	);
}
