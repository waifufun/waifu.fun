"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/contexts/locale-context";

type Props = {
	penaltyBps: bigint | null;
};

export function LaunchTerms({ penaltyBps }: Props) {
	const { t } = useTranslation();
	const penaltyPct = penaltyBps !== null ? Number(penaltyBps) / 100 : 5;
	const pctStr = String(penaltyPct);
	const items: { title: string; body: string }[] = [
		{
			title: t("launch.terms.fcfsTitle"),
			body: t("launch.terms.fcfsBody"),
		},
		{
			title: t("launch.terms.penaltyTitle", { pct: pctStr }),
			body: t("launch.terms.penaltyBody", { pct: pctStr }),
		},
		{
			title: t("launch.terms.fullRefundTitle"),
			body: t("launch.terms.fullRefundBody"),
		},
		{
			title: t("launch.terms.riskTitle"),
			body: t("launch.terms.riskBody"),
		},
	];

	return (
		<Card className="border-white/10 bg-[#08080a] py-0">
			<CardHeader className="border-b border-white/10 px-6 py-5">
				<CardTitle className="text-base font-semibold text-zinc-100">{t("launch.terms.title")}</CardTitle>
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
