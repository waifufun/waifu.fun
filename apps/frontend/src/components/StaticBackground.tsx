/**
 * Static full-page background layer. Creates a premium dark gallery atmosphere
 * with subtle directional lighting from above — like museum track lighting.
 * The effect should be nearly imperceptible; just enough to prevent dead-black monotony.
 */
export default function StaticBackground() {
	return (
		<div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
			{/* Base: solid dark */}
			<div className="absolute inset-0" style={{ backgroundColor: "#08080a" }} />

			{/* Gallery lighting layer */}
			<div
				className="absolute inset-0"
				style={{
					background: [
						// Top-center warm light — gallery track lighting effect
						"radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,250,0.03), transparent 60%)",
						// Subtle ambient fill from upper-center
						"radial-gradient(ellipse 100% 60% at 50% 35%, rgba(200,200,210,0.012), transparent 55%)",
						// Vertical fade — darkens toward bottom for depth
						"linear-gradient(180deg, transparent 0%, rgba(8,8,10,0.25) 100%)",
					].join(", "),
				}}
			/>
		</div>
	);
}
