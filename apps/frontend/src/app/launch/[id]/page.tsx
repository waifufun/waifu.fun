"use client";

import { useLaunchState } from "@/lib/api/launches";
import { cn } from "@/lib/utils";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

const STATUS_COPY: Record<string, { title: string; subtitle: string }> = {
	provisioned: {
		title: "queued for liftoff.",
		subtitle: "we provisioned the agent. authorize from your patron page when you're ready.",
	},
	queued: {
		title: "in the queue.",
		subtitle: "tx is signed and waiting for a block. shouldn't be long.",
	},
	launching: {
		title: "launching now.",
		subtitle: "router is firing. don't close this tab.",
	},
	live: {
		title: "live.",
		subtitle: "the agent is on bsc and tradeable.",
	},
	failed: {
		title: "launch failed.",
		subtitle: "something didn't go through. check the error below.",
	},
};

export default function LaunchPage() {
	const router = useRouter();
	const params = useParams<{ id: string }>();
	const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
	const isPlaceholder = !id || id === "placeholder";

	const { data, isLoading, error } = useLaunchState(isPlaceholder ? undefined : id, {
		pollMs: 4_000,
	});

	// Once the launch goes live, jump to the agent page.
	useEffect(() => {
		if (!data) return undefined;
		if (data.status !== "live" || !data.tokenAddress) return undefined;
		const t = setTimeout(() => {
			router.push(`/agent/${data.tokenAddress}`);
		}, 1_500);
		return () => clearTimeout(t);
	}, [data, router]);

	if (isPlaceholder) {
		return (
			<main className="min-h-[100dvh] px-4 py-16">
				<div className="mx-auto max-w-[640px]">
					<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">launch</p>
					<h1 className="mt-3 text-3xl text-white tracking-tight">no launch id.</h1>
					<p className="mt-3 text-sm text-neutral-400">
						this page lives at <code className="text-neutral-300">/launch/[id]</code>. open it from the wizard after
						submit.
					</p>
				</div>
			</main>
		);
	}

	const copy = data ? STATUS_COPY[data.status] : null;

	return (
		<main className="min-h-[100dvh] px-4 py-16">
			<div className="mx-auto max-w-[640px]">
				<header className="mb-10">
					<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">{`launch • ${id}`}</p>
					<h1 className="mt-3 text-3xl md:text-4xl font-medium text-white tracking-tight">
						{isLoading ? "loading..." : (copy?.title ?? "unknown state.")}
					</h1>
					<p className="mt-3 text-sm text-neutral-400 leading-relaxed max-w-[52ch]">
						{copy?.subtitle ?? "we couldn't find this launch. it may have just been created. give it a moment."}
					</p>
				</header>

				{error ? (
					<div className="border border-red-500/40 bg-red-500/[0.04] p-4 mb-6">
						<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-red-400 mb-1">error</p>
						<p className="text-sm text-red-200">{error instanceof Error ? error.message : "failed to load launch"}</p>
					</div>
				) : null}

				{data ? (
					<dl className="border border-white/8 bg-white/[0.012] divide-y divide-white/5">
						<Row label="status" value={data.status} accent={data.status === "live"} />
						{data.tokenAddress ? <Row label="token" value={data.tokenAddress} mono /> : null}
						{data.txHash ? <Row label="tx" value={data.txHash} mono /> : null}
						{data.firstBuyWei ? <Row label="first buy (wei)" value={data.firstBuyWei} mono /> : null}
						{data.error ? <Row label="error" value={data.error} /> : null}
					</dl>
				) : null}

				{data?.status === "provisioned" ? (
					<button
						type="button"
						onClick={() => router.push(`/patron/${data.agentId}`)}
						className={cn(
							"mt-8 inline-flex items-center gap-2 h-10 px-4 text-sm font-medium tracking-tight",
							"bg-accent text-black hover:bg-accent-dim active:translate-y-[1px]",
							"transition-all duration-200",
						)}
					>
						authorize on patron page
					</button>
				) : null}
			</div>
		</main>
	);
}

function Row({
	label,
	value,
	mono,
	accent,
}: {
	label: string;
	value: string;
	mono?: boolean;
	accent?: boolean;
}) {
	return (
		<div className="p-4 flex items-baseline gap-4">
			<dt className="w-32 shrink-0 text-[10px] font-mono uppercase tracking-[0.24em] text-neutral-500">{label}</dt>
			<dd
				className={cn(
					"flex-1 text-sm break-all",
					mono && "font-mono text-xs",
					accent ? "text-accent" : "text-neutral-200",
				)}
			>
				{value}
			</dd>
		</div>
	);
}
