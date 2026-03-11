/**
 * Static full-page background layer. Keeps a dark first paint, then adds a very
 * low-contrast atmospheric field so pages do not sit on a dead black void.
 */
export default function StaticBackground() {
	return (
		<div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
			<div className="absolute inset-0" style={{ backgroundColor: "#08080a" }} />
			<div
				className="absolute inset-0 opacity-[0.12]"
				style={{
					backgroundImage: "url('/brand/backgrounds/hero-bg.webp')",
					backgroundSize: "cover",
					backgroundPosition: "center top",
					backgroundRepeat: "no-repeat",
				}}
			/>
			<div
				className="absolute inset-0"
				style={{
					background: [
						"radial-gradient(circle at 18% 16%, rgba(0,255,135,0.08), transparent 32%)",
						"radial-gradient(circle at 82% 14%, rgba(120,140,255,0.05), transparent 26%)",
						"linear-gradient(180deg, rgba(8,8,10,0.08) 0%, rgba(8,8,10,0.18) 52%, rgba(8,8,10,0.4) 100%)",
					].join(", "),
				}}
			/>
		</div>
	);
}
