"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { PasskeyError, loginWithPasskey, registerPasskey } from "@/lib/passkey";
import { CheckCircle2, Fingerprint, Github, Loader2, Mail } from "lucide-react";
import { type FormEvent, useCallback, useMemo, useState } from "react";

interface ConnectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	returnTo?: string;
}

type ProviderId = "github" | "google" | "twitter" | "discord";
type EmailPhase = "idle" | "submitting" | "sent" | "error";
type PasskeyPhase = "idle" | "prompting" | "registering" | "error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";
const PROVIDERS: Array<{ id: ProviderId; label: string }> = [
	{ id: "github", label: "GitHub" },
	{ id: "google", label: "Google" },
	{ id: "twitter", label: "X" },
	{ id: "discord", label: "Discord" },
];

function validEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function ConnectModal({ open, onOpenChange, returnTo }: ConnectModalProps) {
	const { isAuthenticated } = useWaifuAuth();
	const [email, setEmail] = useState("");
	const [emailPhase, setEmailPhase] = useState<EmailPhase>("idle");
	const [emailError, setEmailError] = useState<string | null>(null);
	const [passkeyPhase, setPasskeyPhase] = useState<PasskeyPhase>("idle");
	const [passkeyError, setPasskeyError] = useState<string | null>(null);

	const resolvedReturnTo = useMemo(() => {
		if (returnTo?.startsWith("/")) return returnTo;
		if (typeof window !== "undefined" && window.location.pathname !== "/") {
			return `${window.location.pathname}${window.location.search ?? ""}`;
		}
		return "/patron";
	}, [returnTo]);

	const assignAfterAuth = useCallback(
		(path = resolvedReturnTo) => {
			onOpenChange(false);
			if (typeof window !== "undefined") window.location.assign(path);
		},
		[onOpenChange, resolvedReturnTo],
	);

	const handleProvider = useCallback(
		(provider: ProviderId) => {
			if (typeof window === "undefined") return;
			if (provider === "twitter") {
				const u = new URL("/auth/twitter/login", window.location.origin);
				u.searchParams.set("return_to", resolvedReturnTo);
				window.location.assign(u.toString());
				return;
			}
			const u = new URL(`${API_URL}/auth/oauth/start`);
			u.searchParams.set("provider", provider);
			u.searchParams.set("return_to", resolvedReturnTo);
			window.location.assign(u.toString());
		},
		[resolvedReturnTo],
	);

	const handleEmailSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const trimmed = email.trim().toLowerCase();
			if (!validEmail(trimmed)) {
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
				if (!res.ok) throw new Error("could not send magic link");
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
		if (!validEmail(trimmed)) {
			setPasskeyPhase("error");
			setPasskeyError("enter your email first");
			return;
		}
		setPasskeyPhase("prompting");
		setPasskeyError(null);
		try {
			let nextPath: string;
			try {
				nextPath = await loginWithPasskey(trimmed, resolvedReturnTo);
			} catch (err) {
				if (err instanceof PasskeyError && (err.code === "NO_PASSKEY" || err.code === "NO_LOCAL_CREDENTIAL")) {
					setPasskeyPhase("registering");
					nextPath = await registerPasskey(trimmed, resolvedReturnTo);
				} else {
					throw err;
				}
			}
			assignAfterAuth(nextPath);
		} catch (err) {
			if (err instanceof PasskeyError && err.code === "USER_CANCELLED") {
				setPasskeyPhase("idle");
				return;
			}
			setPasskeyPhase("error");
			setPasskeyError(err instanceof Error ? err.message : "passkey failed");
		}
	}, [assignAfterAuth, email, resolvedReturnTo]);

	if (isAuthenticated) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[440px] border border-white/10 bg-[#08080a] p-0 rounded-lg overflow-hidden">
				<DialogHeader className="px-6 pt-7 text-center">
					<img src="/icon-512.png" alt="waifu.fun" className="mx-auto mb-3 size-12 rounded-sm" />
					<DialogTitle className="text-white">Sign in to waifu.fun</DialogTitle>
					<DialogDescription className="text-[#a1a1aa]">Use your Steward account to continue.</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue="passkey" className="px-6 pb-6 pt-5">
					<TabsList className="grid grid-cols-3">
						<TabsTrigger value="passkey">Passkey</TabsTrigger>
						<TabsTrigger value="email">Email</TabsTrigger>
						<TabsTrigger value="oauth">OAuth</TabsTrigger>
					</TabsList>
					<TabsContent value="passkey" className="pt-4">
						<label
							className="block text-xs font-mono uppercase tracking-[0.18em] text-[#71717a]"
							htmlFor="connect-passkey-email"
						>
							Email
						</label>
						<input
							id="connect-passkey-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="your email"
							className="mt-2 w-full rounded-sm border border-white/10 bg-[#0b0b0d] px-3 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#52525b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/30"
						/>
						<button
							type="button"
							onClick={handlePasskey}
							disabled={passkeyPhase === "prompting" || passkeyPhase === "registering"}
							className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm bg-[#00ff87] px-4 py-2.5 text-sm font-medium text-[#08080a] disabled:opacity-50"
						>
							{passkeyPhase === "prompting" || passkeyPhase === "registering" ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Fingerprint className="size-4" />
							)}
							{passkeyPhase === "registering" ? "setting up passkey" : "continue with passkey"}
						</button>
						{passkeyError ? <p className="mt-2 text-xs text-[#f87171]">{passkeyError}</p> : null}
					</TabsContent>
					<TabsContent value="email" className="pt-4">
						{emailPhase === "sent" ? (
							<output className="flex items-start gap-3 rounded-sm border border-[#00ff87]/30 bg-[#00ff87]/5 px-4 py-3">
								<CheckCircle2 className="mt-0.5 size-4 text-[#00ff87]" />
								<span className="text-sm text-[#e4e4e7]">check your inbox for a magic link</span>
							</output>
						) : (
							<form onSubmit={handleEmailSubmit} className="flex gap-2">
								<input
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="your email"
									className="min-w-0 flex-1 rounded-sm border border-white/10 bg-[#0b0b0d] px-3 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#52525b]"
								/>
								<button
									type="submit"
									disabled={emailPhase === "submitting"}
									className="rounded-sm bg-[#00ff87] px-4 text-sm font-medium text-[#08080a] disabled:opacity-50"
								>
									{emailPhase === "submitting" ? (
										<Loader2 className="size-4 animate-spin" />
									) : (
										<Mail className="size-4" />
									)}
								</button>
							</form>
						)}
						{emailError ? <p className="mt-2 text-xs text-[#f87171]">{emailError}</p> : null}
					</TabsContent>
					<TabsContent value="oauth" className="pt-4">
						<div className="grid grid-cols-2 gap-2">
							{PROVIDERS.map((provider) => (
								<button
									key={provider.id}
									type="button"
									onClick={() => handleProvider(provider.id)}
									className="flex items-center justify-center gap-2 rounded-sm border border-white/10 bg-[#0b0b0d] px-3 py-3 text-sm font-medium text-[#e4e4e7] hover:border-white/25"
								>
									<Github className="size-4" />
									{provider.label}
								</button>
							))}
						</div>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
