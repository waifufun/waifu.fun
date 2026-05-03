"use client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LocaleProvider } from "@/contexts/locale-context";
import { AnimationProvider } from "@/providers/animation-context";
import { TransactionListenerProvider } from "@/providers/transaction-listener";
import { ProgressProvider } from "@bprogress/next/app";
import { GoogleAnalytics } from "@next/third-parties/google";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Toaster } from "sonner";

import { ApiAuthSync } from "@/components/steward/api-auth-sync";
import { AuthProvider } from "@/contexts/auth-context";
const StewardProviderLazy = dynamic(
	() => import("@/providers/steward-provider").then((mod) => mod.WaifuStewardProvider),
	{ ssr: false },
);

// Dynamic import prevents idb-keyval (via @wagmi/connectors → @base-org/account)
// from accessing `indexedDB` during SSR/static generation
const EvmProvider = dynamic(() => import("@/providers/evm-provider").then((mod) => mod.EvmProvider), { ssr: false });

// Solana wallet adapters touch window/localStorage at module init, so keep
// them client-only for the static-export build.
const SolanaProvider = dynamic(() => import("@/providers/solana-provider").then((mod) => mod.SolanaProvider), {
	ssr: false,
});

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
							<SolanaProvider>
								<StewardProviderLazy>
									<ApiAuthSync />
									<AuthProvider>
										<AnimationProvider>
											<TransactionListenerProvider>{children}</TransactionListenerProvider>
											<Toaster />
											<GoogleAnalytics gaId={googleTagID} />
										</AnimationProvider>
									</AuthProvider>
								</StewardProviderLazy>
							</SolanaProvider>
						</EvmProvider>
					</ProgressProvider>
				</TooltipProvider>
			</LocaleProvider>
		</Suspense>
	);
}
