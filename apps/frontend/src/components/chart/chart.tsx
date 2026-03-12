"use client";

import { useState } from "react";
import LocalChart from "./local-chart";
import { getCoinGeckoChainName } from "../../lib/utils";
import type { IToken } from "@waifufun/types";

interface ChartProps {
	token: IToken;
}

export default function Chart({ token }: ChartProps) {
	const tokenWithPool = token as IToken & { pool?: string };
	const isMigrated = token?.status === "migrated" || token?.status === "locked" || token?.status === "finalized";
	const curveCompleted = (token?.curveCompleted && isMigrated) || token?.imported;
	const geckoChainName =
		token.chain === "evm" && Number(token.chainId) === 56
			? "bsc"
			: getCoinGeckoChainName(token.chain, token.chainId);
	const geckoPoolAddress = tokenWithPool?.pool;
	const canRenderGeckoTerminal = Boolean(curveCompleted && geckoChainName && geckoPoolAddress);

	const [iframeLoaded, setIframeLoaded] = useState(false);

	if (canRenderGeckoTerminal) {
		return (
			<div className="relative min-h-[240px] sm:min-h-[320px] md:min-h-[420px] lg:min-h-[580px] w-full">
				{!iframeLoaded && (
					<div className="absolute inset-0 flex items-center justify-center rounded-sm bg-[#08080a] border border-[rgba(255,255,255,0.06)]">
						<div className="flex flex-col items-center gap-3">
							<div className="h-5 w-5 animate-spin rounded-full border-2 border-[#71717a] border-t-[#00ff87]" />
							<span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#71717a]">
								loading chart
							</span>
						</div>
					</div>
				)}
				<iframe
					height="100%"
					width="100%"
					className="min-h-[240px] sm:min-h-[320px] md:min-h-[420px] lg:min-h-[580px] w-full h-full mb-[-41px] rounded-sm"
					id="geckoterminal-embed"
					title="GeckoTerminal Embed"
					src={`https://www.geckoterminal.com/${geckoChainName}/pools/${geckoPoolAddress}?embed=1&info=0&swaps=0&grayscale=1&light_chart=0&chart_type=price&resolution=1m`}
					allow="clipboard-write"
					allowFullScreen
					loading="lazy"
					onLoad={() => setIframeLoaded(true)}
				/>
			</div>
		);
	}

	return <LocalChart token={token} />;
}
