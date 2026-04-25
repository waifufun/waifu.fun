"use client";

import { useState } from "react";
import { useXConnection, formatRelativeTime } from "@/lib/api/x-connection";
import { Button } from "@/components/ui/button";

type Props = {
	agentId: string;
};

function XLogo({ className }: { className?: string }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
			<path d="M18.244 2H21.5l-7.42 8.482L23 22h-6.828l-5.35-6.99L4.6 22H1.34l7.94-9.075L1 2h6.99l4.84 6.398L18.244 2Zm-2.395 18h1.88L7.25 4H5.24l10.61 16Z" />
		</svg>
	);
}

function Spinner({ className }: { className?: string }) {
	return (
		<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`animate-spin ${className ?? ""}`}>
			<circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
			<path d="M21 12a9 9 0 0 1-9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
		</svg>
	);
}

export default function XConnectionPanel({ agentId }: Props) {
	const { status, connect, disconnect } = useXConnection(agentId);
	const [redirecting, setRedirecting] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	const handleConnect = async () => {
		setActionError(null);
		try {
			const { authorizationUrl } = await connect.mutateAsync();
			if (!authorizationUrl) {
				throw new Error("Backend did not return an authorizationUrl");
			}
			setRedirecting(true);
			window.location.href = authorizationUrl;
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Failed to start X connection");
		}
	};

	const handleDisconnect = async () => {
		setActionError(null);
		const handle = status.data?.xHandle?.replace(/^@/, "") ?? "this account";
		if (typeof window !== "undefined") {
			const ok = window.confirm(`disconnect @${handle} from this agent?`);
			if (!ok) return;
		}
		try {
			await disconnect.mutateAsync();
		} catch (err) {
			setActionError(err instanceof Error ? err.message : "Failed to disconnect X");
		}
	};

	if (status.isLoading) {
		return (
			<section aria-label="X account" className="p-5 rounded-sm border border-stroke bg-[#0C0C0C]">
				<header className="mb-4">
					<h2 className="text-sm font-medium text-white uppercase tracking-[0.2em]">x account</h2>
				</header>
				<div className="flex items-center gap-4 animate-pulse">
					<div className="w-10 h-10 rounded-sm bg-[#141414]" />
					<div className="flex-1 space-y-2">
						<div className="h-4 w-40 bg-[#141414] rounded" />
						<div className="h-3 w-24 bg-[#141414] rounded" />
					</div>
					<div className="h-9 w-28 bg-[#141414] rounded" />
				</div>
			</section>
		);
	}

	if (status.error) {
		return (
			<section aria-label="X account" className="p-5 rounded-sm border border-red-500/30 bg-red-500/5">
				<header className="mb-2">
					<h2 className="text-sm font-medium text-white uppercase tracking-[0.2em]">x account</h2>
				</header>
				<p className="text-sm text-red-300">couldn&apos;t load x status. {(status.error as Error).message}</p>
			</section>
		);
	}

	const data = status.data;
	const connected = Boolean(data?.connected);
	const connecting = connect.isPending || redirecting;
	const disconnecting = disconnect.isPending;

	if (!connected) {
		return (
			<section aria-label="X account" className="p-5 rounded-sm border border-dashed border-stroke bg-[#0A0A0A]">
				<header className="mb-4">
					<h2 className="text-sm font-medium text-white uppercase tracking-[0.2em]">x account</h2>
				</header>
				<div className="flex items-center gap-4 flex-wrap">
					<div className="w-10 h-10 rounded-sm bg-[#141414] border border-stroke flex items-center justify-center shrink-0">
						<XLogo className="w-5 h-5 text-white" />
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-white">{connecting ? "redirecting to x…" : "connect x account"}</p>
						<p className="text-xs text-neutral-500 mt-0.5">
							{connecting
								? "hang tight while we hand you off."
								: "link this agent to an x handle so it can post autonomously."}
						</p>
					</div>
					<Button
						type="button"
						variant="outline"
						className="h-9 inline-flex items-center gap-2"
						onClick={handleConnect}
						disabled={connecting}
					>
						{connecting ? (
							<>
								<Spinner className="w-4 h-4 text-white" />
								<span>redirecting…</span>
							</>
						) : (
							<span>connect x</span>
						)}
					</Button>
				</div>
				{actionError ? (
					<p role="alert" className="text-xs text-red-300 mt-3">
						{actionError}
					</p>
				) : null}
			</section>
		);
	}

	const handle = data?.xHandle?.replace(/^@/, "") ?? "";
	const relative = formatRelativeTime(data?.connectedAt);

	return (
		<section aria-label="X account" className="p-5 rounded-sm border border-stroke bg-[#0C0C0C]">
			<header className="mb-4">
				<h2 className="text-sm font-medium text-white uppercase tracking-[0.2em]">x account</h2>
			</header>
			<div className="flex items-center gap-4 flex-wrap">
				<div className="w-10 h-10 rounded-sm bg-[#141414] border border-stroke flex items-center justify-center shrink-0">
					<XLogo className="w-5 h-5 text-white" />
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium text-white truncate">{handle ? `@${handle}` : "connected"}</p>
					{relative ? <p className="text-xs text-neutral-500 mt-0.5">connected {relative}</p> : null}
				</div>
				<button
					type="button"
					onClick={handleDisconnect}
					disabled={disconnecting}
					className="text-xs text-neutral-400 hover:text-white underline-offset-4 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{disconnecting ? "disconnecting…" : "disconnect"}
				</button>
			</div>
			{actionError ? (
				<p role="alert" className="text-xs text-red-300 mt-3">
					{actionError}
				</p>
			) : null}
		</section>
	);
}
