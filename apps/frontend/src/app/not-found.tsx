"use client";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/contexts/locale-context";
import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
	const { t } = useTranslation();
	return (
		<main className="flex min-h-[80vh] items-center justify-center px-5 py-16">
			<div className="flex max-w-lg flex-col items-center gap-6 text-center">
				<Image src="/404.png" width={495} height={100} unoptimized priority alt={t("errors.notFoundImageAlt")} />
				<div className="text-[11px] font-mono uppercase tracking-[0.24em] text-[#00ff87]">
					{t("errors.notFoundEyebrow")}
				</div>
				<div className="space-y-3">
					<h1 className="text-3xl font-semibold tracking-tight text-white">{t("errors.notFoundTitle")}</h1>
					<p className="text-sm leading-relaxed text-[#a1a1aa]">{t("errors.notFoundBody")}</p>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row">
					<Button asChild className="min-h-11 bg-[#00ff87] px-5 text-black hover:bg-[#00ff87]/90">
						<Link href="/launches">{t("errors.notFoundBrowseLaunches")}</Link>
					</Button>
					<Button asChild variant="outline" className="min-h-11 px-5">
						<Link href="/agents">{t("errors.notFoundBrowseAgents")}</Link>
					</Button>
				</div>
			</div>
		</main>
	);
}
