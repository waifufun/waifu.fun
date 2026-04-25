"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/contexts/locale-context";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@stwd/react";
import { LogIn, LogOut, Wallet } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useIsClient } from "usehooks-ts";
import { useAccount, useDisconnect } from "wagmi";
import { StewardUserMenu } from "./steward/steward-user-menu";
import { Button } from "./ui/button";

/**
 * Unified auth component for the header.
 *
 * States:
 * - Neither authed: single primary "sign in" CTA → /auth/connect picker (W9.5)
 * - Steward authed only: user menu + connect-wallet button
 * - Wallet connected only: wallet pill + ghost "sign in" → /auth/connect
 * - Both: user menu + wallet pill
 */
export default function HeaderAuth() {
	const { t } = useTranslation();
	const { isAuthenticated: isStewardAuthed, isLoading: stewardLoading } = useAuth();
	const { address, isConnected: isWalletConnected } = useAccount();
	const { disconnect } = useDisconnect();
	const isClient = useIsClient();
	const router = useRouter();
	const pathname = usePathname();
	const [walletDropdownOpen, setWalletDropdownOpen] = useState(false);

	const goSignIn = useCallback(() => {
		const returnTo = encodeURIComponent(pathname || "/patron");
		router.push(`/auth/connect?return_to=${returnTo}`);
	}, [pathname, router]);

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

	// --- Not authenticated at all: single primary sign-in CTA ---
	if (!hasAnyAuth) {
		return (
			<Button
				className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#00ff87] text-[#08080a] hover:bg-[#00ff87]/90 border-0 shadow-sm"
				onClick={goSignIn}
				aria-label={t("wallet.signIn") ?? "sign in"}
			>
				<LogIn className="size-4 mr-1.5" />
				{t("wallet.signIn") ?? "sign in"}
			</Button>
		);
	}

	// --- Some auth active: show relevant controls ---
	return (
		<div className="flex items-center gap-2">
			{/* Steward user menu (when steward-authed) */}
			{isStewardAuthed && <StewardUserMenu />}

			{/* Ghost sign-in (when only wallet connected, no steward) */}
			{!isStewardAuthed && (
				<Button
					className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm border border-[rgba(0,255,135,0.3)] bg-transparent text-[#00ff87] hover:bg-[rgba(0,255,135,0.08)] shadow-sm text-sm"
					onClick={goSignIn}
					aria-label={t("wallet.signIn") ?? "sign in"}
				>
					<LogIn className="size-4 mr-1.5" />
					{t("wallet.signIn") ?? "sign in"}
				</Button>
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
						className="w-44 rounded-sm border border-[rgba(255,255,255,0.1)] bg-[#111114] p-1 shadow-lg"
					>
						<button
							type="button"
							onClick={handleWalletSignOut}
							className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium text-[#a1a1aa] hover:text-[#e4e4e7] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
						>
							<LogOut className="size-4" />
							disconnect wallet
						</button>
					</PopoverContent>
				</Popover>
			)}

			{/* Connect Wallet button (when steward-authed but no wallet) */}
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
