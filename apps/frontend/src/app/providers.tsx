"use client";

import Header from "@/components/header";
import { ProgressProvider } from "@bprogress/next/app";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { WagmiProvider } from "wagmi";
import { base, baseSepolia } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { ParentProvider } from "@/components/hooks/providers/ParentProvider";
import { GoogleAnalytics } from "@next/third-parties/google";
import Footer from "@/components/footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ChainAdapter } from "@reown/appkit";

const queryClient = new QueryClient();
const projectId = process.env.NEXT_PUBLIC_PROJECT_ID as string;
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [base, baseSepolia];

const wagmiAdapterInstance = new WagmiAdapter({
	networks,
	projectId,
	ssr: true,
});
export const config = wagmiAdapterInstance.wagmiConfig;

createAppKit({
	adapters: [wagmiAdapterInstance as unknown as ChainAdapter],
	networks,
	projectId,
	metadata: {
		name: "Auto.Fun",
		description: "Press the fun button.",
		url: "https://auto.fun",
		icons: ["./logo_wide.svg"],
	},
	features: {
		analytics: true,
	},
});

const googleTagID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<TooltipProvider delayDuration={0}>
			<WagmiProvider config={config}>
				<ProgressProvider
					height="4px"
					color="#03FF24"
					options={{
						showSpinner: false,
					}}
					disableSameURL={false}
					shallowRouting={true}
					shouldCompareComplexProps
				>
					<QueryClientProvider client={queryClient}>
						<ParentProvider>
							<Header />
							{children}
							<Toaster />
							<Footer />
							<GoogleAnalytics gaId={googleTagID} />
						</ParentProvider>
					</QueryClientProvider>
				</ProgressProvider>
			</WagmiProvider>
		</TooltipProvider>
	);
}
