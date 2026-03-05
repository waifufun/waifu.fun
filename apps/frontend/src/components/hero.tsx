"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function Hero() {
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	return (
		<div className="relative w-full min-h-screen flex items-center justify-center overflow-hidden">
			{/* Animated background with grain */}
			<div 
				className="absolute inset-0 opacity-20 bg-cover bg-center"
				style={{
					backgroundImage: "url('/assets/bgs/bg1.png')",
					filter: "blur(1px) grayscale(0.3)",
				}}
			/>
			
			{/* Grain overlay */}
			<div 
				className="absolute inset-0 opacity-10"
				style={{
					backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='4' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E\")",
				}}
			/>

			{/* Main content */}
			<div className="relative z-10 flex flex-col items-center justify-center text-center px-4 py-20">
				<div className="mb-4 inline-block px-4 py-1 bg-waifufun-neon-pink/10 border border-waifufun-neon-pink rounded-full">
					<span className="text-waifufun-neon-pink text-xs font-mono uppercase tracking-wider">
						Fair Launch Protocol
					</span>
				</div>

				<h1 className={`text-6xl md:text-8xl font-bold mb-6 ${mounted ? "animate-glow" : ""}`}>
					<span className="bg-gradient-to-r from-waifufun-neon-pink via-waifufun-neon-purple to-waifufun-neon-cyan bg-clip-text text-transparent">
						waifu.fun
					</span>
				</h1>

				<p className="text-xl md:text-2xl text-waifufun-text-secondary mb-4 max-w-2xl">
					agent token launchpad
				</p>
				
				<p className="text-sm md:text-base text-waifufun-text-info mb-8 max-w-xl font-mono">
					// launch tokens fairly on solana, ethereum, base<br />
					// autonomous ai agents<br />
					// chaos meets code
				</p>

				<div className="flex flex-col sm:flex-row gap-4 items-center">
					<Link 
						href="/create"
						className="group relative px-8 py-4 bg-waifufun-neon-pink text-white font-bold uppercase tracking-wider rounded-lg overflow-hidden transition-all duration-300 hover:scale-105"
					>
						<span className="relative z-10">Launch Token</span>
						<div className="absolute inset-0 bg-gradient-to-r from-waifufun-neon-cyan to-waifufun-neon-purple opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
					</Link>
					
					<Link 
						href="/explore"
						className="px-8 py-4 border-2 border-waifufun-neon-cyan text-waifufun-neon-cyan font-bold uppercase tracking-wider rounded-lg transition-all duration-300 hover:bg-waifufun-neon-cyan hover:text-black hover:scale-105"
					>
						Explore Tokens
					</Link>
				</div>

				{/* Floating elements */}
				<div className="absolute top-20 left-10 md:left-20 w-20 h-20 bg-waifufun-neon-pink/20 rounded-full blur-xl animate-float" />
				<div className="absolute bottom-20 right-10 md:right-20 w-32 h-32 bg-waifufun-neon-cyan/20 rounded-full blur-xl animate-float" style={{ animationDelay: "1s" }} />
				<div className="absolute top-40 right-20 md:right-40 w-16 h-16 bg-waifufun-neon-purple/20 rounded-full blur-xl animate-float" style={{ animationDelay: "2s" }} />
			</div>

			{/* Bottom gradient fade */}
			<div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-waifufun-background-primary to-transparent" />
		</div>
	);
}
