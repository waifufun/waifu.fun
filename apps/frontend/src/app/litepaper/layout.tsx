import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Litepaper",
	description: "The Autonomous Agent Economy — AI companions that own themselves.",
};

export default function LitepaperLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<div className="relative overflow-x-hidden bg-waifu-black text-white">
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,255,135,0.12),transparent_30%),radial-gradient(circle_at_85%_20%,rgba(255,50,180,0.08),transparent_18%),radial-gradient(circle_at_50%_120%,rgba(0,200,255,0.08),transparent_22%)]" />
			<div className="pointer-events-none absolute inset-0 bg-[url('/textures/noise.png')] bg-[length:320px_320px] opacity-[0.035] mix-blend-screen" />
			<div className="relative">{children}</div>
		</div>
	);
}
