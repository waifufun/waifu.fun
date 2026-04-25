"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, LogOut } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useStewardStatus } from "@/lib/api/steward";
import StewardConnectModal from "./steward-connect-modal";

type Props = {
	className?: string;
};

function StatusDot({ tone }: { tone: "ok" | "warn" | "idle" }) {
	const color =
		tone === "ok"
			? "bg-[#00ff87] shadow-[0_0_6px_rgba(0,255,135,0.55)]"
			: tone === "warn"
				? "bg-[#71717a]"
				: "bg-neutral-500";
	return (
		<span aria-hidden="true" className={`relative inline-flex h-1.5 w-1.5 rounded-full ${color}`}>
			{tone === "ok" ? <span className="absolute inset-0 rounded-full bg-[#00ff87] animate-ping opacity-40" /> : null}
		</span>
	);
}

export default function StewardConnectBadge({ className }: Props) {
	const { status, unlink } = useStewardStatus();
	const [modalOpen, setModalOpen] = useState(false);
	const [popoverOpen, setPopoverOpen] = useState(false);

	// Listen for popup-driven connect events so the badge refreshes
	// without a manual refetch click.
	useEffect(() => {
		function onMessage(event: MessageEvent) {
			if (!event?.data || typeof event.data !== "object") return;
			const data = event.data as { type?: string };
			if (data.type === "steward.connected") {
				void status.refetch();
				setModalOpen(false);
			}
		}
		window.addEventListener("message", onMessage);
		return () => window.removeEventListener("message", onMessage);
	}, [status]);

	const baseClass =
		"inline-flex items-center gap-2 h-8 px-2.5 rounded-sm border text-xs leading-none transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]";

	if (status.isLoading) {
		return (
			<div
				className={`${baseClass} border-stroke bg-[#0c0c0e] text-neutral-500 ${className ?? ""}`}
				aria-label="Loading Steward connection status"
			>
				<span className="inline-block h-1.5 w-1.5 rounded-full bg-neutral-600 animate-pulse" />
				<span className="font-mono uppercase tracking-[0.2em] text-[10px]">[steward]</span>
				<span className="h-3 w-16 rounded bg-neutral-800 animate-pulse" />
			</div>
		);
	}

	const data = status.data;
	const isConnected = Boolean(data?.connected);

	if (!isConnected) {
		return (
			<>
				<button
					type="button"
					onClick={() => setModalOpen(true)}
					className={`${baseClass} border-stroke bg-[rgba(255,255,255,0.02)] text-[#a1a1aa] hover:border-stroke-strong hover:bg-[rgba(255,255,255,0.04)] active:scale-[0.98] ${className ?? ""}`}
					aria-label="Steward not connected. Open connect dialog."
				>
					<StatusDot tone="warn" />
					<span className="font-mono uppercase tracking-[0.2em] text-[10px] text-[#71717a]">[steward]</span>
					<span className="text-[#a1a1aa]">not connected</span>
				</button>
				<StewardConnectModal open={modalOpen} onOpenChange={setModalOpen} />
			</>
		);
	}

	const email = data?.email ?? data?.stewardUserId ?? "linked";
	const displayEmail = typeof email === "string" ? email : "linked";

	return (
		<>
			<Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className={`${baseClass} border-[#00ff87]/25 bg-[#00ff87]/[0.06] text-[#bff7d6] hover:border-[#00ff87]/45 hover:bg-[#00ff87]/[0.10] active:scale-[0.98] ${className ?? ""}`}
						aria-label={`Steward connected as ${displayEmail}. Open menu.`}
					>
						<StatusDot tone="ok" />
						<Check className="h-3 w-3 text-[#00ff87]" strokeWidth={1.75} aria-hidden="true" />
						<span className="font-mono text-[11px] text-[#71717a] uppercase tracking-[0.18em] mr-0.5">[steward]</span>
						<span className="font-mono text-[11px] text-[#bff7d6] truncate max-w-[180px]">{displayEmail}</span>
					</button>
				</PopoverTrigger>
				<PopoverContent
					align="end"
					sideOffset={8}
					className="w-64 rounded-sm border-white/10 bg-[#0a0a0c] p-2 text-sm text-neutral-200 shadow-[0_20px_40px_-15px_rgba(0,0,0,0.6)]"
				>
					<div className="px-2 py-2 border-b border-white/5">
						<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-neutral-500">[steward]</div>
						<div className="mt-1 text-xs font-mono text-neutral-200 truncate">{displayEmail}</div>
					</div>
					<a
						href="https://eliza.steward.dev"
						target="_blank"
						rel="noopener noreferrer"
						className="mt-1 flex items-center justify-between gap-2 rounded-sm px-2 py-2 text-xs text-neutral-200 hover:bg-white/5 transition-colors"
					>
						<span>manage in steward</span>
						<ExternalLink className="h-3.5 w-3.5 text-neutral-500" strokeWidth={1.75} aria-hidden="true" />
					</a>
					<button
						type="button"
						onClick={() => {
							void unlink.mutateAsync().catch(() => {
								/* surfaced via mutation state if needed */
							});
							setPopoverOpen(false);
						}}
						className="mt-0.5 flex w-full items-center justify-between gap-2 rounded-sm px-2 py-2 text-xs text-rose-200/90 hover:bg-rose-500/10 transition-colors"
					>
						<span>disconnect</span>
						<LogOut className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
					</button>
				</PopoverContent>
			</Popover>
			<StewardConnectModal open={modalOpen} onOpenChange={setModalOpen} />
		</>
	);
}
