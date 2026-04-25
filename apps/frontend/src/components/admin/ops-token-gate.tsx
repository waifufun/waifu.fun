"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ADMIN_TOKEN_KEY, clearAdminToken, getAdminToken, setAdminToken } from "@/lib/api/admin";

const TOKEN_EVENT = "waifu-admin-token-change";

function emitTokenChange() {
	if (typeof window === "undefined") return;
	window.dispatchEvent(new CustomEvent(TOKEN_EVENT));
}

/**
 * Subscribe to localStorage admin-token changes. Returns the current token
 * (or null) and a setter; updates flow through both same-tab CustomEvents and
 * cross-tab `storage` events.
 */
export function useAdminTokenState(): {
	token: string | null;
	hasToken: boolean;
	mounted: boolean;
	save: (next: string) => void;
	clear: () => void;
} {
	const [mounted, setMounted] = useState(false);
	const [token, setToken] = useState<string | null>(null);

	useEffect(() => {
		setMounted(true);
		setToken(getAdminToken());

		const handleChange = () => setToken(getAdminToken());
		const handleStorage = (e: StorageEvent) => {
			if (e.key === ADMIN_TOKEN_KEY) setToken(e.newValue);
		};
		window.addEventListener(TOKEN_EVENT, handleChange);
		window.addEventListener("storage", handleStorage);
		return () => {
			window.removeEventListener(TOKEN_EVENT, handleChange);
			window.removeEventListener("storage", handleStorage);
		};
	}, []);

	return {
		token,
		hasToken: Boolean(token),
		mounted,
		save: (next: string) => {
			setAdminToken(next);
			setToken(next);
			emitTokenChange();
		},
		clear: () => {
			clearAdminToken();
			setToken(null);
			emitTokenChange();
		},
	};
}

function OpsTokenGate({ children }: { children: React.ReactNode }) {
	const { token, mounted, save } = useAdminTokenState();
	const [draft, setDraft] = useState("");
	const [show, setShow] = useState(false);

	if (!mounted) {
		// Avoid hydration flicker; render a neutral placeholder server-side.
		return (
			<div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
				<div className="rounded-md border border-white/5 bg-[#0c0c0e] p-6 text-xs font-mono text-neutral-500">
					initialising…
				</div>
			</div>
		);
	}

	if (!token) {
		return (
			<main className="max-w-md mx-auto px-4 sm:px-6 py-12">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						const trimmed = draft.trim();
						if (!trimmed) return;
						save(trimmed);
					}}
					className="rounded-md border border-red-500/30 bg-[#0c0c0e] p-6 space-y-4"
					aria-labelledby="admin-token-heading"
				>
					<div className="space-y-1">
						<h2 id="admin-token-heading" className="text-sm font-mono uppercase tracking-wider text-white">
							Admin token required
						</h2>
						<p className="text-xs text-neutral-400 leading-relaxed">
							Paste your operator token. It is stored in <code className="text-red-300">localStorage</code> and sent as
							<code className="text-red-300"> Authorization: Bearer …</code> on every admin call. Internal tooling only.
						</p>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="admin-token-input"
							className="text-[10px] font-mono uppercase tracking-wider text-neutral-500"
						>
							token
						</label>
						<Input
							id="admin-token-input"
							type={show ? "text" : "password"}
							autoComplete="off"
							spellCheck={false}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							placeholder="wf_admin_…"
							aria-describedby="admin-token-help"
							className="font-mono text-sm bg-black/40 border-white/10"
						/>
						<div className="flex items-center justify-between">
							<button
								type="button"
								onClick={() => setShow((s) => !s)}
								className="text-[10px] font-mono uppercase tracking-wider text-neutral-500 hover:text-white"
								aria-pressed={show}
							>
								{show ? "hide" : "reveal"}
							</button>
							<span id="admin-token-help" className="text-[10px] font-mono text-neutral-500">
								never logged
							</span>
						</div>
					</div>
					<Button type="submit" disabled={!draft.trim()} className="w-full" aria-label="Save admin token and continue">
						Continue
					</Button>
				</form>
			</main>
		);
	}

	return <>{children}</>;
}

function LogoutButton() {
	const { token, clear } = useAdminTokenState();
	if (!token) return null;
	return (
		<button
			type="button"
			onClick={() => {
				clear();
				if (typeof window !== "undefined") window.location.reload();
			}}
			className="text-[11px] font-mono uppercase tracking-wider text-red-300 border border-red-500/30 hover:bg-red-500/10 px-3 py-1.5 rounded-sm focus:outline-none focus:ring-2 focus:ring-red-400"
			aria-label="Log out of admin ops and clear stored token"
		>
			logout
		</button>
	);
}

OpsTokenGate.LogoutButton = LogoutButton;

export default OpsTokenGate;
