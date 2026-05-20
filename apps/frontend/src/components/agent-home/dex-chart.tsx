"use client";

/**
 * DexScreener chart embed.
 *
 * Uses DexScreener's public embed URL format. Works on BSC with the token
 * address: DexScreener auto-finds the highest-liquidity pair and renders
 * a lightweight chart iframe (no backend work needed).
 *
 * Docs: https://docs.dexscreener.com/api/reference#embed
 *
 * If the token has no pair yet (pre-graduation, pre-migration, or not
 * indexed), the iframe renders a "pair not found" screen. We render a
 * minimal empty state instead to keep the page clean.
 */

export default function DexChart({
	tokenAddress,
	graduated,
}: {
	tokenAddress: string;
	graduated: boolean;
}) {
	if (!graduated) {
		// Pre-graduation the token trades on the FLAP bonding curve.
		// DexScreener won't have a pair until the curve fills + migrates to
		// PancakeSwap. Show an informational state rather than a broken iframe.
		return (
			<div className="border border-white/10 bg-[#08080a] rounded-sm p-6 text-xs font-mono uppercase tracking-[0.16em] text-white/40">
				chart available after curve fills + migrates to pancake
			</div>
		);
	}

	const src = `https://dexscreener.com/bsc/${tokenAddress.toLowerCase()}?embed=1&theme=dark&trades=0&info=0`;

	return (
		<div className="border border-white/10 bg-[#08080a] rounded-sm overflow-hidden">
			<iframe src={src} className="w-full h-[420px] border-0" title="price chart" loading="lazy" />
		</div>
	);
}
