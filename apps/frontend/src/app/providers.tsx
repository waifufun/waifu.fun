"use client";
import {FunHeader} from "@/components/v3-header";
import { ProgressProvider } from "@bprogress/next/app";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleAnalytics } from "@next/third-parties/google";
import Footer from "@/components/footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/providers/solana-provider";
import { AnimationProvider } from "@/providers/animation-provider";

const queryClient = new QueryClient();

const googleTagID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<TooltipProvider delayDuration={0}>
			<AnimationProvider>
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
						<SolanaProvider>
							<FunHeader />
							{children}
							<Toaster />
							<Footer />
							<GoogleAnalytics gaId={googleTagID} />
						</SolanaProvider>
					</QueryClientProvider>
				</ProgressProvider>
			</AnimationProvider>
		</TooltipProvider>
	);
}
