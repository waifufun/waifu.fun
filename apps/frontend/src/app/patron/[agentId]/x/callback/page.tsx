"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";

type Params = { agentId: string };

const REDIRECT_MS = 2000;

export default function XCallbackPage({ params }: { params: Promise<Params> }) {
	const { agentId } = use(params);
	const router = useRouter();
	const searchParams = useSearchParams();

	const { status, message, handle } = useMemo(() => {
		const status = searchParams.get("status") ?? "error";
		const message = searchParams.get("message") ?? "";
		const handle = searchParams.get("handle") ?? "";
		return { status, message, handle };
	}, [searchParams]);

	const [countdown, setCountdown] = useState(Math.round(REDIRECT_MS / 1000));

	useEffect(() => {
		const target = `/patron/${agentId}`;
		if (status === "connected") {
			toast.success(handle ? `X connected as @${handle.replace(/^@/, "")}` : "X account connected");
		} else {
			toast.error(message ? `X connection failed: ${message}` : "X connection failed");
		}

		const t = window.setTimeout(() => {
			router.replace(target);
		}, REDIRECT_MS);

		const tick = window.setInterval(() => {
			setCountdown((n) => (n > 0 ? n - 1 : 0));
		}, 1000);

		return () => {
			window.clearTimeout(t);
			window.clearInterval(tick);
		};
	}, [agentId, status, message, handle, router]);

	const connected = status === "connected";

	return (
		<main className="py-12 px-4 max-w-md mx-auto">
			<output
				className={`block p-6 rounded-md border ${
					connected ? "border-autofun-background-action-highlight/40 bg-[#0C0C0C]" : "border-red-500/30 bg-red-500/5"
				}`}
			>
				<h1 className="text-lg font-medium text-white">{connected ? "X account connected" : "X connection failed"}</h1>
				<p className="text-sm text-neutral-400 mt-2">
					{connected
						? handle
							? `@${handle.replace(/^@/, "")} is now linked to this agent.`
							: "Your X account is now linked to this agent."
						: message || "Something went wrong completing the OAuth handshake."}
				</p>
				<p className="text-xs text-neutral-500 mt-4">
					Redirecting back in {countdown}s...{" "}
					<Link href={`/patron/${agentId}`} className="underline underline-offset-4 hover:text-white">
						Go now
					</Link>
				</p>
			</output>
		</main>
	);
}
