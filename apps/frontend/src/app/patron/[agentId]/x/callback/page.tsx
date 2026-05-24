"use client";

import { useTranslation } from "@/contexts/locale-context";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { use, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Params = { agentId: string };

const REDIRECT_MS = 2000;

export default function XCallbackPage({ params }: { params: Promise<Params> }) {
	const { t } = useTranslation();
	const { agentId } = use(params);
	const router = useRouter();
	const searchParams = useSearchParams();

	const { status, message, handle } = useMemo(() => {
		const status = searchParams?.get("status") ?? "error";
		const message = searchParams?.get("message") ?? "";
		const handle = searchParams?.get("handle") ?? "";
		return { status, message, handle };
	}, [searchParams]);

	const [countdown, setCountdown] = useState(Math.round(REDIRECT_MS / 1000));
	const tRef = useRef(t);

	useEffect(() => {
		tRef.current = t;
	}, [t]);

	useEffect(() => {
		const target = `/patron/${agentId}`;
		const translate = tRef.current;
		if (status === "connected") {
			toast.success(
				handle
					? translate("patron.xCallback.toastConnectedWithHandle", { handle: handle.replace(/^@/, "") })
					: translate("patron.xCallback.toastConnected"),
			);
		} else {
			toast.error(
				message
					? translate("patron.xCallback.toastFailedWithMessage", { message })
					: translate("patron.xCallback.toastFailed"),
			);
		}

		const redirectTimer = window.setTimeout(() => {
			router.replace(target);
		}, REDIRECT_MS);

		const tick = window.setInterval(() => {
			setCountdown((n) => (n > 0 ? n - 1 : 0));
		}, 1000);

		return () => {
			window.clearTimeout(redirectTimer);
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
				<h1 className="text-lg font-medium text-white">
					{connected ? t("patron.xCallback.successTitle") : t("patron.xCallback.failedTitle")}
				</h1>
				<p className="text-sm text-neutral-400 mt-2">
					{connected
						? handle
							? t("patron.xCallback.successBodyWithHandle", { handle: handle.replace(/^@/, "") })
							: t("patron.xCallback.successBody")
						: message || t("patron.xCallback.failedBody")}
				</p>
				<p className="text-xs text-neutral-500 mt-4">
					{t("patron.xCallback.redirectingIn", { n: String(countdown) })}{" "}
					<Link href={`/patron/${agentId}`} className="underline underline-offset-4 hover:text-white">
						{t("patron.xCallback.goNow")}
					</Link>
				</p>
			</output>
		</main>
	);
}
