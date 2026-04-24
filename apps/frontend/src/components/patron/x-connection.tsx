"use client";

import { useXConnection, formatRelativeTime } from "@/lib/api/x-connection";
import { Button } from "@/components/ui/button";

type Props = {
	agentId: string;
};

function XLogo({ className }: { className?: string }) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
		>
			<path d="M18.244 2H21.5l-7.42 8.482L23 22h-6.828l-5.35-6.99L4.6 22H1.34l7.94-9.075L1 2h6.99l4.84 6.398L18.244 2Zm-2.395 18h1.88L7.25 4H5.24l10.61 16Z" />
		</svg>
	);
}

export default function XConnectionPanel({ agentId }: Props) {
	const { status } = useXConnection(agentId);

	if (status.isLoading) {
		return (
			<section
				aria-label="X account"
				className="p-5 rounded-md border border-autofun-background-action-highlight/40 bg-[#0C0C0C]"
			>
				<header className="mb-4">
					<h2 className="text-sm font-medium text-white uppercase tracking-wide">X Account</h2>
				</header>
				<div className="flex items-center gap-4 animate-pulse">
					<div className="w-10 h-10 rounded-md bg-[#141414]" />
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
			<section
				aria-label="X account"
				className="p-5 rounded-md border border-red-500/30 bg-red-500/5"
			>
				<header className="mb-2">
					<h2 className="text-sm font-medium text-white uppercase tracking-wide">X Account</h2>
				</header>
				<p className="text-sm text-red-300">
					Couldn&apos;t load X status. {(status.error as Error).message}
				</p>
			</section>
		);
	}

	const data = status.data;
	const connected = Boolean(data?.connected);

	if (!connected) {
		return (
			<section
				aria-label="X account"
				className="p-5 rounded-md border border-dashed border-autofun-background-action-highlight/60 bg-[#0A0A0A]"
			>
				<header className="mb-4">
					<h2 className="text-sm font-medium text-white uppercase tracking-wide">X Account</h2>
				</header>
				<div className="flex items-center gap-4 flex-wrap">
					<div className="w-10 h-10 rounded-md bg-[#141414] border border-autofun-background-action-highlight/30 flex items-center justify-center shrink-0">
						<XLogo className="w-5 h-5 text-white" />
					</div>
					<div className="flex-1 min-w-0">
						<p className="text-sm font-medium text-white">Connect X account</p>
						<p className="text-xs text-neutral-500 mt-0.5">
							Link this agent to an X handle so it can post autonomously.
						</p>
					</div>
					<Button type="button" variant="outline" className="h-9">
						Connect X
					</Button>
				</div>
			</section>
		);
	}

	const handle = data?.xHandle?.replace(/^@/, "") ?? "";
	const relative = formatRelativeTime(data?.connectedAt);

	return (
		<section
			aria-label="X account"
			className="p-5 rounded-md border border-autofun-background-action-highlight/40 bg-[#0C0C0C]"
		>
			<header className="mb-4">
				<h2 className="text-sm font-medium text-white uppercase tracking-wide">X Account</h2>
			</header>
			<div className="flex items-center gap-4 flex-wrap">
				<div className="w-10 h-10 rounded-md bg-[#141414] border border-autofun-background-action-highlight/30 flex items-center justify-center shrink-0">
					<XLogo className="w-5 h-5 text-white" />
				</div>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-medium text-white truncate">
						{handle ? `@${handle}` : "Connected"}
					</p>
					{relative ? (
						<p className="text-xs text-neutral-500 mt-0.5">Connected {relative}</p>
					) : null}
				</div>
				<button
					type="button"
					className="text-xs text-neutral-400 hover:text-white underline-offset-4 hover:underline"
				>
					Disconnect
				</button>
			</div>
		</section>
	);
}
