"use client";

export default function GrainOverlay() {
	return (
		<>
			{/* SVG Noise Grain Overlay */}
			<svg
				className="pointer-events-none fixed inset-0 z-[5] h-full w-full opacity-[0.07] mix-blend-overlay"
				xmlns="http://www.w3.org/2000/svg"
			>
				<title>Decorative grain overlay</title>
				<filter id="grain">
					<feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch" />
					<feColorMatrix type="saturate" values="0" />
				</filter>
				<rect width="100%" height="100%" filter="url(#grain)" />
			</svg>

			{/* CRT Scan Lines - Static */}
			<div
				className="pointer-events-none fixed inset-0 z-[5] opacity-[0.025]"
				style={{
					backgroundImage:
						"repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0, 0, 0, 0.3) 1px, rgba(0, 0, 0, 0.3) 2px)",
					backgroundSize: "100% 2px",
				}}
			/>

			{/* Animated Scan Line - Sweeping */}
			<div
				className="pointer-events-none fixed inset-0 z-[5] animate-scan-line opacity-[0.04]"
				style={{
					background: "linear-gradient(to bottom, transparent 0%, rgba(139, 92, 246, 0.1) 50%, transparent 100%)",
					height: "120px",
				}}
			/>
		</>
	);
}
