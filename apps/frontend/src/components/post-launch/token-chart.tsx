"use client";

import { useEffect } from "react";

/**
 * DEXScreener chart embed for the post-launch surface (W50).
 *
 * Renders an iframe pointing at the highest-liquidity bsc pair for the
 * agent token. DEXScreener auto-resolves the best pair when only the
 * token address is supplied, so we don't need a backend lookup; once a
 * pair address is known (via `usePostLaunchMarket`) we point at it
 * directly for a deterministic chart.
 *
 * The existing `<DexChart />` is kept around for the legacy /agent flow
 * (token-only, post-graduation). This component is the W50 successor:
 * pair-aware, header copy, and shows an open-in-dexscreener affordance.
 */

type Props = {
	tokenAddress: string;
	pairAddress: string | null | undefined;
	pairUrl: string | null | undefined;
};

export function TokenChart({ tokenAddress, pairAddress, pairUrl }: Props) {
	const target = pairAddress ?? tokenAddress.toLowerCase();
	const src = `https://dexscreener.com/bsc/${target}?embed=1&theme=dark&trades=0&info=0`;
	const link = pairUrl ?? `https://dexscreener.com/bsc/${tokenAddress.toLowerCase()}`;

	// Pre-warm the iframe origin so the first paint isn't gated on DNS.
	useEffect(() => {
		const tag = document.createElement("link");
		tag.rel = "preconnect";
		tag.href = "https://dexscreener.com";
		document.head.appendChild(tag);
		return () => {
			document.head.removeChild(tag);
		};
	}, []);

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			<div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
				<div className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">price chart</div>
				<a
					href={link}
					target="_blank"
					rel="noreferrer"
					className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 hover:text-[#00ff87] transition-colors"
				>
					dexscreener
				</a>
			</div>
			<iframe src={src} title="price chart" className="w-full h-[420px] border-0" loading="lazy" />
		</div>
	);
}
