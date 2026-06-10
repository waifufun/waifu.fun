"use client";

import { useTranslation } from "@/contexts/locale-context";
import { EASE_OUT_EXPO } from "@/lib/motion";
import { sanitizeRedirectPath } from "@/lib/url-safety";
import { motion, useReducedMotion } from "framer-motion";
import { Fingerprint, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo } from "react";

/**
 * Provider picker for the W9.5 Steward OAuth bridge.
 *
 * Each button does a top-level navigation to /auth/oauth/start on the API
 * (cross-origin: NEXT_PUBLIC_API_URL). The backend writes the state cookie
 * and 302s onward to Steward. We carry the original `return_to` query
 * forward so a deep-linked sign-in lands the user back where they started.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

type ProviderId = "google" | "github" | "discord" | "twitter" | "email" | "passkey";

type Provider = {
	id: ProviderId;
	labelKey: string;
	icon: React.ReactNode;
};

const PROVIDERS: Provider[] = [
	{ id: "google", labelKey: "auth.oauthPanel.continueGoogle", icon: <GoogleMark /> },
	{ id: "github", labelKey: "auth.oauthPanel.continueGithub", icon: <GithubMark /> },
	{ id: "discord", labelKey: "auth.oauthPanel.continueDiscord", icon: <DiscordMark /> },
	{ id: "twitter", labelKey: "auth.oauthPanel.continueTwitter", icon: <XMark /> },
	{
		id: "email",
		labelKey: "auth.oauthPanel.continueEmail",
		icon: <Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
	},
	{
		id: "passkey",
		labelKey: "auth.oauthPanel.continuePasskey",
		icon: <Fingerprint className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />,
	},
];

function ConnectInner() {
	const { t } = useTranslation();
	const params = useSearchParams();
	const reduceMotion = useReducedMotion();

	// The return_to is forwarded to the backend, which validates same-origin
	// and falls back to /patron on anything that smells like an open redirect.
	const returnTo = useMemo(() => {
		return sanitizeRedirectPath(params?.get("return_to") ?? null);
	}, [params]);

	const startUrlFor = useCallback(
		(provider: ProviderId) => {
			const u = new URL(`${API_URL}/auth/oauth/start`);
			u.searchParams.set("provider", provider);
			u.searchParams.set("return_to", returnTo);
			return u.toString();
		},
		[returnTo],
	);

	const onClick = useCallback(
		(provider: ProviderId) => () => {
			if (typeof window === "undefined") return;
			window.location.href = startUrlFor(provider);
		},
		[startUrlFor],
	);

	const transition = reduceMotion ? { duration: 0 } : { duration: 0.6, ease: EASE_OUT_EXPO };

	return (
		<motion.div
			initial={reduceMotion ? false : { opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={transition}
			className="w-full max-w-md space-y-8"
		>
			<header className="space-y-3">
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
					{t("auth.oauthPanel.eyebrow")}
				</p>
				<h1 className="text-3xl font-medium text-[#e4e4e7] tracking-tight leading-tight">
					{t("auth.oauthPanel.title")}
				</h1>
				<p className="text-sm text-[#a1a1aa] leading-relaxed">{t("auth.oauthPanel.subtitle")}</p>
			</header>

			<ul className="flex flex-col gap-2.5">
				{PROVIDERS.map((p, i) => {
					const label = t(p.labelKey);
					return (
						<motion.li
							key={p.id}
							initial={reduceMotion ? false : { opacity: 0, y: 6 }}
							animate={{ opacity: 1, y: 0 }}
							transition={
								reduceMotion ? { duration: 0 } : { duration: 0.45, ease: EASE_OUT_EXPO, delay: 0.05 + i * 0.04 }
							}
						>
							<a
								href={startUrlFor(p.id)}
								onClick={(e) => {
									// Force window.location.href so the cookie domain matches the
									// redirect chain. (Next.js Link would do client-side routing
									// for relative URLs; this is cross-origin anyway.)
									e.preventDefault();
									onClick(p.id)();
								}}
								aria-label={label}
								className="group flex items-center gap-3 rounded-sm border border-white/10 bg-[#0b0b0d] px-4 py-3 text-left transition-all duration-200 hover:border-white/25 hover:bg-[#0e0e10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/40 active:translate-y-[1px]"
							>
								<span className="flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 bg-black/40 text-[#e4e4e7] transition-colors group-hover:border-white/20">
									{p.icon}
								</span>
								<span className="text-sm font-medium text-[#e4e4e7]">{label}</span>
							</a>
						</motion.li>
					);
				})}
			</ul>

			<footer className="space-y-2 pt-2">
				<div className="h-px bg-white/5" aria-hidden="true" />
				<p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[#71717a]">
					{t("auth.oauthPanel.poweredBy")}
				</p>
				<p className="text-[11px] text-[#71717a] leading-relaxed">
					{t("auth.oauthPanel.redirectNotePrefix")} <span className="font-mono text-[#a1a1aa]">eliza.steward.fi</span>
					{t("auth.oauthPanel.redirectNoteSuffix")}
				</p>
			</footer>
		</motion.div>
	);
}

export default function OAuthConnectPanel() {
	return (
		<Suspense fallback={<OAuthFallback />}>
			<ConnectInner />
		</Suspense>
	);
}

function OAuthFallback() {
	const { t } = useTranslation();
	return (
		<div className="min-h-[60vh] flex items-center justify-center text-[#71717a] text-sm">
			{t("auth.oauthPanel.loading")}
		</div>
	);
}

// ─── Minimal monochrome provider marks (SVG, no third-party deps) ────

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
