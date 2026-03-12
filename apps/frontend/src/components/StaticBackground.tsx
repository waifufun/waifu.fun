/**
 * Static full-page background layer. Keeps a dark first paint, then adds a very
 * low-contrast atmospheric field so pages do not sit on a dead black void.
 */
export default function StaticBackground() {
	return (
		<div className="fixed inset-0 z-0 pointer-events-none overflow-hidden" aria-hidden>
			<div className="absolute inset-0" style={{ backgroundColor: "#08080a" }} />
			<div
				className="absolute inset-x-0 top-0 h-[42rem]"
				style={{
					background:
						"radial-gradient(circle at 18% 18%, rgba(0,255,135,0.09), transparent 28%), linear-gradient(180deg, rgba(8,8,10,0) 0%, rgba(8,8,10,0.18) 65%, rgba(8,8,10,0.42) 100%)",
				}}
			/>
		</div>
	);
}
