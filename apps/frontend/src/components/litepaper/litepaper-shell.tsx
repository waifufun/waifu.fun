"use client";

import { useTranslation } from "@/contexts/locale-context";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";

const GlitchBg = dynamic(() => import("../landing/glitch-bg"), { ssr: false });

export default function LitepaperShell({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const { t } = useTranslation();
	return (
		<div className="relative overflow-x-hidden bg-[#08080a] text-[#e4e4e7]">
			{/* Fixed katakana matrix, subtle, breathing background */}
			<div className="fixed inset-0 z-0 opacity-[0.08] pointer-events-none">
				<GlitchBg
					glitchColors={["#0a1a12", "#00ff87", "#0d2818"]}
					glitchSpeed={80}
					smooth
					characters="アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン01"
				/>
			</div>
			{/* Blur veil over matrix to soften it */}
			<div className="fixed inset-0 z-[1] pointer-events-none backdrop-blur-[1px]" />

			{/* Fixed scanlines, matching story page */}
			<div
				className="fixed inset-0 pointer-events-none z-50 opacity-[0.015]"
				style={{
					backgroundImage:
						"repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)",
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
						<Link
							href="/"
							className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#52525b] hover:text-[#a1a1aa] transition-colors"
						>
							{t("litepaper.shell.footerHome")}
						</Link>
					</div>
					<div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[#3f3f46]">
						<span>{t("litepaper.shell.footerFlap")}</span>
						<span className="text-[#27272a]">&times;</span>
						<a
							href="https://pancakeswap.finance"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-[#71717a] transition-colors"
						>
							{t("litepaper.shell.footerPancakeswap")}
						</a>
						<span className="text-[#27272a]">&times;</span>
						<span>{t("litepaper.shell.footerAgentSafe")}</span>
					</div>
					<p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#3f3f46]">
						&copy; {new Date().getFullYear()}
					</p>
				</div>
			</footer>
		</div>
	);
}
