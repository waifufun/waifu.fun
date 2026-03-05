import Link from "next/link";

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer
			className="shrink-0 mt-auto py-10"
			style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
		>
			<div className="w-full max-w-6xl mx-auto px-4">
				{/* Main footer row */}
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-6">
					{/* Left: branding */}
					<div className="flex flex-col gap-1.5">
						<Link
							href="/"
							className="font-bold text-lg tracking-tight text-[#e4e4e7] hover:text-[#e4e4e7] transition-colors duration-200"
							aria-label="waifu.fun home"
						>
							waifu.fun
						</Link>
						<p className="text-sm font-mono text-[#52525b]">
							autonomous agents on solana
						</p>
						<p className="text-xs font-mono text-[#52525b] flex items-center gap-1.5 mt-1">
							<span className="inline-block w-1 h-1 rounded-full bg-[#00ff87] opacity-60" />
							powered by ElizaOS
						</p>
					</div>
				</div>

				{/* Ecosystem links */}
				<div
					className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4"
					style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}
				>
					<div className="flex flex-wrap items-center gap-4 text-xs">
						<a
							href="https://elizaos.ai"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							elizaos
						</a>
						<a
							href="https://elizaos.github.io/eliza/"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							docs
						</a>
						<a
							href="https://github.com/elizaOS/eliza"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							github
						</a>
						<a
							href="https://x.com/elizaos"
							target="_blank"
							rel="noopener noreferrer"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							x
						</a>
					</div>
					<span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-[#52525b] px-2.5 py-1 rounded-sm border border-[rgba(0,255,135,0.1)] bg-[rgba(0,255,135,0.03)]">
						<span className="text-[#00ff87] opacity-60">●</span>
						built on eliza cloud
					</span>
				</div>

				{/* Bottom row: copyright + legal */}
				<div
					className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-5 text-xs"
					style={{ borderTop: "1px solid rgba(255, 255, 255, 0.04)" }}
				>
					<p className="text-[#52525b] font-mono">&copy; {year} waifu.fun</p>
					<div className="flex flex-wrap items-center gap-4">
						<Link
							href="/privacy-policy"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							privacy
						</Link>
						<Link
							href="/terms-of-service"
							className="text-[#52525b] hover:text-[#00ff87] transition-colors duration-200"
						>
							terms
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
