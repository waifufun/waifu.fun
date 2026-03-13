"use client";

import type { ChartTimeframe } from "@/lib/api";
import type { IToken } from "@waifufun/types";
import { useEffect, useMemo, useState } from "react";
import { getCoinGeckoChainName } from "../../lib/utils";
import LocalChart from "./local-chart";

interface ChartProps {
	token: IToken;
	timeframe?: ChartTimeframe;
}

const getGeckoResolution = (timeframe: ChartTimeframe = "1d") => {
	switch (timeframe) {
		case "1m":
		case "5m":
		case "15m":
			return timeframe;
		case "1h":
			return "5m";
		case "4h":
			return "15m";
		case "1d":
			return "1h";
		case "1w":
			return "4h";
		case "all":
			return "1d";
		default:
			return "1h";
	}
};

const isExternalPoolAddress = (value: unknown) => {
	const normalizedValue = String(value ?? "").trim();
	return /^0x[a-fA-F0-9]{40}$/.test(normalizedValue) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(normalizedValue);
};

export default function Chart({ token, timeframe = "1d" }: ChartProps) {
	const tokenWithPool = token as IToken & { pool?: string };
	const isMigrated =
		token?.status === "migrated" ||
		token?.status === "dex" ||
		token?.status === "locked" ||
		token?.status === "finalized";
	const geckoChainName =
		token.chain === "evm" && Number(token.chainId) === 56 ? "bsc" : getCoinGeckoChainName(token.chain, token.chainId);
	const geckoPoolAddress = isExternalPoolAddress(tokenWithPool?.pool) ? String(tokenWithPool.pool).trim() : null;
	const canRenderGeckoTerminal = Boolean(
		geckoChainName && geckoPoolAddress && (isMigrated || token?.imported || token?.curveCompleted),
	);
	const geckoResolution = getGeckoResolution(timeframe);
	const geckoSrc = useMemo(
		() =>
			`https://www.geckoterminal.com/${geckoChainName}/pools/${geckoPoolAddress}?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=${geckoResolution}`,
		[geckoChainName, geckoPoolAddress, geckoResolution],
	);

	const [loadedGeckoSrc, setLoadedGeckoSrc] = useState<string | null>(null);
	const iframeLoaded = loadedGeckoSrc === geckoSrc;

	useEffect(() => {
		setLoadedGeckoSrc((currentLoadedSrc) => (currentLoadedSrc === geckoSrc ? currentLoadedSrc : null));
	}, [geckoSrc]);

	if (canRenderGeckoTerminal) {
		return (
			<div className="relative min-h-[240px] sm:min-h-[320px] md:min-h-[420px] lg:min-h-[580px] w-full">
				{!iframeLoaded && (
					<div className="absolute inset-0 flex items-center justify-center rounded-sm bg-[#08080a] border border-[rgba(255,255,255,0.06)]">
						<div className="flex flex-col items-center gap-3">
							<div className="h-5 w-5 animate-spin rounded-full border-2 border-[#71717a] border-t-[#00ff87]" />
							<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717a]">loading chart</span>
						</div>
					</div>
				)}
				<iframe
					key={geckoSrc}
					height="100%"
					width="100%"
					className="min-h-[240px] sm:min-h-[320px] md:min-h-[420px] lg:min-h-[580px] w-full h-full mb-[-41px] rounded-sm"
					id="geckoterminal-embed"
					title="GeckoTerminal Embed"
					src={geckoSrc}
					allow="clipboard-write"
					allowFullScreen
					loading="lazy"
					onLoad={() => setLoadedGeckoSrc(geckoSrc)}
				/>
			</div>
		);
	}

	return <LocalChart token={token} timeframe={timeframe} />;
}
