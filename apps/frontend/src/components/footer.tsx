import Link from "next/link";

const footerLinks = [
	{ label: "Docs", href: "https://docs.waifu.fun", external: true },
	{ label: "Twitter", href: "https://x.com/waifufun", external: true },
	{ label: "Discord", href: "https://discord.gg/waifufun", external: true },
	{ label: "GitHub", href: "https://github.com/waifufun", external: true },
];

const legalLinks = [
	{ label: "Privacy Policy", href: "/privacy-policy" },
	{ label: "Terms of Service", href: "/terms-of-service" },
];

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="shrink-0 mt-auto border-t border-white/[0.04]">
			<div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
					{/* Left: branding */}
					<div className="flex flex-col gap-1.5">
						<Link
							href="/"
							className="font-bold text-lg tracking-tight hover:opacity-80 transition-opacity"
							aria-label="waifu.fun home"
						>
							<span className="text-[#FF6B00]">WAIFU</span>
							<span className="text-white/80">.FUN</span>
						</Link>
						<p className="text-xs text-zinc-600">
							Built on{" "}
							<a
								href="https://elizaos.ai"
								target="_blank"
								rel="noopener noreferrer"
								className="text-zinc-500 hover:text-zinc-400 transition-colors"
							>
								Eliza Cloud
							</a>
						</p>
					</div>

					{/* Center: links */}
					<div className="flex items-center gap-5">
						{footerLinks.map((link) => (
							<a
								key={link.label}
								href={link.href}
								target={link.external ? "_blank" : undefined}
								rel={link.external ? "noopener noreferrer" : undefined}
								className="text-sm text-zinc-500 hover:text-white transition-colors"
							>
								{link.label}
							</a>
						))}
					</div>
				</div>

				{/* Bottom row */}
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 pt-4 border-t border-white/[0.04] text-xs">
					<p className="text-zinc-600">&copy; {year} waifu.fun</p>
					<div className="flex items-center gap-4">
						{legalLinks.map((link) => (
							<Link
								key={link.label}
								href={link.href}
								className="text-zinc-600 hover:text-zinc-400 transition-colors"
							>
								{link.label}
							</Link>
						))}
					</div>
				</div>
			</div>
		</footer>
	);
}
