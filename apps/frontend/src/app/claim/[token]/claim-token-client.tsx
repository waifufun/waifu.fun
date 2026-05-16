"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import ClaimFlow from "@/components/claim/claim-flow";
import ClaimHeader from "@/components/claim/claim-header";
import { type ClaimInfo, fetchClaimInfo } from "@/lib/claim-api";

type LoadState =
	| { status: "loading" }
	| { status: "expired" }
	| { status: "not-found" }
	| { status: "ready"; token: string; info: ClaimInfo };

export default function ClaimTokenClient({ token }: { token: string }) {
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
			<div className="mx-auto w-full max-w-xl px-5 md:px-8 pt-10 pb-24">
				<ClaimHeader />
				<div className="border border-white/10 bg-[#08080a]/70 backdrop-blur-sm rounded-sm p-8 text-center text-sm text-white/50">
					loading…
				</div>
			</div>
		);
	}

	if (state.status === "expired") return <Expired />;
	if (state.status === "not-found") return <NotFound />;

	return (
		<div className="mx-auto w-full max-w-xl px-5 md:px-8 pt-10 pb-24">
			<ClaimHeader />
			<ClaimFlow claimToken={state.token} initialInfo={state.info} />
		</div>
	);
}

function Expired() {
	return <CenteredMessage title="this claim link has expired or is invalid." sub="ask the agent for a new one." />;
}

function NotFound() {
	return <CenteredMessage title="claim not found." sub="check that the link was copied correctly." />;
}

function CenteredMessage({ title, sub }: { title: string; sub: string }) {
	return (
		<div className="mx-auto w-full max-w-xl px-5 md:px-8 pt-10 pb-24">
			<div className="mb-8">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.2em] text-white/40 hover:text-white/70 transition-colors"
				>
					<ArrowLeft className="w-3 h-3" />
					waifu.fun
				</Link>
			</div>
			<div className="border border-white/10 bg-[#08080a]/70 backdrop-blur-sm rounded-sm p-8 text-center">
				<div className="text-lg md:text-xl">{title}</div>
				<div className="text-sm text-white/50 mt-3">{sub}</div>
			</div>
		</div>
	);
}
