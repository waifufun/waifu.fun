"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { usePatronAuth } from "@/contexts/auth-context";
import { useTranslation } from "@/contexts/locale-context";

/**
 * ClaimHeader
 *
 * Top chrome for the claim page.
 *   - Left: back-link to waifu.fun
 *   - Right: "CLAIM" eyebrow on its own, plus (if signed in) a small
 *     X-tinted pill showing the connected @handle. This is the fastest
 *     visual confirmation that the OAuth round-trip succeeded without
 *     requiring the user to scroll or guess.
 *
 * The pill is read-only on purpose: the claim page has its own flow
 * for managing claim attribution; the actual X connect/disconnect
 * controls live on the global header elsewhere.
 */
export default function ClaimHeader() {
	const { patronUser, isLoading } = usePatronAuth();
	const { t } = useTranslation();

	return (
		<div className="relative z-10 mb-8 flex items-center justify-between gap-3">
			<Link
				href="/"
				className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white/70 transition-colors"
			>
				<ArrowLeft className="w-3 h-3" />
				{t("claim.header.back")}
			</Link>

			<div className="flex items-center gap-3">
				{!isLoading && patronUser ? <ConnectedXPill user={patronUser} /> : null}
				<div className="text-[10px] font-mono uppercase tracking-[0.24em] text-white/30">
					{t("claim.header.eyebrow")}
				</div>
			</div>
		</div>
	);
}

function ConnectedXPill({
	user,
}: {
	user: {
		xHandle: string;
		xAvatarUrl?: string | null;
		xDisplayName?: string | null;
	};
}) {
	const { t } = useTranslation();
	const avatarFallback = `https://unavatar.io/twitter/${user.xHandle}`;
	const avatarSrc = user.xAvatarUrl ?? avatarFallback;

	return (
		<a
			href={`https://x.com/${user.xHandle}`}
			target="_blank"
			rel="noopener noreferrer"
			className="group inline-flex h-8 items-center gap-2 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/[0.08] px-2.5 pr-3.5 text-xs font-mono text-white/80 transition-colors hover:border-[#1d9bf0]/45 hover:bg-[#1d9bf0]/[0.14]"
			aria-label={t("claim.header.signedInAria", { handle: user.xHandle })}
		>
			<span className="relative flex size-5 shrink-0 overflow-hidden rounded-full ring-1 ring-white/10">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={avatarSrc}
					alt=""
					className="aspect-square h-full w-full object-cover"
					onError={(e) => {
						(e.currentTarget as HTMLImageElement).src = avatarFallback;
					}}
				/>
			</span>
			<span className="flex items-center gap-1.5">
				<span className="h-1.5 w-1.5 rounded-full bg-[#00ff87] shadow-[0_0_6px_#00ff87]" />
				<span className="tracking-tight">@{user.xHandle}</span>
			</span>
		</a>
	);
}
