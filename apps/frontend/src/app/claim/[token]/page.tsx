import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import ClaimBackground from "@/components/claim/claim-background";
import ClaimFlow from "@/components/claim/claim-flow";
import ClaimHeader from "@/components/claim/claim-header";
import { fetchClaimInfo } from "@/lib/claim-api";

// Don't cache — claim status can flip server-side between renders.
export const dynamic = "force-dynamic";

export default async function ClaimPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	const { info, expired } = await fetchClaimInfo(token);

	if (expired || info?.claimStatus === "expired") {
		return <Expired />;
	}
	if (!info) {
		return <NotFound />;
	}

	return (
		<div className="relative min-h-screen bg-black text-white">
			<ClaimBackground />
			<div className="relative z-10 mx-auto w-full max-w-xl px-5 md:px-8 pt-10 pb-24">
				<ClaimHeader />
				<ClaimFlow claimToken={token} initialInfo={info} />
			</div>
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
		<div className="min-h-screen bg-black text-white">
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
				<div className="border border-white/10 bg-[#08080a] rounded-sm p-8 text-center">
					<div className="text-lg md:text-xl">{title}</div>
					<div className="text-sm text-white/50 mt-3">{sub}</div>
				</div>
			</div>
		</div>
	);
}
