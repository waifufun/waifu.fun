"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "@/contexts/locale-context";
import type { LaunchTierInfo } from "@/lib/launch-vault/tiers";
import { cn } from "@/lib/utils";

import { type FaqItem, buildLaunchFaq } from "./launch-faq-data";

type Props = {
	tier: LaunchTierInfo;
};

/**
 * "What happens at launch" FAQ. Inline accordion below the deposit widget on
 * desktop, full-width on mobile. Copy is tier-aware so SMOL doesn't
 * mention pcs v2 graduation or vesting.
 */
export function LaunchFAQ({ tier }: Props) {
	const { t } = useTranslation();
	const items: FaqItem[] = buildLaunchFaq(tier);
	const [openIdx, setOpenIdx] = useState<number | null>(0);

	return (
		<Card className="border-white/10 bg-[#08080a] py-0">
			<CardHeader className="border-b border-white/10 px-6 py-5">
				<CardTitle className="text-base font-semibold text-zinc-100">{t("launch.faq.title")}</CardTitle>
			</CardHeader>
			<CardContent className="px-2 py-2">
				<ul className="divide-y divide-white/5">
					{items.map((item, idx) => {
						const open = openIdx === idx;
						const panelId = `launch-faq-panel-${idx}`;
						const btnId = `launch-faq-trigger-${idx}`;
						const question = t(item.qKey);
						const answer = t(item.aKey, item.params);
						return (
							<li key={item.qKey}>
								<button
									id={btnId}
									type="button"
									aria-expanded={open}
									aria-controls={panelId}
									onClick={() => setOpenIdx(open ? null : idx)}
									className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-zinc-200 transition-colors hover:bg-white/[0.02]"
								>
									<span className="font-medium">{question}</span>
									<ChevronDown
										aria-hidden
										className={cn(
											"size-4 shrink-0 text-zinc-500 transition-transform duration-200",
											open && "rotate-180 text-zinc-300",
										)}
									/>
								</button>
								<section
									id={panelId}
									aria-labelledby={btnId}
									hidden={!open}
									className="px-4 pb-4 pt-0 text-[13px] leading-relaxed text-zinc-400"
								>
									{answer}
								</section>
							</li>
						);
					})}
				</ul>
			</CardContent>
		</Card>
	);
}
