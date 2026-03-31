"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangleIcon } from "lucide-react";
import { AppSidebar } from "@/components/app-sidebar";
import Footer from "@/components/footer";
import Header from "@/components/header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const isLitepaper = pathname === "/" || pathname === "/litepaper" || pathname.startsWith("/litepaper/");

	if (isLitepaper) {
		return <div className="max-h-[100dvh] overflow-x-hidden overflow-y-auto">{children}</div>;
	}

	return (
		<SidebarProvider>
			<SidebarInset className="flex max-h-screen flex-col overflow-auto">
				<Header />
				<main className="flex-1">
					<div className="p-4">
						{process.env.NEXT_PUBLIC_NETWORK === "devnet" ? (
							<div className="mx-auto my-4 max-w-4xl bg-amber-400 px-4 py-2 text-lg text-amber-700">
								<div className="inline-flex gap-x-2">
									<AlertTriangleIcon />
									<span>
										<span className="font-bold">WARNING</span> This is a development environment connected to
										Testnet. Nothing you do here is real.
									</span>
								</div>
							</div>
						) : null}
						{children}
					</div>
				</main>
				<Footer />
			</SidebarInset>
			<AppSidebar />
		</SidebarProvider>
	);
}
