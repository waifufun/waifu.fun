"use client";

import { AuthGateLoader } from "@/components/auth/auth-gate-loader";
import { ConnectModal } from "@/components/auth/connect-modal";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/locale-context";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useState } from "react";

function Gate({ children }: { children: ReactNode }) {
	const { t } = useTranslation();
	const { isLoading, isAuthenticated } = useWaifuAuth();
	const pathname = usePathname();
	const [open, setOpen] = useState(false);
	if (isLoading) return <AuthGateLoader />;
	if (isAuthenticated) return <>{children}</>;
	return (
		<div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-6 text-center">
			<div className="rounded-lg border border-white/10 bg-[#0b0b0d] p-6 shadow-xl">
				<h1 className="text-xl font-semibold text-white">{t("auth.protected.title")}</h1>
				<p className="mt-2 text-sm text-[#a1a1aa]">{t("auth.protected.body")}</p>
				<Button className="mt-5 bg-[#00ff87] text-[#08080a] hover:bg-[#00ff87]/90" onClick={() => setOpen(true)}>
					{t("auth.protected.signInCta")}
				</Button>
			</div>
			<ConnectModal open={open} onOpenChange={setOpen} returnTo={pathname || "/patron"} />
		</div>
	);
}

export function ProtectedShell({ children }: { children: ReactNode }) {
	return (
		<Suspense fallback={<AuthGateLoader />}>
			<Gate>{children}</Gate>
		</Suspense>
	);
}
