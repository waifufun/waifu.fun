/**
 * Pure message formatters per event type. No I/O, no env reads – every
 * runtime knob is passed in. Keeps the formatter unit-testable.
 */

import type { EventDetail, EventType, FormattedMessage, LaunchSnapshot } from "./types.js";

export interface FormatContext {
	frontendUrl: string | undefined;
}

const TIER_LABEL: Record<number, string> = {
	80: "T80",
	90: "T90",
	95: "T95",
	98: "T98",
};

function shortAddr(addr: string): string {
	if (addr.length <= 10) return addr;
	return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function tokenLabel(launch: LaunchSnapshot): string {
	if (launch.tokenName && launch.tokenTicker) {
		return `${launch.tokenName} ($${launch.tokenTicker})`;
	}
	if (launch.tokenTicker) return `$${launch.tokenTicker}`;
	if (launch.tokenName) return launch.tokenName;
	return shortAddr(launch.tokenAddress);
}

function formatBnb(wei: bigint, decimals = 4): string {
	if (wei === 0n) return "0";
	const ONE = 10n ** 18n;
	const whole = wei / ONE;
	const frac = wei % ONE;
	if (frac === 0n) return whole.toString();
	const fracStr = frac.toString().padStart(18, "0").slice(0, decimals).replace(/0+$/, "");
	return fracStr.length > 0 ? `${whole.toString()}.${fracStr}` : whole.toString();
}

function buildLaunchUrl(launch: LaunchSnapshot, frontendUrl: string | undefined): string | null {
	if (!frontendUrl) return null;
	return `${frontendUrl}/launch/${launch.id}`;
}

function tierLabel(tier: number): string {
	return TIER_LABEL[tier] ?? `T${tier}`;
}

function progressBps(launch: LaunchSnapshot): number {
	if (launch.presaleCap === 0n) return 0;
	const bps = Number((launch.totalDeposited * 10_000n) / launch.presaleCap);
	return Math.min(bps, 10_000);
}

function formatPercent(bps: number): string {
	return `${(bps / 100).toFixed(1)}%`;
}

export function formatMessage(
	eventType: EventType,
	detail: EventDetail,
	launch: LaunchSnapshot,
	ctx: FormatContext,
): FormattedMessage {
	const url = buildLaunchUrl(launch, ctx.frontendUrl);
	const label = tokenLabel(launch);
	const tier = tierLabel(launch.tier);

	const baseFields = [
		{ name: "Token", value: shortAddr(launch.tokenAddress) },
		{ name: "Tier", value: tier },
		{ name: "Cap", value: `${formatBnb(launch.presaleCap)} BNB` },
	];

	switch (eventType) {
		case "round_opened":
			return {
				title: `🟢 Launch round opened: ${label}`,
				description: `Presale is now accepting deposits up to ${formatBnb(launch.presaleCap)} BNB.`,
				url,
				fields: [
					...baseFields,
					{ name: "Creator", value: shortAddr(launch.creator) },
					{
						name: "Closes",
						value: new Date(Number(launch.closeTimestamp) * 1_000).toISOString(),
					},
				],
			};
		case "cap_hit":
			return {
				title: `🎯 Cap hit: ${label}`,
				description: `Presale just hit ${formatPercent(detail.kind === "cap_hit" ? detail.capBps : 10_000)} of cap. Round will close shortly.`,
				url,
				fields: [
					...baseFields,
					{ name: "Deposited", value: `${formatBnb(launch.totalDeposited)} BNB` },
					{ name: "Depositors", value: launch.depositorCount.toString() },
				],
			};
		case "launched":
			return {
				title: `🚀 Launched: ${label}`,
				description: `Token is live on V2. Pair: ${launch.v2Pair ? shortAddr(launch.v2Pair) : "tbd"}.`,
				url,
				fields: [
					...baseFields,
					{ name: "V2 Pair", value: launch.v2Pair ?? "tbd" },
					{
						name: "Launched at",
						value: launch.launchTimestamp ? new Date(Number(launch.launchTimestamp) * 1_000).toISOString() : "tbd",
					},
				],
			};
		case "tranche_deployed": {
			const trancheBps = detail.kind === "tranche_deployed" ? detail.trancheBps : 0;
			const trancheIndex = detail.kind === "tranche_deployed" ? detail.trancheIndex : 0;
			return {
				title: `📈 T${trancheIndex} hit: ${label}`,
				description: `Presale crossed the T${trancheIndex} threshold (${formatPercent(trancheBps)} of cap).`,
				url,
				fields: [
					...baseFields,
					{ name: "Deposited", value: `${formatBnb(launch.totalDeposited)} BNB` },
					{ name: "Progress", value: formatPercent(progressBps(launch)) },
					{ name: "Tranche", value: `T${trancheIndex} (${formatPercent(trancheBps)})` },
				],
			};
		}
		case "summary_24h":
			return {
				title: `📊 24h summary: ${label}`,
				description: "Twenty-four hours after launch. Posting numbers for the record.",
				url,
				fields: [
					...baseFields,
					{ name: "Total deposited", value: `${formatBnb(launch.totalDeposited)} BNB` },
					{ name: "Depositors", value: launch.depositorCount.toString() },
					{ name: "V2 Pair", value: launch.v2Pair ?? "tbd" },
				],
			};
	}
}
