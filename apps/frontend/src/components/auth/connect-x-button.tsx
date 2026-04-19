"use client";

import { LogOut } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePatronAuth } from "@/contexts/auth-context";

/**
 * ConnectXButton
 *
 * - Loading → disabled skeleton button
 * - Not logged in → "connect x" button → initiates OAuth flow
 * - Logged in → avatar + @handle pill with a logout dropdown
 */
export function ConnectXButton() {
	const { patronUser, isLoading, loginWithX, logout } = usePatronAuth();
	const [dropdownOpen, setDropdownOpen] = useState(false);

	if (isLoading) {
		return (
			<Button
				className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#1d9bf0]/20 text-[#1d9bf0] border border-[#1d9bf0]/30 shadow-sm opacity-50 pointer-events-none"
				disabled
				aria-label="Loading X auth"
			>
				<XLogo className="size-4 mr-1.5 opacity-70" />
				connect x
			</Button>
		);
	}

	if (!patronUser) {
		return (
			<Button
				className="h-[38px] min-h-[38px] max-h-[38px] px-4 py-2 font-medium rounded-sm bg-[#1d9bf0]/10 text-[#1d9bf0] hover:bg-[#1d9bf0]/20 border border-[#1d9bf0]/30 shadow-sm text-sm"
				onClick={loginWithX}
				aria-label="Sign in with X"
			>
				<XLogo className="size-4 mr-1.5" />
				connect x
			</Button>
		);
	}

	// Logged in state
	const avatarFallback = `https://unavatar.io/twitter/${patronUser.xHandle}`;
	const avatarSrc = patronUser.xAvatarUrl ?? avatarFallback;

	return (
		<Popover open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<PopoverTrigger asChild>
				<Button
					className="h-[38px] min-h-[38px] max-h-[38px] px-3 py-2 font-medium rounded-sm bg-[#1d9bf0]/10 text-[#1d9bf0] hover:bg-[#1d9bf0]/20 border border-[#1d9bf0]/30 shadow-sm text-sm font-mono"
					aria-label={`Signed in as @${patronUser.xHandle}`}
					type="button"
				>
					<span className="relative flex size-5 shrink-0 rounded-full overflow-hidden mr-2">
						{/* eslint-disable-next-line @next/next/no-img-element */}
						<img
							src={avatarSrc}
							alt={patronUser.xHandle}
							className="aspect-square h-full w-full object-cover"
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).src = avatarFallback;
							}}
						/>
					</span>
					@{patronUser.xHandle}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="w-48 rounded-lg border border-[rgba(255,255,255,0.1)] bg-[#111114] p-1 shadow-lg"
			>
				{/* User info header */}
				<div className="px-3 py-2 border-b border-[rgba(255,255,255,0.06)] mb-1">
					{patronUser.xDisplayName && (
						<p className="text-xs font-medium text-[#e4e4e7] truncate">{patronUser.xDisplayName}</p>
					)}
					<p className="text-xs text-[#71717a] truncate">@{patronUser.xHandle}</p>
				</div>
				<button
					type="button"
					onClick={async () => {
						setDropdownOpen(false);
						await logout();
					}}
					className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-red-400 hover:bg-[rgba(255,255,255,0.06)] transition-colors"
				>
					<LogOut className="size-4" />
					Sign out
				</button>
			</PopoverContent>
		</Popover>
	);
}

/** Minimal X (Twitter) logo SVG. */
function XLogo({ className }: { className?: string }) {
	return (
		<svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.91-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}
