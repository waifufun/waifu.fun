"use client";

import dynamic from "next/dynamic";

const GlitchBg = dynamic(() => import("@/components/landing/glitch-bg"), {
	ssr: false,
});

/**
 * ClaimBackground
 *
 * Ambient texture for the /claim page. Stays dark (the brand is a
 * black surface) but adds just enough character to feel intentional:
 *   1. a very low-opacity katakana glitch grid (GlitchBg) — tinted
 *      cyber-green so it nods to the landing hero without competing
 *   2. a ~5% opacity pass of the hero background image for organic
 *      grain and warmth
 *   3. a radial mask that fades the texture out toward the corners,
 *      keeping focus centered on the claim card
 *
 * Everything is `fixed inset-0 pointer-events-none` and sits at z=0
 * below the page content (which should live at z >= 10).
 */
export default function ClaimBackground() {
	return (
		<div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
			{/* base: pure black so accidental bleed-through still reads as the brand surface */}
			<div className="absolute inset-0 bg-black" />

			{/* layer 1: very subtle katakana glitch, tinted dark green */}
			<div
				className="absolute inset-0 opacity-[0.07]"
				style={{
					maskImage: "radial-gradient(ellipse at 50% 40%, black 0%, black 35%, transparent 80%)",
					WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black 0%, black 35%, transparent 80%)",
				}}
			>
				<GlitchBg glitchColors={["#0a1a12", "#14532d", "#22c55e"]} glitchSpeed={120} smooth />
			</div>

			{/* layer 2: hero image echo, darkened + low opacity for organic grain */}
			<div
				className="absolute inset-0 opacity-[0.05]"
				style={{
					backgroundImage: "url(/brand/backgrounds/hero-bg-v2.webp)",
					backgroundSize: "cover",
					backgroundPosition: "center",
					filter: "saturate(0.5) brightness(0.8)",
					maskImage: "radial-gradient(ellipse at 50% 30%, black 0%, transparent 75%)",
					WebkitMaskImage: "radial-gradient(ellipse at 50% 30%, black 0%, transparent 75%)",
				}}
			/>

			{/* layer 3: vignette — push the corners fully black again */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse at 50% 35%, transparent 30%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.95) 100%)",
				}}
			/>

			{/* layer 4: 1px scanline hairline — almost invisible but adds tech-feel */}
			<div
				className="absolute inset-0 opacity-[0.025]"
				style={{
					backgroundImage:
						"repeating-linear-gradient(0deg, rgba(34,197,94,0.4) 0px, rgba(34,197,94,0.4) 1px, transparent 1px, transparent 3px)",
				}}
			/>
		</div>
	);
}
