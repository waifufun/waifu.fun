"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
	penaltyBps: bigint | null;
};

export function LaunchTerms({ penaltyBps }: Props) {
	const penaltyPct = penaltyBps !== null ? Number(penaltyBps) / 100 : 5;
	const items: { title: string; body: string }[] = [
		{
			title: "24h round, fcfs",
			body: "deposits are accepted until the cap is hit or the round window closes, whichever comes first. allocations are pro-rata across all backers at the snapshot taken when the round closes.",
		},
		{
			title: `${penaltyPct}% withdrawal penalty`,
			body: `you can withdraw any time during the open window. ${penaltyPct}% of the withdrawn amount is forfeited to the bonus pool, which is added to the bundle at launch.`,
		},
		{
			title: "refund if cap not hit",
			body: "if the round closes and the floor was not reached, deposits are refundable in full. no penalty is applied to refunds outside the window.",
		},
		{
			title: "risks",
			body: "trading agent tokens carries risk of total loss. presale rounds rely on the on-chain launch flow executing cleanly. do your own research and never deposit more than you can lose.",
		},
	];

	return (
		<Card className="border-white/10 bg-[#08080a] py-0">
			<CardHeader className="border-b border-white/10 px-6 py-5">
				<CardTitle className="text-base font-semibold text-zinc-100">launch terms</CardTitle>
			</CardHeader>
			<CardContent className="space-y-5 px-6 py-6">
				{items.map((item) => (
					<div key={item.title}>
						<div className="mb-1 text-sm font-medium text-zinc-100">{item.title}</div>
						<p className="text-sm leading-relaxed text-zinc-400">{item.body}</p>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
