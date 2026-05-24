"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import ClaimFlow from "@/components/claim/claim-flow";
import ClaimHeader from "@/components/claim/claim-header";
import { PageShell } from "@/components/ui/page-shell";
import { useTranslation } from "@/contexts/locale-context";
import { type ClaimInfo, fetchClaimInfo } from "@/lib/claim-api";

type LoadState =
	| { status: "loading" }
	| { status: "expired" }
	| { status: "not-found" }
	| { status: "ready"; token: string; info: ClaimInfo };

export default function ClaimTokenClient({ token }: { token: string }) {
	const { t } = useTranslation();
	const [runtimeToken] = useState(() => {
		if (token && token !== "_") return token;
		if (typeof window === "undefined") return token;
		return decodeURIComponent(window.location.pathname.split("/").filter(Boolean).at(1) ?? "");
	});
	const [state, setState] = useState<LoadState>(() => (runtimeToken ? { status: "loading" } : { status: "not-found" }));

	useEffect(() => {
		if (!runtimeToken) {
			setState({ status: "not-found" });
			return;
		}

		let cancelled = false;
		void fetchClaimInfo(runtimeToken).then(({ info, expired }) => {
			if (cancelled) return;
			if (expired || info?.claimStatus === "expired") setState({ status: "expired" });
			else if (!info) setState({ status: "not-found" });
			else setState({ status: "ready", token: runtimeToken, info });
		});

		return () => {
			cancelled = true;
		};
	}, [runtimeToken]);

	if (state.status === "loading") {
		return (
			<PageShell maxWidth="xl">
				<ClaimHeader />
				<div className="border border-white/10 bg-[#08080a]/70 backdrop-blur-sm rounded-sm p-5 md:p-6 text-center text-sm text-white/50">
					{t("claim.page.loading")}
				</div>
			</PageShell>
		);
	}

	if (state.status === "expired") return <Expired />;
	if (state.status === "not-found") return <NotFound />;

	return (
		<PageShell maxWidth="xl">
			<ClaimHeader />
			<ClaimFlow claimToken={state.token} initialInfo={state.info} />
		</PageShell>
	);
}

function Expired() {
	const { t } = useTranslation();
	return <CenteredMessage title={t("claim.page.expiredTitle")} sub={t("claim.page.expiredSub")} />;
}

function NotFound() {
	const { t } = useTranslation();
	return <CenteredMessage title={t("claim.page.notFoundTitle")} sub={t("claim.page.notFoundSub")} />;
}

function CenteredMessage({ title, sub }: { title: string; sub: string }) {
	const { t } = useTranslation();
	return (
		<PageShell maxWidth="xl">
			<div className="mb-8">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white/70 transition-colors"
				>
					<ArrowLeft className="w-3 h-3" />
					{t("claim.page.back")}
				</Link>
			</div>
			<div className="border border-white/10 bg-[#08080a]/70 backdrop-blur-sm rounded-sm p-5 md:p-6 text-center">
				<div className="text-lg md:text-xl">{title}</div>
				<div className="text-sm text-white/50 mt-3">{sub}</div>
			</div>
		</PageShell>
	);
}
