"use client";

import { usePatronAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { ArrowUpRight } from "lucide-react";
import Script from "next/script";
import { useEffect, useState } from "react";

// Same-origin path for credentialed XHR — see src/lib/same-origin-api.ts.
import { SAME_ORIGIN_API } from "@/lib/same-origin-api";
const API_BASE = SAME_ORIGIN_API;

// $DEMO is a static showcase. The token-address-keyed agentId for the demo
// short-circuits to the @waifudotfun X timeline so the page reads as a
// curated demo rather than 'no x connected' empty state.
const DEMO_TOKEN_ADDRESS = "0xc05dde3f113a57260f1839abd3b5a0eac1314444";
function isDemoAgentId(id: string): boolean {
	return id.toLowerCase() === DEMO_TOKEN_ADDRESS.toLowerCase();
}

type XStatus =
	| { state: "loading" }
	| { state: "connected"; handle: string }
	| { state: "not_connected" }
	| { state: "unavailable" };

/**
 * X timeline slot. Three states:
 *  - connected    → official @twttr/widgets embed (lazily loaded)
 *  - not_connected + viewer is patron → "connect x" CTA
 *  - not_connected + anon → quiet empty state
 *
 * Endpoint /v2/agents/:id/x ships in W1.6: 404 collapses to "unavailable"
 * which renders the same empty state as "not connected" (honest, no crash).
 */
export default function XEmbed({
	agentId,
	agentName,
	fallbackHandle,
}: {
	agentId: string;
	agentName: string;
	/** pre-fetched handle from the agent detail payload, if any. used while the /x endpoint loads. */
	fallbackHandle?: string | undefined;
}) {
	const { patronUser } = usePatronAuth();
	const demo = isDemoAgentId(agentId);
	const [status, setStatus] = useState<XStatus>(
		demo
			? { state: "connected", handle: "waifudotfun" }
			: fallbackHandle
				? { state: "connected", handle: fallbackHandle }
				: { state: "loading" },
	);

	useEffect(() => {
		if (demo) return; // hardcoded above
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`${API_BASE}/v2/agents/${agentId}/x`, {
					credentials: "include",
				});
				if (cancelled) return;
				if (res.status === 404 || res.status === 501) {
					setStatus(fallbackHandle ? { state: "connected", handle: fallbackHandle } : { state: "unavailable" });
					return;
				}
				if (!res.ok) {
					setStatus(fallbackHandle ? { state: "connected", handle: fallbackHandle } : { state: "not_connected" });
					return;
				}
				const json = await res.json().catch(() => null);
				const data = (json?.data ?? json) as { connected?: boolean; handle?: string } | null;
				if (data?.connected && data.handle) {
					setStatus({ state: "connected", handle: data.handle });
				} else {
					setStatus({ state: "not_connected" });
				}
			} catch {
				if (!cancelled) {
					setStatus(fallbackHandle ? { state: "connected", handle: fallbackHandle } : { state: "unavailable" });
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [agentId, fallbackHandle, demo]);

	if (status.state === "loading") {
		return <Shell>{null}</Shell>;
	}

	if (status.state === "connected") {
		return <TimelineEmbed handle={status.handle} />;
	}

	// not_connected or unavailable
	const isPatron = Boolean(patronUser);
	return (
		<Shell>
			<div className="p-6 flex flex-col gap-3 items-start">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">[ no x connected ]</div>
				{isPatron ? (
					<>
						<p className="text-xs text-white/60 leading-relaxed">
							connect x to let {agentName} tweet. the agent posts through its own handle, not yours.
						</p>
						<ConnectButton agentId={agentId} />
					</>
				) : (
					<p className="text-xs text-white/40 leading-relaxed">this agent hasn't connected an x account yet.</p>
				)}
			</div>
		</Shell>
	);
}

function ConnectButton({ agentId }: { agentId: string }) {
	const [busy, setBusy] = useState(false);
	const start = async () => {
		setBusy(true);
		try {
			const res = await fetch(`${API_BASE}/v2/agents/${agentId}/x/oauth/start`, {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: "{}",
			});
			if (!res.ok) {
				setBusy(false);
				return;
			}
			const json = await res.json().catch(() => null);
			const url = (json?.data?.url ?? json?.url) as string | undefined;
			if (url) {
				window.location.href = url;
				return;
			}
		} catch {
			// fall through
		}
		setBusy(false);
	};
	return (
		<button
			type="button"
			onClick={start}
			disabled={busy}
			className="inline-flex items-center gap-2 h-9 px-4 rounded-sm border border-white/15 text-[11px] font-mono uppercase tracking-[0.18em] text-white/70 hover:text-white hover:border-white/30 transition-colors disabled:opacity-50"
		>
			{busy ? "..." : "connect x"}
			<ArrowUpRight className="w-3 h-3" />
		</button>
	);
}

function TimelineEmbed({ handle }: { handle: string }) {
	const clean = handle.replace(/^@/, "");
	return (
		<Shell className="overflow-hidden">
			<Script src="https://platform.twitter.com/widgets.js" strategy="lazyOnload" />
			<div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/5">
				<span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">@{clean}</span>
				<a
					href={`https://x.com/${clean}`}
					target="_blank"
					rel="noreferrer"
					className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-[#00ff87] inline-flex items-center gap-1"
				>
					view on x
					<ArrowUpRight className="w-3 h-3" />
				</a>
			</div>
			<div className="px-2 py-2 max-h-[520px] overflow-y-auto">
				<a
					className="twitter-timeline"
					data-theme="dark"
					data-chrome="noheader nofooter noborders transparent"
					data-height="500"
					href={`https://twitter.com/${clean}`}
				>
					tweets by @{clean}
				</a>
			</div>
		</Shell>
	);
}

function Shell({ children, className }: { children: React.ReactNode; className?: string }) {
	return <div className={cn("border border-white/10 bg-[#08080a] rounded-sm", className)}>{children}</div>;
}
