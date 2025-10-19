"use client";
import { ProgressProvider } from "@bprogress/next/app";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleAnalytics } from "@next/third-parties/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/providers/solana-provider";
import { AnimationProvider } from "@/providers/animation-context";
import { Suspense, useState } from "react";
import { TransactionListenerProvider } from "@/providers/transaction-listener";
import dynamic from "next/dynamic";

// Dynamically import EvmProvider with SSR disabled
const EvmProvider = dynamic(() => import("@/providers/evm-provider").then((mod) => mod.EvmProvider), {
	ssr: false,
});

const googleTagID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "";

export default function Providers({ children }: { children: React.ReactNode }) {
	// Create a new QueryClient instance per request to avoid SSR hydration issues
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60 * 1000, // 1 minute
						refetchOnWindowFocus: false,
					},
				},
			})
	);

	return (
		<Suspense>
			<TooltipProvider delayDuration={0}>
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
						<AnimationProvider>
							<EvmProvider>
								<SolanaProvider>
									<TransactionListenerProvider>{children}</TransactionListenerProvider>
									<Toaster />
									<GoogleAnalytics gaId={googleTagID} />
								</SolanaProvider>
							</EvmProvider>
						</AnimationProvider>
					</QueryClientProvider>
				</ProgressProvider>
			</TooltipProvider>
		</Suspense>
	);
}
