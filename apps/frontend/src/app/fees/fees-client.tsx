"use client";

import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { useTranslation } from "@/contexts/locale-context";

type FeeRow = {
	label: string;
	value: string;
	note?: string;
};

export function FeesPageClient() {
	const { t } = useTranslation();

	const PRE_GRAD: FeeRow[] = [
		{
			label: t("launch.fees.rows.deployLabel"),
			value: t("launch.fees.rows.deployValue"),
			note: t("launch.fees.rows.deployNote"),
		},
		{
			label: t("launch.fees.rows.tradeCurveLabel"),
			value: t("launch.fees.rows.tradeCurveValue"),
			note: t("launch.fees.rows.tradeCurveNote"),
		},
		{
			label: t("launch.fees.rows.graduationLabel"),
			value: t("launch.fees.rows.graduationValue"),
			note: t("launch.fees.rows.graduationNote"),
		},
	];

	const POST_GRAD: FeeRow[] = [
		{
			label: t("launch.fees.rows.buySellTaxLabel"),
			value: t("launch.fees.rows.buySellTaxValue"),
			note: t("launch.fees.rows.buySellTaxNote"),
		},
		{
			label: t("launch.fees.rows.splitterLabel"),
			value: t("launch.fees.rows.splitterValue"),
			note: t("launch.fees.rows.splitterNote"),
		},
	];

	const LP_CLAIM: FeeRow[] = [
		{
			label: t("launch.fees.rows.tiersLabel"),
			value: t("launch.fees.rows.tiersValue"),
			note: t("launch.fees.rows.tiersNote"),
		},
		{
			label: t("launch.fees.rows.tierSplitLabel"),
			value: t("launch.fees.rows.tierSplitValue"),
			note: t("launch.fees.rows.tierSplitNote"),
		},
	];

	return (
		<PageShell maxWidth="narrow">
			<PageHeader
				eyebrow={t("launch.fees.eyebrow")}
				title={t("launch.fees.title")}
				subtitle={t("launch.fees.subtitle")}
			/>

			<div className="space-y-12">
				<FeeBlock title={t("launch.fees.preGradTitle")} subtitle={t("launch.fees.preGradSubtitle")} rows={PRE_GRAD} />
				<FeeBlock
					title={t("launch.fees.postGradTitle")}
					subtitle={t("launch.fees.postGradSubtitle")}
					rows={POST_GRAD}
				/>
				<FeeBlock title={t("launch.fees.lpClaimTitle")} subtitle={t("launch.fees.lpClaimSubtitle")} rows={LP_CLAIM} />
			</div>

			<p className="mt-16 text-xs text-neutral-500 leading-relaxed max-w-[58ch]">{t("launch.fees.footnote")}</p>
		</PageShell>
	);
}

function FeeBlock({ title, subtitle, rows }: { title: string; subtitle: string; rows: FeeRow[] }) {
	return (
		<section className="border border-white/10 bg-[#08080a]">
			<header className="border-b border-white/10 px-6 py-5">
				<h2 className="text-base md:text-lg text-white tracking-tight">{title}</h2>
				<p className="mt-1 text-xs text-neutral-500 leading-relaxed">{subtitle}</p>
			</header>
			<dl className="divide-y divide-white/10">
				{rows.map((row) => (
					<div
						key={row.label}
						className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-2 md:gap-6 px-6 py-5 items-baseline"
					>
						<div>
							<dt className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/55">{row.label}</dt>
							{row.note ? (
								<p className="mt-1.5 text-xs text-neutral-500 leading-relaxed max-w-[52ch]">{row.note}</p>
							) : null}
						</div>
						<dd className="font-mono text-sm md:text-base text-[#00ff87] tabular-nums tracking-tight md:text-right">
							{row.value}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
