"use client";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTranslation } from "@/contexts/locale-context";
import { useWaifuMe } from "@/hooks/use-waifu-me";
import { Copy, LogOut, User2, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Header user menu (cookie-session-aware).
 *
 * Replaces @stwd/react's StewardUserButton, which doesn't see our
 * HttpOnly-cookie session. Reads patron + wallets via useWaifuMe()
 * (calls /v2/patron/me) and renders a Privy-style avatar dropdown.
 *
 * If the user has no email (X-OAuth patrons from the legacy flow),
 * we fall back to their X handle. If wallets are bound we show the
 * primary wallet shortened.
 */

function shortAddr(addr: string | null | undefined): string | null {
	if (!addr) return null;
	if (addr.length < 12) return addr;
	return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function initialFor(label: string | null): string {
	if (!label) return "?";
	const trimmed = label.trim();
	if (!trimmed) return "?";
	const ch = trimmed[0];
	return ch ? ch.toUpperCase() : "?";
}

export function WaifuUserMenu() {
	const { t } = useTranslation();
	const router = useRouter();
	const { me, isAuthenticated, isLoading, refetch } = useWaifuMe();
	const [open, setOpen] = useState(false);
	const [signingOut, setSigningOut] = useState(false);

	if (isLoading || !isAuthenticated) return null;

	const email = me?.patron.email ?? null;
	const primaryWallet =
		me?.primaryAddress ?? me?.wallets.find((w) => w.isPrimary)?.address ?? me?.wallets[0]?.address ?? null;
	const linkedWallet = me?.linkedWallets[0]?.address ?? null;
	const label = email ?? shortAddr(primaryWallet) ?? t("auth.userMenu.patronFallback");

	async function copyAddress(addr: string) {
		await navigator.clipboard?.writeText(addr).catch(() => undefined);
	}

	async function handleSignOut() {
		if (signingOut) return;
		setSigningOut(true);
		try {
			await fetch("/api/auth/logout", {
				method: "POST",
				credentials: "include",
				cache: "no-store",
			});
		} catch {
			// best-effort
		}
		// Force a full reload so middleware re-runs and react-query cache resets.
		if (typeof window !== "undefined") {
			window.location.assign("/");
		} else {
			router.replace("/");
		}
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={t("auth.userMenu.menuAria")}
					className="flex items-center gap-2 h-[38px] px-2.5 rounded-sm border border-white/10 bg-[rgba(255,255,255,0.03)] hover:border-white/25 hover:bg-[rgba(255,255,255,0.06)] transition-colors"
				>
					<span className="flex size-7 items-center justify-center rounded-sm bg-[rgba(0,255,135,0.12)] text-[#00ff87] font-mono text-sm font-medium">
						{initialFor(email ?? primaryWallet ?? "p")}
					</span>
					<span className="hidden sm:inline-flex max-w-[160px] truncate text-sm text-[#e4e4e7]">{label}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				sideOffset={8}
				className="w-[260px] p-0 rounded-sm border border-white/10 bg-[#08080a] shadow-xl"
				onOpenAutoFocus={() => {
					refetch();
				}}
			>
				<div className="px-4 py-3 border-b border-white/[0.06]">
					<p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717a]">
						{t("auth.userMenu.signedInAs")}
					</p>
					<p className="mt-1 text-sm text-[#e4e4e7] break-all">{label}</p>
					{primaryWallet ? (
						<div className="mt-2 flex items-center gap-2 text-[11px] font-mono text-[#a1a1aa]">
							<span>
								{t("auth.userMenu.primaryPrefix")} {shortAddr(primaryWallet)}
							</span>
							<button
								type="button"
								onClick={() => copyAddress(primaryWallet)}
								aria-label={t("auth.userMenu.copyPrimaryAria")}
							>
								<Copy className="size-3 text-[#71717a]" strokeWidth={1.75} />
							</button>
						</div>
					) : null}
					{linkedWallet ? (
						<p className="mt-1 text-[11px] font-mono text-[#71717a]">
							{t("auth.userMenu.linkedPrefix")} {shortAddr(linkedWallet)}
						</p>
					) : null}
					{me?.agentCount ? (
						<p className="mt-1 text-[11px] font-mono text-[#a1a1aa]">
							{me.agentCount} {me.agentCount === 1 ? t("auth.userMenu.agentSingular") : t("auth.userMenu.agentPlural")}
						</p>
					) : null}
				</div>
				<div className="py-1">
					<Link
						href="/patron"
						onClick={() => setOpen(false)}
						className="flex items-center gap-2.5 px-4 py-2 text-sm text-[#e4e4e7] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
					>
						<User2 className="size-4 text-[#a1a1aa]" strokeWidth={1.75} />
						<span>{t("auth.userMenu.yourAgents")}</span>
					</Link>
					<Link
						href="/patron/wallets"
						onClick={() => setOpen(false)}
						className="flex items-center gap-2.5 px-4 py-2 text-sm text-[#e4e4e7] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
					>
						<Wallet className="size-4 text-[#a1a1aa]" strokeWidth={1.75} />
						<span>{t("auth.userMenu.manageWallets")}</span>
						{primaryWallet ? (
							<span className="ml-auto text-[10px] font-mono text-[#71717a]">{shortAddr(primaryWallet)}</span>
						) : null}
					</Link>
				</div>
				<div className="border-t border-white/[0.06] py-1">
					<button
						type="button"
						onClick={handleSignOut}
						disabled={signingOut}
						className="flex w-full items-center gap-2.5 px-4 py-2 text-sm text-[#a1a1aa] hover:text-[#f87171] hover:bg-[rgba(248,113,113,0.06)] transition-colors disabled:opacity-50"
					>
						<LogOut className="size-4" strokeWidth={1.75} />
						<span>{signingOut ? t("auth.userMenu.signingOut") : t("auth.userMenu.signOut")}</span>
					</button>
				</div>
			</PopoverContent>
		</Popover>
	);
}
