"use client";

/**
 * Client component for the landing-page stats row. Server-rendered numbers
 * are passed in as props; the labels come from the i18n table so they can
 * switch with the user's locale.
 */
import { useTranslation } from "@/contexts/locale-context";

type Props = {
	totalAgents: number;
	totalVolumeDisplay: string;
	graduatedCount: number;
};

export default function ActivityStripStats({ totalAgents, totalVolumeDisplay, graduatedCount }: Props) {
	const { t } = useTranslation();

	const agentLabel = totalAgents === 1 ? t("discover.landing.agentLaunched") : t("discover.landing.agentsLaunched");

	return (
		<div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-mono uppercase tracking-[0.18em]">
			<Stat value={totalAgents.toLocaleString()} label={agentLabel} />
			<Divider />
			<Stat value={totalVolumeDisplay} label={t("discover.landing.totalVolume")} />
			<Divider />
			<Stat value={graduatedCount.toLocaleString()} label={t("discover.landing.onPancakeswap")} />
		</div>
	);
}

function Stat({ value, label }: { value: string; label: string }) {
	return (
		<div className="flex items-baseline gap-2">
			<span className="text-white/85 tracking-wider">{value}</span>
			<span className="text-white/35">{label}</span>
		</div>
	);
}

function Divider() {
	return <span className="text-white/15 hidden sm:inline">/</span>;
}
