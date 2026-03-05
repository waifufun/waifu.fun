"use client";

export default function GrainOverlay() {
	return (
		<>
			{/* Film grain texture */}
			<div 
				className="pointer-events-none fixed inset-0 z-50 opacity-[0.08] mix-blend-overlay"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4.5' numOctaves='5' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
					backgroundSize: '200px 200px',
				}}
			/>
			
			{/* CRT scan line */}
			<div 
				className="pointer-events-none fixed inset-0 z-50 opacity-[0.03]"
				style={{
					backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.03) 0px, transparent 1px, transparent 2px, rgba(255,255,255,0.03) 3px)',
				}}
			/>
			
			{/* Animated scan line */}
			<div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
				<div 
					className="absolute left-0 right-0 h-[2px] animate-scan-line opacity-[0.05]"
					style={{
						background: 'linear-gradient(to bottom, transparent, hsl(180, 40%, 65%), transparent)',
						boxShadow: '0 0 20px hsl(180, 40%, 65%)',
					}}
				/>
			</div>
		</>
	);
}
