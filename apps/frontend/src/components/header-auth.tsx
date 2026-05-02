"use client";

import { ConnectModal } from "@/components/auth/connect-modal";
import { useTranslation } from "@/contexts/locale-context";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useIsClient } from "usehooks-ts";
import { WaifuUserMenu } from "./auth/waifu-user-menu";
import { Button } from "./ui/button";

function HeaderAuthInner() {
	const { t } = useTranslation();
	const { isAuthenticated, isLoading } = useWaifuAuth();
	const isClient = useIsClient();
	const params = useSearchParams();
	const router = useRouter();
	const [loginOpen, setLoginOpen] = useState(false);

	useEffect(() => {
		if (!isClient || isLoading) return;
		if (params.get("signin") !== "1" || isAuthenticated) return;
		setLoginOpen(true);
	}, [isClient, isLoading, params, isAuthenticated]);

	useEffect(() => {
		if (!isClient || !isAuthenticated) return;
		const returnTo = params.get("return_to");
		if (!returnTo || !returnTo.startsWith("/")) return;
		setLoginOpen(false);
		router.replace(returnTo);
	}, [isClient, isAuthenticated, params, router]);

	if (!isClient || isLoading) {
		return (
			<Button
				className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#00ff87] text-[#08080a] border-0 shadow-sm opacity-50 pointer-events-none"
				disabled
			>
				{t("wallet.signIn") ?? "sign in"}
			</Button>
		);
	}

	if (isAuthenticated) {
		return <WaifuUserMenu />;
	}

	return (
		<>
			<Button
				className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#00ff87] text-[#08080a] hover:bg-[#00ff87]/90 border-0 shadow-sm"
				onClick={() => setLoginOpen(true)}
			>
				<LogIn className="size-4 mr-1.5" />
				{t("wallet.signIn") ?? "sign in"}
			</Button>
			<ConnectModal open={loginOpen} onOpenChange={setLoginOpen} returnTo={params.get("return_to") ?? "/patron"} />
		</>
	);
}

export default function HeaderAuth() {
	return (
		<Suspense
			fallback={
				<div className="h-[38px] w-[100px] rounded-sm bg-[rgba(255,255,255,0.04)] animate-pulse" aria-hidden="true" />
			}
		>
			<HeaderAuthInner />
		</Suspense>
	);
}
