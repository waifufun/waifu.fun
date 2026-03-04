import Link from "next/link";
import Image from "next/image";

export default function Footer() {
	const year = new Date().getFullYear();

	return (
		<footer className="py-8 pt-10">
			<div className="w-full max-w-4xl mx-auto px-4">
				{/* Rounded content block */}
				<div className="rounded-xl border border-white/10 p-6 sm:p-8 mb-8">
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
						{/* Left: branding */}
						<div className="flex flex-col gap-1">
							<Link href="/" className="flex items-center gap-2">
								<Image
									src="/logo_wide.svg"
									height={32}
									width={64}
									className="h-8 w-auto"
									unoptimized
									alt="waifu.fun"
								/>
							</Link>
							<p className="text-sm text-gray-500">Press the fun button.</p>
						</div>
						{/* Right: social / utility icons */}
						<div className="flex items-center gap-4">
							<Link
								href="https://waifu.fun"
								target="_blank"
								rel="noopener noreferrer"
								className="text-gray-400 hover:text-white transition-colors"
								aria-label="Website"
							>
								<Image src="/socials/website.svg" width={24} height={24} alt="" unoptimized />
							</Link>
							<Link
								href="https://discord.gg/waifufun"
								target="_blank"
								rel="noopener noreferrer"
								className="text-gray-400 hover:text-white transition-colors"
								aria-label="Discord"
							>
								<Image src="/socials/discord.svg" width={24} height={24} alt="" unoptimized />
							</Link>
							<Link
								href="https://x.com/waifufun"
								target="_blank"
								rel="noopener noreferrer"
								className="text-gray-400 hover:text-white transition-colors"
								aria-label="X (Twitter)"
							>
								<Image src="/socials/twitter.svg" width={24} height={24} alt="" unoptimized />
							</Link>
						</div>
					</div>
				</div>

				{/* Bottom row: copyright + legal links */}
				<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
					<p className="text-gray-500">&copy; {year} waifu.fun</p>
					<div className="flex flex-wrap items-center gap-4">
						<Link
							href="/privacy-policy"
							className="text-blue-500 hover:text-blue-400 transition-colors"
						>
							Privacy Policy
						</Link>
						<Link
							href="/terms-of-service"
							className="text-blue-500 hover:text-blue-400 transition-colors"
						>
							Terms of Service
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
