import Link from "next/link";
import Image from "next/image";

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer
			className="shrink-0 mt-auto py-8"
			style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
		>
			<div className="w-full max-w-6xl mx-auto px-4">
				{/* Main footer row */}
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-6">
					{/* Left: branding */}
					<div className="flex flex-col gap-1">
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
					</div>

					{/* Right: social icons */}
					<div className="flex items-center gap-4">
						<Link
							href="https://waifu.fun"
							target="_blank"
							rel="noopener noreferrer"
							className="opacity-70 hover:opacity-100 transition-opacity duration-200"
							aria-label="Website"
						>
							<Image src="/socials/website.svg" width={20} height={20} alt="" unoptimized />
						</Link>
						<Link
							href="https://discord.gg/waifufun"
							target="_blank"
							rel="noopener noreferrer"
							className="opacity-70 hover:opacity-100 transition-opacity duration-200"
							aria-label="Discord"
						>
							<Image src="/socials/discord.svg" width={20} height={20} alt="" unoptimized />
						</Link>
						<Link
							href="https://x.com/waifufun"
							target="_blank"
							rel="noopener noreferrer"
							className="opacity-70 hover:opacity-100 transition-opacity duration-200"
							aria-label="X (Twitter)"
						>
							<Image src="/socials/twitter.svg" width={20} height={20} alt="" unoptimized />
						</Link>
					</div>
				</div>

				{/* Bottom row: copyright + legal */}
				<div
					className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 text-sm"
					style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
				>
					<p className="text-[#52525b]">&copy; {year} waifu.fun</p>
					<div className="flex flex-wrap items-center gap-4">
						<Link
							href="/privacy-policy"
							className="text-[#71717a] hover:text-[#a78bfa] transition-colors duration-200"
						>
							Privacy Policy
						</Link>
						<Link
							href="/terms-of-service"
							className="text-[#71717a] hover:text-[#a78bfa] transition-colors duration-200"
						>
							Terms of Service
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
