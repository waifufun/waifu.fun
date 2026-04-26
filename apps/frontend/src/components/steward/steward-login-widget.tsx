"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { PasskeyError, loginOrRegisterPasskey } from "@/lib/passkey";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAuth } from "@stwd/react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2, Fingerprint, Loader2, Mail, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useMemo, useState } from "react";

interface StewardLoginWidgetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Where to send the user once OAuth completes. Defaults to current pathname. */
	returnTo?: string;
}

/**
 * Modal-wrapped Steward login for waifu.fun.
 *
 * Privy-style chrome (icon + "Welcome to waifu.fun" + provider grid +
 * wallet-connect fallback). The provider section bypasses @stwd/react's
 * <StewardLogin> component (which wasn't rendering OAuth providers
 * reliably for our tenant) and instead routes every button through the
 * verified W9.5 backend bridge: GET ${API_URL}/auth/oauth/start?provider=X.
 *
 * Each click is a top-level navigation: backend writes the state cookie,
 * 302s to Steward, Steward returns to /auth/oauth/callback, and that page
 * sets wf_session and redirects to return_to.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

// NOTE: discord temporarily disabled — Steward's Discord OAuth app needs
// `https://eliza.steward.fi/auth/oauth/discord/callback` registered as an
// allowed redirect URI in the Discord Developer Portal. Re-enable once
// Shaw / steward team adds it.
type ProviderId = "google" | "github" | "twitter";

type EmailPhase = "idle" | "submitting" | "sent" | "error";
type PasskeyPhase = "idle" | "prompting" | "error";

type ProviderTile = {
	id: ProviderId;
	label: string; // accessible label (sentence-case-ish, lowercased per Wave 8a)
	short: string; // tiny caption under the icon
	icon: React.ReactNode;
};

const PROVIDERS: ProviderTile[] = [
	{ id: "google", label: "continue with google", short: "google", icon: <GoogleMark /> },
	{ id: "github", label: "continue with github", short: "github", icon: <GithubMark /> },
	{ id: "twitter", label: "continue with twitter / x", short: "x", icon: <XMark /> },
];

export function StewardLoginWidget({ open, onOpenChange, returnTo }: StewardLoginWidgetProps) {
	const { isAuthenticated } = useAuth();
	const params = useSearchParams();
	const router = useRouter();
	const reduceMotion = useReducedMotion();
	const [email, setEmail] = useState("");
	const [emailPhase, setEmailPhase] = useState<EmailPhase>("idle");
	const [emailError, setEmailError] = useState<string | null>(null);
	const [passkeyPhase, setPasskeyPhase] = useState<PasskeyPhase>("idle");
	const [passkeyError, setPasskeyError] = useState<string | null>(null);

	// Resolve return_to: explicit prop > URL param > current pathname > /patron
	const resolvedReturnTo = useMemo(() => {
		if (returnTo?.startsWith("/")) return returnTo;
		const fromQuery = params?.get("return_to");
		if (fromQuery?.startsWith("/") && fromQuery.length <= 200) return fromQuery;
		if (typeof window !== "undefined" && window.location?.pathname?.startsWith("/")) {
			const path = window.location.pathname;
			// Don't loop a sign-in landing page back into itself.
			if (path === "/" || path === "/auth/connect") return "/patron";
			return `${path}${window.location.search ?? ""}`;
		}
		return "/patron";
	}, [returnTo, params]);

	const startUrlFor = useCallback(
		(provider: ProviderId, extra?: Record<string, string>) => {
			const u = new URL(`${API_URL}/auth/oauth/start`);
			u.searchParams.set("provider", provider);
			u.searchParams.set("return_to", resolvedReturnTo);
			if (extra) {
				for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v);
			}
			return u.toString();
		},
		[resolvedReturnTo],
	);

	const handleProvider = useCallback(
		(provider: ProviderId) => () => {
			if (typeof window === "undefined") return;
			window.location.href = startUrlFor(provider);
		},
		[startUrlFor],
	);

	const handleEmailSubmit = useCallback(
		async (e: FormEvent<HTMLFormElement>) => {
			e.preventDefault();
			const trimmed = email.trim().toLowerCase();
			if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
				setEmailPhase("error");
				setEmailError("please enter a valid email address");
				return;
			}
			setEmailPhase("submitting");
			setEmailError(null);
			try {
				const res = await fetch(`${API_URL}/auth/email/start`, {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ email: trimmed, return_to: resolvedReturnTo }),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
					if (res.status === 429) {
						throw new Error("too many requests, try again in a minute");
					}
					throw new Error(body?.message ?? body?.error ?? `http ${res.status}`);
				}
				setEmailPhase("sent");
			} catch (err) {
				setEmailPhase("error");
				setEmailError(err instanceof Error ? err.message : "could not send magic link");
			}
		},
		[email, resolvedReturnTo],
	);

	const handlePasskey = useCallback(async () => {
		const trimmed = email.trim().toLowerCase();
		if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
			setPasskeyPhase("error");
			setPasskeyError("enter your email above first, then tap passkey");
			return;
		}
		setPasskeyPhase("prompting");
		setPasskeyError(null);
		try {
			const nextPath = await loginOrRegisterPasskey(trimmed, resolvedReturnTo);
			onOpenChange(false);
			router.replace(nextPath);
		} catch (err) {
			if (err instanceof PasskeyError && err.code === "USER_CANCELLED") {
				setPasskeyPhase("idle");
				setPasskeyError(null);
				return;
			}
			setPasskeyPhase("error");
			setPasskeyError(err instanceof Error ? err.message : "passkey failed");
		}
	}, [email, resolvedReturnTo, onOpenChange, router]);

	if (isAuthenticated) {
		return null;
	}

	const transition = reduceMotion ? { duration: 0 } : { duration: 0.5, ease: EASE_OUT_EXPO };

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[420px] border border-[rgba(255,255,255,0.08)] bg-[#08080a] p-0 gap-0 rounded-lg overflow-hidden">
				<DialogHeader className="sr-only">
					<DialogTitle>Sign in to waifu.fun</DialogTitle>
					<DialogDescription>Sign in with email, a social account, or connect a wallet.</DialogDescription>
				</DialogHeader>

				{/* Branding header */}
				<div className="flex flex-col items-center pt-8 pb-2 px-6">
					<img src="/icon-512.png" alt="waifu.fun" className="size-12 mb-3 rounded-sm" />
					<h2 className="text-[1.125rem] font-semibold text-white tracking-tight">Welcome to waifu.fun</h2>
					<p className="text-sm text-[#71717a] mt-1">sign in to create and manage your agents.</p>
				</div>

				<motion.div
					initial={reduceMotion ? false : { opacity: 0, y: 6 }}
					animate={{ opacity: 1, y: 0 }}
					transition={transition}
					className="px-6 pt-5"
				>
					{/* Email magic-link */}
					{emailPhase === "sent" ? (
						<output
							className="flex items-start gap-3 rounded-sm border border-[#00ff87]/30 bg-[#00ff87]/5 px-4 py-3"
							aria-live="polite"
						>
							<CheckCircle2 className="size-4 mt-0.5 text-[#00ff87] shrink-0" strokeWidth={1.75} aria-hidden="true" />
							<div className="flex-1 min-w-0">
								<p className="text-sm text-[#e4e4e7]">check your inbox</p>
								<p className="text-xs text-[#a1a1aa] mt-0.5 break-all">
									we sent a magic link to {email.trim().toLowerCase()}
								</p>
								<button
									type="button"
									onClick={() => {
										setEmailPhase("idle");
										setEmail("");
									}}
									className="mt-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[#71717a] hover:text-[#e4e4e7] transition-colors"
								>
									use a different email
								</button>
							</div>
						</output>
					) : (
						<form onSubmit={handleEmailSubmit} className="flex items-stretch gap-2">
							<div className="relative flex-1">
								<Mail
									className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#71717a]"
									strokeWidth={1.75}
									aria-hidden="true"
								/>
								<input
									type="email"
									inputMode="email"
									autoComplete="email"
									name="email"
									placeholder="your email"
									value={email}
									onChange={(e) => {
										setEmail(e.target.value);
										if (emailPhase === "error") {
											setEmailPhase("idle");
											setEmailError(null);
										}
									}}
									disabled={emailPhase === "submitting"}
									aria-label="email address"
									aria-invalid={emailPhase === "error"}
									className="w-full rounded-sm border border-white/10 bg-[#0b0b0d] pl-9 pr-3 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#52525b] focus-visible:outline-none focus-visible:border-white/25 focus-visible:ring-2 focus-visible:ring-[#00ff87]/30 disabled:opacity-50"
								/>
							</div>
							<button
								type="submit"
								disabled={emailPhase === "submitting" || email.trim().length === 0}
								aria-label="continue with email"
								className="inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#00ff87] px-3.5 text-[#08080a] text-sm font-medium hover:bg-[#00ff87]/90 disabled:opacity-40 disabled:hover:bg-[#00ff87] transition-colors"
							>
								{emailPhase === "submitting" ? (
									<Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
								) : (
									<>
										<span>continue</span>
										<ArrowRight className="size-3.5" strokeWidth={2} aria-hidden="true" />
									</>
								)}
							</button>
						</form>
					)}
					{emailPhase === "error" && emailError ? (
						<p className="mt-2 text-xs text-[#f87171] font-mono" role="alert">
							{emailError}
						</p>
					) : null}

					{/* Passkey — uses the email above as the WebAuthn user handle */}
					{emailPhase !== "sent" ? (
						<button
							type="button"
							onClick={handlePasskey}
							disabled={passkeyPhase === "prompting"}
							aria-label="continue with passkey"
							className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-sm border border-white/10 bg-[#0b0b0d] py-2.5 px-4 text-sm font-medium text-[#e4e4e7] transition-all duration-200 hover:border-white/25 hover:bg-[#0e0e10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/40 disabled:opacity-50"
						>
							{passkeyPhase === "prompting" ? (
								<>
									<Loader2 className="size-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
									<span>waiting for passkey</span>
								</>
							) : (
								<>
									<Fingerprint className="size-4" strokeWidth={1.75} aria-hidden="true" />
									<span>continue with passkey</span>
								</>
							)}
						</button>
					) : null}
					{passkeyPhase === "error" && passkeyError ? (
						<p className="mt-2 text-xs text-[#f87171] font-mono" role="alert">
							{passkeyError}
						</p>
					) : null}

					{/* "or" divider */}
					<div className="flex items-center gap-3 my-5" aria-hidden="true">
						<div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
						<span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#71717a]">or</span>
						<div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
					</div>

					{/* Provider grid (icon-only, Privy style) */}
					<ul className="grid grid-cols-3 gap-2">
						{PROVIDERS.map((p, i) => (
							<motion.li
								key={p.id}
								initial={reduceMotion ? false : { opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={
									reduceMotion ? { duration: 0 } : { duration: 0.4, ease: EASE_OUT_EXPO, delay: 0.05 + i * 0.03 }
								}
							>
								<button
									type="button"
									onClick={handleProvider(p.id)}
									aria-label={p.label}
									title={p.label}
									className="group flex w-full flex-col items-center justify-center gap-1.5 rounded-sm border border-white/10 bg-[#0b0b0d] py-3 text-[#e4e4e7] transition-all duration-200 hover:border-white/25 hover:bg-[#0e0e10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/40 active:translate-y-[1px]"
								>
									<span
										className="flex h-6 w-6 items-center justify-center text-[#e4e4e7] transition-colors group-hover:text-white"
										aria-hidden="true"
									>
										{p.icon}
									</span>
									<span className="text-[9px] font-mono uppercase tracking-[0.16em] text-[#71717a] group-hover:text-[#a1a1aa]">
										{p.short}
									</span>
								</button>
							</motion.li>
						))}
					</ul>
				</motion.div>

				{/* Wallet connect fallback */}
				<div className="px-6 pb-6 pt-0">
					<div className="flex items-center gap-3 my-5" aria-hidden="true">
						<div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
						<span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#71717a]">
							or connect a wallet
						</span>
						<div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
					</div>

					<ConnectButton.Custom>
						{({ openConnectModal }) => (
							<button
								type="button"
								className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-sm bg-[rgba(255,255,255,0.04)] border border-white/10 text-[#e4e4e7] text-sm font-medium hover:bg-[rgba(255,255,255,0.08)] hover:border-white/20 transition-colors cursor-pointer"
								onClick={() => {
									onOpenChange(false);
									// Small delay so the dialog closes before RainbowKit modal opens
									setTimeout(() => openConnectModal(), 150);
								}}
							>
								<Wallet className="size-[16px] opacity-80" />
								<span>connect wallet</span>
							</button>
						)}
					</ConnectButton.Custom>

					<p className="mt-5 text-center text-[10px] font-mono uppercase tracking-[0.22em] text-[#52525b]">
						powered by steward
					</p>
				</div>
			</DialogContent>
		</Dialog>
	);
}

// ─── Minimal monochrome provider marks ────────────────────────────

function GoogleMark() {
	return (
		<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true" focusable="false">
			<path d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.7 4.1-5.35 4.1-3.22 0-5.85-2.66-5.85-5.95s2.63-5.95 5.85-5.95c1.83 0 3.05.78 3.75 1.45l2.55-2.45C16.7 4.1 14.55 3 12 3 6.96 3 2.85 7.1 2.85 12.15S6.96 21.3 12 21.3c6.93 0 9.15-4.85 9.15-7.35 0-.5-.05-.85-.13-1.85h-7.67Z" />
		</svg>
	);
}

function GithubMark() {
	return (
		<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true" focusable="false">
			<path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-1.94c-3.2.69-3.87-1.37-3.87-1.37-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.69.08-.69 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.25 3.34.96.1-.74.4-1.25.72-1.54-2.55-.29-5.24-1.27-5.24-5.65 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.17.91-.25 1.89-.38 2.86-.38.97 0 1.95.13 2.86.38 2.18-1.48 3.14-1.17 3.14-1.17.62 1.58.23 2.75.11 3.04.74.8 1.18 1.82 1.18 3.07 0 4.39-2.69 5.36-5.25 5.64.41.36.78 1.06.78 2.13v3.16c0 .31.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
		</svg>
	);
}

function DiscordMark() {
	return (
		<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true" focusable="false">
			<path d="M20.32 4.37A19.63 19.63 0 0 0 16 3l-.2.36a14.8 14.8 0 0 0-1.66.36 18.2 18.2 0 0 0-4.28 0 14.7 14.7 0 0 0-1.65-.36L8 3a19.6 19.6 0 0 0-4.32 1.37C1.78 7.4 1.05 10.36 1.4 13.27a19.6 19.6 0 0 0 5.95 3.04l.96-1.34a12.9 12.9 0 0 1-2.06-1c.18-.13.34-.27.5-.4a13.7 13.7 0 0 0 11.5 0c.16.13.32.27.5.4-.65.4-1.34.73-2.06 1l.96 1.34a19.6 19.6 0 0 0 5.95-3.04c.42-3.46-.5-6.4-2.28-8.9ZM8.6 11.6c-.96 0-1.74-.88-1.74-1.96 0-1.07.77-1.95 1.74-1.95.97 0 1.75.88 1.74 1.95 0 1.08-.77 1.96-1.74 1.96Zm6.8 0c-.96 0-1.74-.88-1.74-1.96 0-1.07.77-1.95 1.74-1.95.97 0 1.75.88 1.74 1.95 0 1.08-.77 1.96-1.74 1.96Z" />
		</svg>
	);
}

function XMark() {
	return (
		<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true" focusable="false">
			<path d="M18.244 2H21l-6.52 7.45L22 22h-6.7l-5.25-6.86L4.05 22H1.3l6.97-7.96L2 2h6.86l4.74 6.27L18.244 2Zm-1.17 18h1.86L7.02 4H5.07l11.99 16Z" />
		</svg>
	);
}
