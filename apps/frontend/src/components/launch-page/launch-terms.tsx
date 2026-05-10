"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
	penaltyBps: bigint | null;
};

export function LaunchTerms({ penaltyBps }: Props) {
	const penaltyPct = penaltyBps !== null ? Number(penaltyBps) / 100 : 5;
	const items: { title: string; body: string }[] = [
		{
			title: "24h round, first-come-first-served",
			body: "deposits accepted until cap hits or window closes, whichever comes first. allocations are pro-rata across all backers at the close snapshot.",
		},
		{
			title: `${penaltyPct}% withdraw penalty`,
			body: `withdraw any time during the open window. ${penaltyPct}% of the withdrawn amount stays in the bonus pool and gets added to the bundle at launch.`,
		},
		{
			title: "full refund if cap not hit",
			body: "if the round closes and the floor isn't reached, your deposit is refundable in full. no penalty.",
		},
		{
			title: "risk",
			body: "agent tokens are risky. presale rounds depend on the on-chain launch flow executing cleanly. do your own research. never deposit more than you can lose.",
		},
	];

	return (
		<Card className="border-white/10 bg-[#08080a] py-0">
			<CardHeader className="border-b border-white/10 px-6 py-5">
				<CardTitle className="text-base font-semibold text-zinc-100">terms</CardTitle>
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
