import type { Metadata } from "next";
import Image from "next/image";

export const metadata: Metadata = {
	title: "Litepaper",
	description: "The agent launchpad where trading fees fine-tune your waifu's model.",
};

export default function LitepaperLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<div className="relative overflow-x-hidden bg-waifu-black text-white">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,255,135,0.12),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(255,50,180,0.08),transparent_18%)]" />
			<div className="pointer-events-none absolute inset-0 bg-[url('/textures/noise.png')] bg-[length:320px_320px] opacity-[0.035] mix-blend-screen" />
			<div className="relative">{children}</div>

			{/* Footer */}
			<footer className="relative border-t border-white/8 px-6 py-12 sm:px-8 lg:px-12 xl:px-16">
				<div className="mx-auto flex max-w-[1600px] flex-col items-center gap-8 sm:flex-row sm:justify-between">
					<div className="flex items-center gap-4">
						<div className="relative h-8 w-8 overflow-hidden rounded-full border border-white/10 bg-white/5">
							<Image src="/brand/icon/icon_1024.png" alt="waifu.fun" fill className="object-cover" sizes="32px" />
						</div>
						<p className="font-orbitron text-[10px] uppercase tracking-[0.4em] text-white/40">waifu.fun</p>
					</div>
					<div className="flex flex-wrap items-center justify-center gap-6 text-[11px] uppercase tracking-[0.2em] text-white/30" style={{ fontFamily: "DMMono, monospace" }}>
						<span>elizaOS</span>
						<span className="text-white/10">|</span>
						<span>milady cloud</span>
						<span className="text-white/10">|</span>
						<span>steward</span>
					</div>
					<p className="text-[11px] uppercase tracking-[0.2em] text-white/25" style={{ fontFamily: "DMMono, monospace" }}>
						&copy; {new Date().getFullYear()} waifu.fun
					</p>
				</div>
			</footer>
		</div>
	);
}
