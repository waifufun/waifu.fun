"use client";
import { ProgressProvider } from "@bprogress/next/app";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleAnalytics } from "@next/third-parties/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/providers/solana-provider";
import { AnimationProvider } from "@/providers/animation-context";
import { Suspense } from "react";

const queryClient = new QueryClient();

const googleTagID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "";

export default function Providers({ children }: { children: React.ReactNode }) {
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
							<SolanaProvider>
								{children}
								<Toaster />
								<GoogleAnalytics gaId={googleTagID} />
							</SolanaProvider>
						</AnimationProvider>
					</QueryClientProvider>
				</ProgressProvider>
			</TooltipProvider>
		</Suspense>
	);
}
