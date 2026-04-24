"use client";

import dynamic from "next/dynamic";

const GlitchBg = dynamic(() => import("@/components/landing/glitch-bg"), {
	ssr: false,
});

/**
 * StaticBackground
 *
 * Global ambient texture for every page. The surface reads as pure
 * black at a distance but has subtle character up close.
 *
 * Stacked layers (all `fixed inset-0 pointer-events-none` at z=0):
 *   1. base — solid #000 so SSR paints before the client layers mount
 *   2. katakana glitch @ 7% opacity, tinted cyber-green, radial-masked
 *      so it fades out toward edges. Speed is slowed (120ms) so the
 *      effect drifts rather than strobes.
 *   3. hero background image echo @ 5% opacity with crushed saturation
 *      for organic grain + warmth
 *   4. radial vignette — pushes corners back to near-black so content
 *      at the center of the viewport always sits on a dark spot
 *   5. 3px cyber-green scanlines @ 2.5% — almost invisible, adds just
 *      enough tech-UI feel to feel intentional
 *
 * Pages can place their own content at z=10+ to sit above this layer.
 *
 * The landing hero has its own foreground GlitchBg rendered at higher
 * opacity + full canvas, so pages that opt into a more dramatic look
 * can still do it. This layer is the quiet baseline.
 */
export default function StaticBackground() {
	return (
		<div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
			{/* base: solid black so SSR is stable before GlitchBg hydrates */}
			<div className="absolute inset-0 bg-black" />

			{/* layer 1: katakana glitch, heavily muted + radial-masked */}
			<div
				className="absolute inset-0 opacity-[0.07]"
				style={{
					maskImage: "radial-gradient(ellipse at 50% 40%, black 0%, black 35%, transparent 80%)",
					WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, black 0%, black 35%, transparent 80%)",
				}}
			>
				<GlitchBg glitchColors={["#0a1a12", "#14532d", "#00ff87"]} glitchSpeed={120} smooth />
			</div>

			{/* layer 2: hero image echo for grain + warmth */}
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

			{/* layer 3: vignette — edges fall off to near-black */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse at 50% 35%, transparent 30%, rgba(0,0,0,0.6) 70%, rgba(0,0,0,0.95) 100%)",
				}}
			/>

			{/* layer 4: 3px scanlines, almost invisible */}
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
