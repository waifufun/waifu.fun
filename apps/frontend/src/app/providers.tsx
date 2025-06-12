"use client";
import Header from "@/components/header";
import { ProgressProvider } from "@bprogress/next/app";
import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleAnalytics } from "@next/third-parties/google";
import Footer from "@/components/footer";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SolanaProvider } from "@/providers/solana-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AnimationProvider } from "@/providers/animation-context";

const queryClient = new QueryClient();

const googleTagID = process.env.NEXT_PUBLIC_GOOGLE_TAG_ID || "";

export default function Providers({ children }: { children: React.ReactNode }) {
	return (
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
							<SidebarProvider defaultOpen={true}>
								<SidebarInset>
									<Header />
									<div className="container">{children}</div>
									<Footer />
								</SidebarInset>
								<AppSidebar /> {/* Moved AppSidebar to be after SidebarInset for right-side rendering */}
							</SidebarProvider>
							<Toaster />
							<GoogleAnalytics gaId={googleTagID} />
						</SolanaProvider>
					</AnimationProvider>
				</QueryClientProvider>
			</ProgressProvider>
		</TooltipProvider>
	);
}
