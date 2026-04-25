"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { StewardLogin, useAuth } from "@stwd/react";
import { Wallet } from "lucide-react";
import { useCallback } from "react";

interface StewardLoginWidgetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * Modal-wrapped Steward login for waifu.fun.
 *
 * Shows email, Google, and Discord sign-in options,
 * plus a wallet connect option via RainbowKit.
 *
 * @deprecated W9.9 retired this in favor of the standalone /auth/connect
 * picker page (apps/frontend/src/components/auth/oauth-connect-panel.tsx),
 * which renders all six providers reliably and matches Wave 8a aesthetic
 * (sharp corners, lowercase mono labels). Header sign-in now navigates to
 * /auth/connect?return_to=... instead of opening this modal. Kept for any
 * remaining consumers; do not add new ones.
 */
export function StewardLoginWidget({ open, onOpenChange }: StewardLoginWidgetProps) {
	const { isAuthenticated } = useAuth();

	const handleSuccess = useCallback(() => {
		onOpenChange(false);
	}, [onOpenChange]);

	if (isAuthenticated) {
		return null;
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[420px] border border-[rgba(255,255,255,0.08)] bg-[#08080a] p-0 gap-0 rounded-lg overflow-hidden">
				<DialogHeader className="sr-only">
					<DialogTitle>Sign in to waifu.fun</DialogTitle>
					<DialogDescription>Sign in with email, wallet, or social account</DialogDescription>
				</DialogHeader>

				{/* Branding header */}
				<div className="flex flex-col items-center pt-8 pb-2 px-6">
					<img src="/icon-512.png" alt="waifu.fun" className="size-12 mb-3 rounded-sm" />
					<h2 className="text-[1.125rem] font-semibold text-white tracking-tight">Welcome to waifu.fun</h2>
					<p className="text-sm text-[#71717a] mt-1">Sign in to create and manage your agents</p>
				</div>

				{/* Steward auth options */}
				<div className="p-6 pb-0">
					<StewardLogin
						variant="inline"
						showEmail
						showGoogle
						showDiscord
						showPasskey
						onSuccess={handleSuccess}
						onError={(err) => console.error("[steward-login]", err)}
					/>
				</div>

				{/* Divider + Wallet connect option */}
				<div className="px-6 pb-6 pt-0">
					<div className="flex items-center gap-3 my-4">
						<div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
						<span className="text-xs text-[#71717a]">or connect a wallet</span>
						<div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
					</div>

					<ConnectButton.Custom>
						{({ openConnectModal }) => (
							<button
								type="button"
								className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.1)] text-[#e4e4e7] text-[0.9375rem] font-medium hover:bg-[rgba(255,255,255,0.1)] transition-colors cursor-pointer"
								onClick={() => {
									onOpenChange(false);
									// Small delay so the dialog closes before RainbowKit modal opens
									setTimeout(() => openConnectModal(), 150);
								}}
							>
								<Wallet className="size-[18px] opacity-80" />
								<span>Connect Wallet</span>
							</button>
						)}
					</ConnectButton.Custom>
				</div>
			</DialogContent>
		</Dialog>
	);
}
