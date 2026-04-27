"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/contexts/locale-context";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { LogIn, LogOut, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useIsClient } from "usehooks-ts";
import { useAccount, useDisconnect } from "wagmi";
import { WaifuUserMenu } from "./auth/waifu-user-menu";
import { StewardLoginWidget } from "./steward/steward-login-widget";
import { Button } from "./ui/button";

/**
 * Unified auth component for the header.
 *
 * States:
 * - Neither authed: single "sign in" button → modal with Steward + wallet options
 * - Steward authed only: user menu + "Connect Wallet" button
 * - Wallet connected only: wallet pill + "sign in" button
 * - Both: user menu + wallet pill
 *
 * W9.9: when the URL carries `?signin=1` (set by middleware after a
 * gated redirect, or anyone deep-linking a sign-in CTA), auto-open
 * the modal on mount. After successful auth, honor `return_to`.
 */
function HeaderAuthInner() {
	const { t } = useTranslation();
	// `wf_authed` cookie-based auth state. @stwd/react's useAuth tracks
	// localStorage which doesn't match our HttpOnly-cookie session model.
	const { isAuthenticated: isStewardAuthed, isLoading: stewardLoading } = useWaifuAuth();
	const { address, isConnected: isWalletConnected } = useAccount();
	const { disconnect } = useDisconnect();
	const isClient = useIsClient();
	const params = useSearchParams();
	const router = useRouter();
	const [loginOpen, setLoginOpen] = useState(false);
	const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);

	// Auto-open the modal when ?signin=1 is in the URL and the user is
	// not yet Steward-authed. Middleware uses this query param to bounce
	// anonymous users back to the homepage with the modal pre-opened.
	useEffect(() => {
		if (!isClient) return;
		if (stewardLoading) return;
		if (params.get("signin") !== "1") return;
		if (isStewardAuthed) return;
		setLoginOpen(true);
	}, [isClient, stewardLoading, params, isStewardAuthed]);

	// Once the user becomes authenticated and we have a return_to, push
	// them there. The OAuth flow itself also handles return_to (the
	// callback page reads it after finalize), so this is mostly a
	// belt-and-suspenders for the wallet-only / magic-link paths and
	// for the case where auth state flips while the modal is open.
	useEffect(() => {
		if (!isClient) return;
		if (!isStewardAuthed) return;
		const returnTo = params.get("return_to");
		if (!returnTo || !returnTo.startsWith("/")) return;
		setLoginOpen(false);
		router.replace(returnTo);
	}, [isClient, isStewardAuthed, params, router]);

	const handleWalletSignOut = useCallback(() => {
		setWalletDropdownOpen(false);
		disconnect();
	}, [disconnect]);

	// SSR / loading state
	if (!isClient || stewardLoading) {
		return (
			<Button
				className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#00ff87] text-[#08080a] border-0 shadow-sm opacity-50 pointer-events-none"
				disabled
			>
				{t("wallet.signIn") ?? "sign in"}
			</Button>
		);
	}

	const hasAnyAuth = isStewardAuthed || isWalletConnected;

	// --- Not authenticated at all: single sign-in button ---
	if (!hasAnyAuth) {
		return (
			<>
				<Button
					className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#00ff87] text-[#08080a] hover:bg-[#00ff87]/90 border-0 shadow-sm"
					onClick={() => setLoginOpen(true)}
				>
					<LogIn className="size-4 mr-1.5" />
					{t("wallet.signIn") ?? "sign in"}
				</Button>
				<StewardLoginWidget open={loginOpen} onOpenChange={setLoginOpen} />
			</>
		);
	}

	// --- Some auth active: show relevant controls ---
	return (
		<div className="flex items-center gap-2">
			{/* Steward user menu (when steward-authed) */}
			{isStewardAuthed && <WaifuUserMenu />}

			{/* sign in button (when only wallet connected, no steward) */}
			{!isStewardAuthed && (
				<>
					<Button
						className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm border border-[rgba(0,255,135,0.3)] bg-transparent text-[#00ff87] hover:bg-[rgba(0,255,135,0.08)] shadow-sm text-sm"
						onClick={() => setLoginOpen(true)}
					>
						<LogIn className="size-4 mr-1.5" />
						{t("wallet.signIn") ?? "sign in"}
					</Button>
					<StewardLoginWidget open={loginOpen} onOpenChange={setLoginOpen} />
				</>
			)}

			{/* Wallet pill (when connected) */}
			{isWalletConnected && address && (
				<Popover open={walletDropdownOpen} onOpenChange={setWalletDropdownOpen}>
					<PopoverTrigger asChild>
						<Button
							className="h-[38px] min-h-[38px] max-h-[38px] px-3 py-2 font-medium rounded-sm bg-[rgba(0,255,135,0.08)] text-[#00ff87] hover:bg-[rgba(0,255,135,0.15)] border border-[rgba(0,255,135,0.15)] shadow-sm text-sm font-mono"
							title={address}
							type="button"
						>
							<Wallet className="size-3.5 mr-1.5 opacity-70" />
							{`${address.slice(0, 6)}...${address.slice(-4)}`}
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="end"
						sideOffset={8}
						className="w-44 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#111114] p-1 shadow-lg"
					>
						<button
							type="button"
							onClick={handleWalletSignOut}
							className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-400 hover:bg-[rgba(255,255,255,0.06)] transition-colors"
						>
							<LogOut className="size-4" />
							disconnect wallet
						</button>
					</PopoverContent>
				</Popover>
			)}

			{/* connect wallet button (when steward-authed but no wallet) */}
			{isStewardAuthed && !isWalletConnected && (
				<ConnectButton.Custom>
					{({ openConnectModal }) => (
						<Button
							className="h-[38px] min-h-[38px] max-h-[38px] px-3 py-2 font-medium rounded-sm border border-[rgba(255,255,255,0.1)] bg-transparent text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[rgba(255,255,255,0.05)] shadow-sm text-sm"
							onClick={openConnectModal}
						>
							<Wallet className="size-4 mr-1.5 opacity-70" />
							{t("wallet.connectWallet") ?? "connect wallet"}
						</Button>
					)}
				</ConnectButton.Custom>
			)}
		</div>
	);
}

/**
 * Suspense wrapper — useSearchParams() requires it under Next.js
 * App Router for static rendering compatibility.
 */
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
