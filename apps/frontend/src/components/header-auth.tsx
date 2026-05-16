"use client";

import { ConnectModal } from "@/components/auth/connect-modal";
import { useTranslation } from "@/contexts/locale-context";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { sanitizeRedirectPath } from "@/lib/url-safety";
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
		const rawReturnTo = params.get("return_to");
		if (!rawReturnTo) return;
		const returnTo = sanitizeRedirectPath(rawReturnTo, "");
		if (!returnTo) return;
		setLoginOpen(false);
		router.replace(returnTo);
	}, [isClient, isAuthenticated, params, router]);

	// SSR placeholder before client hydration. Render the button as a clickable
	// link to /auth/connect so deep-linkers / no-JS users still have a path in.
	if (!isClient) {
		return (
			<Button
				asChild
				className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#00ff87] text-[#08080a] hover:bg-[#00ff87]/90 border-0 shadow-sm"
			>
				<a href="/auth/connect">
					<LogIn className="size-4 mr-1.5" />
					{t("wallet.signIn") ?? "sign in"}
				</a>
			</Button>
		);
	}

	if (isAuthenticated) {
		return <WaifuUserMenu />;
	}

	// Auth still loading: show button as clickable but slightly muted. Worst
	// case the user clicks while we're still resolving session state and the
	// modal opens; that's strictly better UX than a permanently disabled CTA.
	if (isLoading) {
		return (
			<>
				<Button
					className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#00ff87] text-[#08080a] hover:bg-[#00ff87]/90 border-0 shadow-sm opacity-80"
					onClick={() => setLoginOpen(true)}
				>
					<LogIn className="size-4 mr-1.5" />
					{t("wallet.signIn") ?? "sign in"}
				</Button>
				<ConnectModal
					open={loginOpen}
					onOpenChange={setLoginOpen}
					returnTo={sanitizeRedirectPath(params.get("return_to"))}
				/>
			</>
		);
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
			<ConnectModal open={loginOpen} onOpenChange={setLoginOpen} returnTo={sanitizeRedirectPath(params.get("return_to"))} />
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
