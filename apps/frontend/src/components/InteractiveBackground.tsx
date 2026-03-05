"use client";

export default function InteractiveBackground() {
	return (
		<>
			{/* Gradient orbs for atmosphere */}
			<div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
				{/* Warm amber orb - top right */}
				<div
					className="absolute -top-[20%] -right-[10%] w-[600px] h-[600px] rounded-full opacity-[0.07]"
					style={{
						background: "radial-gradient(circle, #E8762D 0%, transparent 70%)",
					}}
				/>
				{/* Cool blue orb - bottom left */}
				<div
					className="absolute -bottom-[20%] -left-[10%] w-[500px] h-[500px] rounded-full opacity-[0.05]"
					style={{
						background: "radial-gradient(circle, #3B82F6 0%, transparent 70%)",
					}}
				/>
				{/* Subtle center glow */}
				<div
					className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-[0.03]"
					style={{
						background: "radial-gradient(circle, #E8762D 0%, transparent 60%)",
					}}
				/>
			</div>
			{/* Noise texture overlay */}
			<div
				className="fixed inset-0 pointer-events-none mix-blend-overlay z-[1] opacity-[0.4]"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.7' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
					backgroundRepeat: "repeat",
					backgroundSize: "256px 256px",
				}}
				aria-hidden
			/>
		</>
	);
}
