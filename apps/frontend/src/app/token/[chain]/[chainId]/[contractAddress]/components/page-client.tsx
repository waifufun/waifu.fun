"use client";
import Swap from "@/components/swap";
import TokenTabs from "@/components/token-page/token-tabs";
import AgentProfile from "@/components/token-page/agent-profile";
import { AgentPersonalityCard, AgentSkills } from "@/components/token-page/agent-skills";
import { getToken } from "@/lib/api";
import type { IToken, ITokenLookUp } from "@waifufun/types";
import BondingCurveProgress from "@/components/bonding-curve-progress";
import { type ReactNode, useMemo, useState } from "react";
import ScamWarning from "@/components/scam-notice";
import { useQuery } from "@tanstack/react-query";
import Chart from "@/components/chart/chart";
import useAddress from "@/hooks/use-address";
import ClaimFees from "@/components/claim-fees";
import UpdateSocialsModal from "./UpdateSocialsModal";
import { Button } from "@/components/ui/button";

export default function PageClient({
	initialData,
	tokenParams,
	children,
}: { initialData: IToken; children: ReactNode; tokenParams: ITokenLookUp }) {
	const query = useQuery({
		queryKey: ["token", initialData.chain, initialData.chainId, initialData.contractAddress],
		queryFn: async () => {
			try {
				const token = (await getToken(tokenParams)) as IToken;
				return token;
			} catch (e) {
				console.warn("API fetch failed, using initial data:", e);
				return initialData;
			}
		},
		refetchInterval: process.env.NEXT_PUBLIC_API_URL ? 5_000 : false,
		initialData,
	});

	const currentAddress = useAddress();
	const token = query?.data;
	const isCreator = useMemo(() => {
		if (currentAddress && token?.creator) {
			return currentAddress.toLowerCase() === token.creator.toLowerCase();
		}
		return false;
	}, [currentAddress, token?.creator]);

	const getBadgeInfo = () => {
		if (initialData?.status === "migrating") {
			return {
				badge: "MIGRATING",
				classes: "bg-orange-400/80 hover:bg-orange-400/50 text-white border border-orange-400/50",
			};
		}
		if (initialData?.status === "migrated" || initialData?.status === "locked") {
			return {
				badge: "BONDED",
				classes:
					"bg-[#00ff87]/15 hover:bg-[#00ff87]/25 text-[#00ff87] border border-[#00ff87]/40 shadow-[0_0_8px_rgba(0,255,135,0.2)] py-0.5 px-1.5 text-[9px] sm:text-[10px]",
			};
		}
		if (initialData?.imported) {
			return {
				badge: "IMPORTED",
				classes: "bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/40",
			};
		}
		return {
			badge: "ACTIVE",
			classes:
				"bg-[#00ff87]/15 hover:bg-[#00ff87]/25 text-[#00ff87] border border-[#00ff87]/40 py-0.5 px-1.5 text-[9px] sm:text-[10px]",
		};
	};

	const badge = getBadgeInfo();
	const badgeBaseClasses =
		"font-bold uppercase tracking-wider rounded-sm text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1";

	const [socialsModalOpen, setSocialsModalOpen] = useState(false);

	return (
		<div className="flex flex-col gap-5 mt-3 container">
			<ScamWarning isHidden={!!token?.hidden} />

			{/* agent profile hero */}
			<AgentProfile
				token={token}
				badge={badge}
				badgeBaseClasses={badgeBaseClasses}
			/>

			{/* two-column layout */}
			<div className="flex flex-col lg:flex-row lg:flex-nowrap gap-5">
				{/* left column — chart + activity + tabs */}
				<div className="w-full lg:w-[65%] flex flex-col gap-5 order-3 lg:order-2">
					{/* chart */}
					<div className="bg-[#111114] border border-[rgba(255,255,255,0.06)] p-3 rounded-sm">
						<div className="overflow-hidden">
							<Chart token={token} />
						</div>
					</div>

					{/* tabs + content */}
					<div className="flex flex-col gap-4">
						<TokenTabs token={token} />
						{children}
					</div>
				</div>

				{/* right column — sidebar */}
				<div className="w-full lg:w-[35%] flex flex-col md:flex-row lg:flex-col gap-5 order-2 lg:order-3">
					<Swap token={token} />

					{/* bonding curve + token info */}
					<div className="bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4">
						<BondingCurveProgress token={token} />
					</div>

					{/* agent personality */}
					<AgentPersonalityCard token={token} />

					{/* agent skills */}
					<AgentSkills />

					{/* owner-only update socials */}
					{isCreator && (
						<div className="bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4">
							<Button
								variant="outline"
								className="w-full"
								onClick={() => setSocialsModalOpen(true)}
							>
								update socials
							</Button>
							<UpdateSocialsModal
								open={socialsModalOpen}
								onClose={() => setSocialsModalOpen(false)}
								token={{
									chain: token.chain,
									chainId: String(token.chainId),
									contractAddress: token.contractAddress,
									socials: token.socials,
								}}
								onSuccess={() => {
									setSocialsModalOpen(false);
									query.refetch();
								}}
							/>
						</div>
					)}
				</div>
			</div>

			{isCreator && !token?.imported && token?.status !== "active" && <ClaimFees token={token} />}
		</div>
	);
}
