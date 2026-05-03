"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWaifuAuth } from "@/hooks/use-waifu-auth";
import { PasskeyError, loginWithPasskey, registerPasskey } from "@/lib/passkey";
import type { StewardAuthResult } from "@stwd/sdk";
import { CheckCircle2, Fingerprint, Loader2, Mail } from "lucide-react";
import dynamic from "next/dynamic";
import { type FormEvent, type ReactNode, useCallback, useMemo, useState } from "react";

// Lazy: keeps wagmi + @solana/* peers off the initial bundle until
// the login modal is opened.
//
// NOTE: We patch @stwd/react@0.7.2's package.json to add a `default`
// export condition (see patches/@stwd%2Freact@0.7.2.patch) because
// Next 15.3.9 + Webpack rejects the 0.7.2 `"./wallet"` map when only
// `import` is set. Patch can be removed once we move to ^0.8.0 here.
const WalletLogin = dynamic(() => import("@stwd/react/wallet").then((mod) => ({ default: mod.WalletLogin })), {
	ssr: false,
	loading: () => (
		<div
			className="flex items-center justify-center rounded-sm border border-white/10 bg-[#0b0b0d] py-6 text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]"
			data-testid="wallet-login-loading"
		>
			loading wallet sign-in
		</div>
	),
});

// SolanaProvider is mounted lazily here so the heavy @solana/* +
// wallet-adapter dep tree never resolves for users who don't open
// the login modal.
const SolanaProvider = dynamic(
	() => import("@/providers/solana-provider").then((mod) => ({ default: mod.SolanaProvider })),
	{ ssr: false },
);

type WalletPhase = "idle" | "finalizing" | "error";

interface ConnectModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	returnTo?: string;
}

type ProviderId = "github" | "google" | "twitter" | "discord";
type EmailPhase = "idle" | "submitting" | "sent" | "error";
type PasskeyPhase = "idle" | "prompting" | "registering" | "error";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://api.waifu.fun";

// Inline brand glyphs sized to currentColor. Keeps the modal a single
// component, avoids pulling in extra icon packages, and matches the
// `size-4` Lucide rhythm used elsewhere in this file.

function GitHubGlyph() {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4 shrink-0">
			<path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.96 10.96 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.25 5.69.41.36.78 1.07.78 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
		</svg>
	);
}

function GoogleGlyph() {
	return (
		<svg viewBox="0 0 48 48" aria-hidden="true" className="size-4 shrink-0">
			<path
				fill="#EA4335"
				d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
			/>
			<path
				fill="#4285F4"
				d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
			/>
			<path
				fill="#FBBC05"
				d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
			/>
			<path
				fill="#34A853"
				d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
			/>
		</svg>
	);
}

function XGlyph() {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-3.5 shrink-0">
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}

function DiscordGlyph() {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="size-4 shrink-0">
			<path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
		</svg>
	);
}

const PROVIDERS: Array<{ id: ProviderId; label: string; glyph: ReactNode }> = [
	{ id: "github", label: "GitHub", glyph: <GitHubGlyph /> },
	{ id: "google", label: "Google", glyph: <GoogleGlyph /> },
	{ id: "twitter", label: "X", glyph: <XGlyph /> },
	{ id: "discord", label: "Discord", glyph: <DiscordGlyph /> },
];

function validEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Reject protocol-relative redirects (//evil.com, /\evil.com).
function isSafeRelativePath(raw: string | null | undefined): raw is string {
	if (!raw || raw.length > 200) return false;
	if (!raw.startsWith("/")) return false;
	if (raw.startsWith("//") || raw.startsWith("/\\")) return false;
	return true;
}

export function ConnectModal({ open, onOpenChange, returnTo }: ConnectModalProps) {
	const { isAuthenticated } = useWaifuAuth();
	const [email, setEmail] = useState("");
	const [emailPhase, setEmailPhase] = useState<EmailPhase>("idle");
	const [emailError, setEmailError] = useState<string | null>(null);
	const [passkeyPhase, setPasskeyPhase] = useState<PasskeyPhase>("idle");
	const [passkeyError, setPasskeyError] = useState<string | null>(null);
	const [walletPhase, setWalletPhase] = useState<WalletPhase>("idle");
	const [walletError, setWalletError] = useState<string | null>(null);

	const resolvedReturnTo = useMemo(() => {
		if (isSafeRelativePath(returnTo)) return returnTo;
		if (typeof window === "undefined") return "/";
		return window.location.pathname + window.location.search;
	}, [returnTo]);

	const assignAfterAuth = useCallback((nextPath: string) => {
		if (typeof window === "undefined") return;
		window.location.assign(nextPath);
	}, []);

	const handleProvider = useCallback(
		(providerId: ProviderId) => {
			if (typeof window === "undefined") return;
			const next = new URL(`${API_URL}/v2/auth/oauth/${providerId}/start`);
			next.searchParams.set("returnTo", resolvedReturnTo);
			window.location.assign(next.toString());
		},
		[resolvedReturnTo],
	);

	const handleEmailSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>) => {
			event.preventDefault();
			const trimmed = email.trim();
			if (!validEmail(trimmed)) {
				setEmailPhase("error");
				setEmailError("enter a valid email address");
				return;
			}
			setEmailError(null);
			setEmailPhase("submitting");
			try {
				const response = await fetch(`${API_URL}/v2/auth/email/start`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ email: trimmed, returnTo: resolvedReturnTo }),
				});
				if (!response.ok) {
					setEmailPhase("error");
					setEmailError("could not send magic link");
					return;
				}
				setEmailPhase("sent");
			} catch {
				setEmailPhase("error");
				setEmailError("could not send magic link");
			}
		},
		[email, resolvedReturnTo],
	);

	const handlePasskey = useCallback(async () => {
		const trimmed = email.trim();
		if (!validEmail(trimmed)) {
			setPasskeyPhase("error");
			setPasskeyError("enter a valid email address first");
			return;
		}
		setPasskeyError(null);
		setPasskeyPhase("prompting");
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

	const handleWalletSuccess = useCallback(
		async (result: StewardAuthResult, kind: "evm" | "solana") => {
			setWalletPhase("finalizing");
			setWalletError(null);
			try {
				const res = await fetch("/api/auth/finalize", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						provider: "oauth",
						token: result.token,
						refreshToken: result.refreshToken,
					}),
				});
				if (!res.ok) {
					const body = (await res.json().catch(() => null)) as {
						error?: string;
						message?: string;
					} | null;
					throw new Error(body?.message ?? body?.error ?? `http ${res.status}`);
				}
				onOpenChange(false);
				assignAfterAuth(resolvedReturnTo);
			} catch (err) {
				setWalletPhase("error");
				setWalletError(err instanceof Error ? `${kind} sign-in failed: ${err.message}` : `${kind} sign-in failed`);
			}
		},
		[assignAfterAuth, onOpenChange, resolvedReturnTo],
	);

	const handleWalletError = useCallback((err: Error, kind: "evm" | "solana") => {
		setWalletPhase("error");
		setWalletError(`${kind} sign-in failed: ${err.message}`);
	}, []);

	if (isAuthenticated) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-[440px] border border-white/10 bg-[#08080a] p-0 rounded-lg overflow-hidden">
				<DialogHeader className="px-6 pt-7 text-center sm:text-center items-center">
					<img src="/icon-512.png" alt="waifu.fun" className="mx-auto mb-3 size-12 rounded-sm" />
					<DialogTitle className="text-white text-center w-full">sign in to waifu.fun</DialogTitle>
					<DialogDescription className="text-[#a1a1aa] text-center w-full">
						passkey, email, or oauth, your call
					</DialogDescription>
				</DialogHeader>
				<Tabs defaultValue="passkey" className="px-6 pb-6 pt-5">
					<TabsList className="grid grid-cols-4 gap-1">
						<TabsTrigger value="passkey" className="text-xs">
							passkey
						</TabsTrigger>
						<TabsTrigger value="email" className="text-xs">
							email
						</TabsTrigger>
						<TabsTrigger value="oauth" className="text-xs">
							oauth
						</TabsTrigger>
						<TabsTrigger value="wallet" className="text-xs">
							wallet
						</TabsTrigger>
					</TabsList>

					<TabsContent value="passkey" className="pt-5">
						<label
							className="block text-[10px] font-mono uppercase tracking-[0.18em] text-[#71717a]"
							htmlFor="connect-passkey-email"
						>
							email
						</label>
						<input
							id="connect-passkey-email"
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							className="mt-2 w-full rounded-sm border border-white/10 bg-[#0b0b0d] px-3 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#52525b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/30"
						/>
						<button
							type="button"
							onClick={handlePasskey}
							disabled={passkeyPhase === "prompting" || passkeyPhase === "registering"}
							className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm bg-[#00ff87] px-4 py-2.5 text-sm font-medium text-[#08080a] transition-opacity hover:opacity-90 disabled:opacity-50"
						>
							{passkeyPhase === "prompting" || passkeyPhase === "registering" ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Fingerprint className="size-4" />
							)}
							{passkeyPhase === "registering" ? "setting up passkey" : "continue with passkey"}
						</button>
						<p className="mt-3 text-center text-[11px] text-[#71717a]">no password. uses your device biometric.</p>
						{passkeyError ? <p className="mt-2 text-center text-xs text-[#f87171]">{passkeyError}</p> : null}
					</TabsContent>

					<TabsContent value="email" className="pt-5">
						{emailPhase === "sent" ? (
							<output className="flex items-start gap-3 rounded-sm border border-[#00ff87]/30 bg-[#00ff87]/5 px-4 py-3">
								<CheckCircle2 className="mt-0.5 size-4 text-[#00ff87]" />
								<span className="text-sm text-[#e4e4e7]">check your inbox for a magic link</span>
							</output>
						) : (
							<>
								<label
									className="block text-[10px] font-mono uppercase tracking-[0.18em] text-[#71717a]"
									htmlFor="connect-email"
								>
									email
								</label>
								<form onSubmit={handleEmailSubmit} className="mt-2 flex gap-2">
									<input
										id="connect-email"
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="you@example.com"
										className="min-w-0 flex-1 rounded-sm border border-white/10 bg-[#0b0b0d] px-3 py-2.5 text-sm text-[#e4e4e7] placeholder:text-[#52525b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/30"
									/>
									<button
										type="submit"
										disabled={emailPhase === "submitting"}
										className="flex items-center justify-center gap-2 rounded-sm bg-[#00ff87] px-4 text-sm font-medium text-[#08080a] transition-opacity hover:opacity-90 disabled:opacity-50"
									>
										{emailPhase === "submitting" ? (
											<Loader2 className="size-4 animate-spin" />
										) : (
											<>
												<Mail className="size-4" />
												<span className="hidden sm:inline">send</span>
											</>
										)}
									</button>
								</form>
								<p className="mt-3 text-center text-[11px] text-[#71717a]">we'll send a magic link to your inbox</p>
							</>
						)}
						{emailError ? <p className="mt-2 text-center text-xs text-[#f87171]">{emailError}</p> : null}
					</TabsContent>

					<TabsContent value="oauth" className="pt-5">
						<div className="grid grid-cols-2 gap-2">
							{PROVIDERS.map((provider) => (
								<button
									key={provider.id}
									type="button"
									onClick={() => handleProvider(provider.id)}
									className="flex items-center justify-center gap-2 rounded-sm border border-white/10 bg-[#0b0b0d] px-3 py-3 text-sm font-medium text-[#e4e4e7] transition-colors hover:border-white/25 hover:bg-[#0e0e11]"
								>
									{provider.glyph}
									{provider.label}
								</button>
							))}
						</div>
						<p className="mt-4 text-center text-[11px] text-[#71717a]">
							pick your usual. we use steward to keep your sessions safe.
						</p>
					</TabsContent>

					<TabsContent value="wallet" className="pt-5">
						<div data-testid="steward-wallet-login" aria-busy={walletPhase === "finalizing"}>
							<SolanaProvider>
								<WalletLogin
									chains="both"
									onSuccess={(result, kind) => {
										void handleWalletSuccess(result, kind);
									}}
									onError={handleWalletError}
									evmLabel="ethereum"
									solanaLabel="solana"
								/>
							</SolanaProvider>
						</div>
						{walletPhase === "finalizing" ? (
							<output
								className="mt-3 flex items-center justify-center gap-2 text-xs text-[#a1a1aa] font-mono"
								aria-live="polite"
							>
								<Loader2 className="size-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
								<span>finalizing session</span>
							</output>
						) : null}
						{walletPhase === "error" && walletError ? (
							<p className="mt-3 text-center text-xs text-[#f87171]">{walletError}</p>
						) : null}
						<p className="mt-3 text-center text-[11px] text-[#71717a]">
							connect a wallet, sign the message, you're in.
						</p>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
