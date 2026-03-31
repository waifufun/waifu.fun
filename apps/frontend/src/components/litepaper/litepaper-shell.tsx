"use client";

import Image from "next/image";
import Link from "next/link";

export default function LitepaperShell({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<div className="relative overflow-x-hidden bg-[#08080a] text-[#e4e4e7]">
			{/* Fixed scanlines — matching story page */}
			<div
				className="fixed inset-0 pointer-events-none z-50 opacity-[0.015]"
				style={{
					backgroundImage:
						"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
				}}
			/>
			{/* Fixed noise grain */}
			<div
				className="fixed inset-0 pointer-events-none z-40 opacity-[0.03]"
				style={{
					backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
				}}
			/>

			<div className="relative z-10">{children}</div>

			{/* Footer */}
			<footer className="relative z-10 border-t border-[rgba(255,255,255,0.06)] py-12">
				<div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-8 sm:flex-row sm:justify-between">
					<div className="flex items-center gap-4">
						<div className="relative h-7 w-7 overflow-hidden rounded-sm border border-[rgba(255,255,255,0.06)] bg-[#111114]">
							<Image src="/brand/icon/icon_1024.png" alt="waifu.fun" fill className="object-cover" sizes="28px" />
						</div>
						<Link href="/" className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b] hover:text-[#a1a1aa] transition-colors">
							waifu.fun
						</Link>
					</div>
					<div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[#3f3f46]">
						<a href="https://elizaos.ai" target="_blank" rel="noopener noreferrer" className="hover:text-[#71717a] transition-colors">elizaOS</a>
						<span className="text-[#27272a]">×</span>
						<a href="https://milady.ai" target="_blank" rel="noopener noreferrer" className="hover:text-[#71717a] transition-colors">milady cloud</a>
						<span className="text-[#27272a]">×</span>
						<span>steward</span>
					</div>
					<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#3f3f46]">
						&copy; {new Date().getFullYear()}
					</p>
				</div>
			</footer>
		</div>
	);
}
