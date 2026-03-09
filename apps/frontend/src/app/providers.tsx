"use client";
import { ProgressProvider } from "@bprogress/next/app";
import { Toaster } from "sonner";
import { GoogleAnalytics } from "@next/third-parties/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EvmProvider } from "@/providers/evm-provider";
import { AnimationProvider } from "@/providers/animation-context";
import { Suspense } from "react";
import { TransactionListenerProvider } from "@/providers/transaction-listener";
import { LocaleProvider } from "@/contexts/locale-context";

const googleTagID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
		<Suspense>
			<LocaleProvider>
				<TooltipProvider delayDuration={0}>
					<ProgressProvider
					height="4px"
					color="#00ff87"
					options={{
						showSpinner: false,
					}}
					disableSameURL={false}
					shallowRouting={true}
					shouldCompareComplexProps
				>
					<EvmProvider>
						<AnimationProvider>
							<TransactionListenerProvider>{children}</TransactionListenerProvider>
							<Toaster />
							<GoogleAnalytics gaId={googleTagID} />
						</AnimationProvider>
					</EvmProvider>
				</ProgressProvider>
			</TooltipProvider>
			</LocaleProvider>
		</Suspense>
	);
}
