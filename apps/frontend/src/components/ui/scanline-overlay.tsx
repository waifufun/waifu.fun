"use client";

/**
 * ScanlineOverlay
 * Fixed CRT scanline effect over the entire viewport.
 * Very subtle (0.015 opacity) — adds texture without impacting readability.
 * Respects prefers-reduced-motion: disables the overlay for users who prefer no motion.
 */
export function ScanlineOverlay() {
	return (
		<div
			aria-hidden="true"
			style={{
				position: "fixed",
				inset: 0,
				pointerEvents: "none",
				zIndex: 50,
				backgroundImage:
					"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,135,0.015) 2px, rgba(0,255,135,0.015) 4px)",
				mixBlendMode: "overlay",
			}}
			className="motion-reduce:hidden"
		/>
	);
}

export default ScanlineOverlay;
