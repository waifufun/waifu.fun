"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "framer-motion";
import { ArrowUpRight, ChevronDown, Mail, ShieldCheck, UserPlus, X } from "lucide-react";
import { EASE_OUT_EXPO } from "@/lib/motion";

// W9.5: route the modal CTAs through the new Steward OAuth bridge instead
// of the legacy popup-to-eliza.steward.dev flow. The /auth/connect page
// hosts the provider picker (Google / GitHub / Discord / Twitter / Email /
// Passkey) and forwards return_to to /auth/oauth/start.
function buildConnectHref(returnTo: string): string {
	const u = new URLSearchParams({ return_to: returnTo });
	return `/auth/connect?${u.toString()}`;
}

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

type Path = "signin" | "signup";

function PathCard({
	icon,
	label,
	title,
	body,
	cta,
	href,
	onClick,
}: {
	icon: React.ReactNode;
	label: string;
	title: string;
	body: string;
	cta: string;
	href: string;
	onClick: () => void;
}) {
	return (
		<motion.a
			href={href}
			onClick={(e) => {
				onClick();
				// Default link nav handles the rest. We don't preventDefault so
				// middle-click / cmd-click continue to work as expected.
				void e;
			}}
			whileHover={{ y: -2 }}
			transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
			className="group relative flex flex-col items-start gap-4 rounded-sm border border-white/10 bg-[#0b0b0d] p-5 text-left transition-colors duration-300 hover:border-[#00ff87]/40 hover:bg-[#0d100e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/40"
		>
			<div className="flex h-9 w-9 items-center justify-center rounded-sm border border-white/10 bg-black/40 text-[#00ff87] transition-colors group-hover:border-[#00ff87]/30">
				{icon}
			</div>
			<div className="flex flex-col gap-1">
				<span className="text-[10px] font-mono uppercase tracking-[0.22em] text-[#00ff87]/80">{label}</span>
				<span className="text-base font-medium text-white leading-tight">{title}</span>
				<span className="text-sm text-neutral-400 leading-relaxed">{body}</span>
			</div>
			<span className="mt-auto inline-flex items-center gap-1.5 text-xs font-medium text-white">
				<span className="border-b border-transparent group-hover:border-[#00ff87]/60 transition-colors duration-300">
					{cta}
				</span>
				<ArrowUpRight
					className="h-3.5 w-3.5 text-[#00ff87] transition-transform duration-300 group-hover:translate-x-[1px] group-hover:-translate-y-[1px]"
					strokeWidth={1.75}
					aria-hidden="true"
				/>
			</span>
		</motion.a>
	);
}

function InfoBullet({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
	return (
		<li className="flex items-start gap-3 text-sm text-neutral-300 leading-relaxed">
			<span className="mt-[2px] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-white/10 bg-black/30 text-[#00ff87]">
				{icon}
			</span>
			<span>{children}</span>
		</li>
	);
}

export default function StewardConnectModal({ open, onOpenChange }: Props) {
	const [infoOpen, setInfoOpen] = useState(false);

	// Reset state every time the modal opens.
	useEffect(() => {
		if (open) {
			setInfoOpen(false);
		}
	}, [open]);

	// W9.5: when the modal is mounted on a page that already has a meaningful
	// pathname (e.g. /create), preserve it as the return_to so the user lands
	// back where they came from after sign-in.
	const returnTo =
		typeof window !== "undefined" && window.location?.pathname?.startsWith("/")
			? `${window.location.pathname}${window.location.search ?? ""}`
			: "/patron";
	const connectHref = buildConnectHref(returnTo);

	const markPath = (_mode: Path) => () => {
		// Closing on click feels nicer than letting Radix unmount mid-navigation.
		onOpenChange(false);
	};

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-300" />
				<Dialog.Content
					aria-describedby="steward-connect-description"
					className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-sm border border-white/10 bg-[#08080a] p-6 sm:p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200"
				>
					<div className="flex items-start justify-between gap-4 mb-6">
						<div className="flex flex-col gap-2">
							<span className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
								waifu.fun / steward
							</span>
							<Dialog.Title className="text-2xl md:text-3xl font-medium text-white tracking-tight leading-tight">
								connect steward
							</Dialog.Title>
							<Dialog.Description
								id="steward-connect-description"
								className="text-sm text-neutral-400 leading-relaxed max-w-[60ch]"
							>
								one login owns all your agents.
							</Dialog.Description>
						</div>
						<Dialog.Close
							className="-mr-2 -mt-2 inline-flex h-8 w-8 items-center justify-center rounded-sm text-neutral-400 hover:text-white hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
							aria-label="Close dialog"
						>
							<X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
						</Dialog.Close>
					</div>

					<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<PathCard
							icon={<Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
							label="existing"
							title="i have a steward account"
							body="sign in with the email you used to create it."
							cta="sign in with steward"
							href={connectHref}
							onClick={markPath("signin")}
						/>
						<PathCard
							icon={<UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
							label="new here"
							title="i'm new to steward"
							body="create one first. we'll bring you back when you're done."
							cta="create account"
							href={connectHref}
							onClick={markPath("signup")}
						/>
					</div>

					<div className="mt-6 rounded-sm border border-white/10 bg-[#0b0b0d]">
						<button
							type="button"
							onClick={() => setInfoOpen((v) => !v)}
							className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-sm"
							aria-expanded={infoOpen}
							aria-controls="steward-info-panel"
						>
							<span className="flex items-center gap-2.5">
								<ShieldCheck className="h-4 w-4 text-[#00ff87]" strokeWidth={1.75} aria-hidden="true" />
								<span className="text-sm font-medium text-white">what's steward?</span>
							</span>
							<ChevronDown
								className={`h-4 w-4 text-neutral-500 transition-transform duration-300 ${infoOpen ? "rotate-180" : "rotate-0"}`}
								style={{ transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)" }}
								strokeWidth={1.75}
								aria-hidden="true"
							/>
						</button>
						<div
							id="steward-info-panel"
							className="grid transition-[grid-template-rows] duration-300"
							style={{
								gridTemplateRows: infoOpen ? "1fr" : "0fr",
								transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
							}}
						>
							<div className="overflow-hidden">
								<ul className="flex flex-col gap-3 px-4 pb-4 pt-1">
									<InfoBullet
										icon={
											<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
												<path d="M6 1.5v9M1.5 6h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
											</svg>
										}
									>
										steward is the action layer for ai agents. it signs txns, manages keys, handles cross-chain calls.
									</InfoBullet>
									<InfoBullet
										icon={
											<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
												<path
													d="M2.5 6.5l2.5 2.5 4.5-5"
													stroke="currentColor"
													strokeWidth="1.5"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
										}
									>
										email recovery. you won't lose access to your agents.
									</InfoBullet>
									<InfoBullet
										icon={
											<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
												<path d="M3 9V4l3-2.5L9 4v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
												<path d="M3 9h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
											</svg>
										}
									>
										multi-agent. one steward, all your agents.
									</InfoBullet>
								</ul>
							</div>
						</div>
					</div>

					<p className="mt-5 text-[11px] text-neutral-500 leading-relaxed">
						you'll be redirected to <span className="font-mono text-neutral-400">eliza.steward.fi</span>. we never see
						your password.
					</p>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
