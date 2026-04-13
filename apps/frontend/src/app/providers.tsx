"use client";
import dynamic from "next/dynamic";
import { ProgressProvider } from "@bprogress/next/app";
import { Toaster } from "sonner";
import { GoogleAnalytics } from "@next/third-parties/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimationProvider } from "@/providers/animation-context";
import { Suspense } from "react";
import { TransactionListenerProvider } from "@/providers/transaction-listener";
import { LocaleProvider } from "@/contexts/locale-context";

import { ApiAuthSync } from "@/components/steward/api-auth-sync";
const StewardProviderLazy = dynamic(
	() => import("@/providers/steward-provider").then((mod) => mod.WaifuStewardProvider),
	{ ssr: false },
);

// Dynamic import prevents idb-keyval (via @wagmi/connectors → @base-org/account)
// from accessing `indexedDB` during SSR/static generation
const EvmProvider = dynamic(
	() => import("@/providers/evm-provider").then((mod) => mod.EvmProvider),
	{ ssr: false },
);

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
						<StewardProviderLazy>
						<ApiAuthSync />
						<AnimationProvider>
							<TransactionListenerProvider>{children}</TransactionListenerProvider>
							<Toaster />
							<GoogleAnalytics gaId={googleTagID} />
						</AnimationProvider>
						</StewardProviderLazy>
					</EvmProvider>
				</ProgressProvider>
			</TooltipProvider>
			</LocaleProvider>
		</Suspense>
	);
}
