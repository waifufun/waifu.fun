"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, ChevronDown, Copy, Mail, ShieldCheck, UserPlus, X } from "lucide-react";
import { buildStewardAuthUrl, defaultStewardRedirectUri } from "@/lib/api/steward";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

type Path = "signin" | "signup";

const POPUP_WIDTH = 600;
const POPUP_HEIGHT = 700;

function openCenteredPopup(url: string, name: string) {
	if (typeof window === "undefined") return null;
	const dualLeft = window.screenLeft ?? window.screenX ?? 0;
	const dualTop = window.screenTop ?? window.screenY ?? 0;
	const w = window.innerWidth ?? document.documentElement.clientWidth ?? 1200;
	const h = window.innerHeight ?? document.documentElement.clientHeight ?? 800;
	const left = dualLeft + (w - POPUP_WIDTH) / 2;
	const top = dualTop + (h - POPUP_HEIGHT) / 2;
	const features = `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`;
	return window.open(url, name, features);
}

function PathCard({
	icon,
	label,
	title,
	body,
	cta,
	onClick,
	loading,
}: {
	icon: React.ReactNode;
	label: string;
	title: string;
	body: string;
	cta: string;
	onClick: () => void;
	loading: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={loading}
			className="group relative flex flex-col items-start gap-4 rounded-sm border border-white/10 bg-[#0b0b0d] p-5 text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[#00ff87]/40 hover:bg-[#0d100e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/40 disabled:opacity-60 disabled:cursor-progress"
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
		</button>
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
	const [activePath, setActivePath] = useState<Path | null>(null);
	const [popupBlocked, setPopupBlocked] = useState(false);
	const [manualUrl, setManualUrl] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [infoOpen, setInfoOpen] = useState(false);
	const popupRef = useRef<Window | null>(null);
	const pollRef = useRef<number | null>(null);

	// Reset state every time the modal opens.
	useEffect(() => {
		if (open) {
			setActivePath(null);
			setPopupBlocked(false);
			setManualUrl(null);
			setCopied(false);
		}
	}, [open]);

	// Listen for steward.connected from the popup → close modal.
	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (!event?.data || typeof event.data !== "object") return;
			const data = event.data as { type?: string };
			if (data.type === "steward.connected") {
				onOpenChange(false);
			}
		}
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [onOpenChange]);

	// Watch for popup close (user closed it manually).
	useEffect(() => {
		if (!activePath) return;
		const id = window.setInterval(() => {
			if (popupRef.current?.closed) {
				window.clearInterval(id);
				pollRef.current = null;
				setActivePath(null);
			}
		}, 500);
		pollRef.current = id;
		return () => {
			window.clearInterval(id);
			pollRef.current = null;
		};
	}, [activePath]);

	const handlePath = (mode: Path) => {
		setActivePath(mode);
		setPopupBlocked(false);
		const redirectUri = defaultStewardRedirectUri();
		const url = buildStewardAuthUrl({ mode, redirectUri });
		const popup = openCenteredPopup(url, "steward-connect");
		if (!popup) {
			setPopupBlocked(true);
			setManualUrl(url);
			setActivePath(null);
			return;
		}
		popupRef.current = popup;
	};

	const handleCopy = async () => {
		if (!manualUrl) return;
		try {
			await navigator.clipboard.writeText(manualUrl);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			// clipboard might be blocked in iframes; user can still long-press the link
		}
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
								Connect Steward
							</Dialog.Title>
							<Dialog.Description
								id="steward-connect-description"
								className="text-sm text-neutral-400 leading-relaxed max-w-[60ch]"
							>
								Steward links your agents to your account. One Steward login, all your agents.
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
							label="Existing user"
							title="I have a Steward account"
							body="Sign in with the email you used to create your Steward account."
							cta={activePath === "signin" ? "Waiting for Steward..." : "Sign in with Steward"}
							onClick={() => handlePath("signin")}
							loading={activePath === "signin"}
						/>
						<PathCard
							icon={<UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
							label="New here"
							title="I'm new to Steward"
							body="Create a Steward account first. We'll bring you back here when you're done."
							cta={activePath === "signup" ? "Waiting for Steward..." : "Create account"}
							onClick={() => handlePath("signup")}
							loading={activePath === "signup"}
						/>
					</div>

					{popupBlocked && manualUrl ? (
						<div className="mt-4 rounded-sm border border-stroke bg-[rgba(255,255,255,0.02)] p-4">
							<div className="text-xs font-mono uppercase tracking-[0.2em] text-[#a1a1aa] mb-2">popup blocked</div>
							<p className="text-sm text-[#a1a1aa] leading-relaxed mb-3">
								your browser blocked the steward popup. open the link manually, then come back here when you're done.
							</p>
							<div className="flex flex-col sm:flex-row items-stretch gap-2">
								<a
									href={manualUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-sm border border-stroke-strong bg-[rgba(255,255,255,0.04)] px-3 py-2 text-xs font-medium text-[#e4e4e7] hover:bg-[rgba(255,255,255,0.08)] transition-colors"
								>
									open steward
									<ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
								</a>
								<button
									type="button"
									onClick={handleCopy}
									className="inline-flex items-center justify-center gap-1.5 rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-xs font-medium text-neutral-200 hover:bg-white/5 transition-colors"
								>
									<Copy className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
									{copied ? "copied" : "copy link"}
								</button>
							</div>
						</div>
					) : null}

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
								<span className="text-sm font-medium text-white">What's Steward?</span>
							</span>
							<ChevronDown
								className={`h-4 w-4 text-neutral-500 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${infoOpen ? "rotate-180" : "rotate-0"}`}
								strokeWidth={1.75}
								aria-hidden="true"
							/>
						</button>
						<div
							id="steward-info-panel"
							className="grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
							style={{ gridTemplateRows: infoOpen ? "1fr" : "0fr" }}
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
										Steward is the action layer for AI agents. It signs transactions, manages keys, and handles
										cross-chain calls.
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
										Email recovery means you'll never lose access to your agents.
									</InfoBullet>
									<InfoBullet
										icon={
											<svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden="true">
												<path d="M3 9V4l3-2.5L9 4v5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
												<path d="M3 9h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
											</svg>
										}
									>
										Multi-agent. One Steward account can own dozens of agents.
									</InfoBullet>
								</ul>
							</div>
						</div>
					</div>

					<p className="mt-5 text-[11px] text-neutral-500 leading-relaxed">
						You'll be redirected to <span className="font-mono text-neutral-400">eliza.steward.dev</span>. We never see
						your password.
					</p>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
