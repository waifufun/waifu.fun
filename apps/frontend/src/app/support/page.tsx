import Image from "next/image";
import Link from "next/link";

export default function SupportPage() {
	return (
		<div className="flex flex-col flex-1 min-h-[100vh]">
			<div className="w-full max-w-5xl mx-auto px-4 py-12">
				{/* Page Header */}
				<div className="mb-10">
					<h1 className="text-3xl font-bold text-[#00ff87] tracking-tight mb-2">Support</h1>
					<p className="text-sm text-[#71717a]">Get help, ask questions, or report issues</p>
				</div>

				<div className="space-y-8">
					{/* Contact Section */}
					<section className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
						<h2 className="text-xl font-semibold text-[#00ff87] mb-4">Contact Us</h2>
						<div className="space-y-4">
							<Link
								href="https://twitter.com/waifufun"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#00ff87] transition-colors"
							>
								<Image height={24} width={24} alt="twitter-icon" src="/socials/twitter.svg" />
								@waifufun
							</Link>
							<Link
								href="https://discord.com/invite/tgCCVF9vEa"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#00ff87] transition-colors"
							>
								<Image height={26} width={26} alt="discord-icon" src="/socials/discord.svg" />
								Join our Discord
							</Link>
							<Link
								href="https://t.me/waifufunbot"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#00ff87] transition-colors"
							>
								<Image height={26} width={26} alt="telegram-icon" src="/socials/telegram.svg" />
								@waifufunbot
							</Link>
							<Link
								href="https://tally.so/r/mOr8DM"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#00ff87] transition-colors"
							>
								<Image height={26} width={26} alt="submit-icon" src="/socials/submit.svg" />
								Submit an issue
							</Link>
						</div>
					</section>

					{/* FAQ Section */}
					<section className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
						<h2 className="text-xl font-semibold text-[#00ff87] mb-6">How it Works</h2>
						<div className="space-y-6">
							<div className="flex flex-col gap-y-3">
								<h3 className="text-base font-semibold text-[#e4e4e7]">Coin Launch Options</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">waifu.fun offers two approaches:</p>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									<span className="font-semibold text-[#e4e4e7]">1. New Coins: </span>
									Launch with our bonding curve mechanism that provides initial price stability, dynamic pricing,
									guaranteed liquidity, and automated graduation to a DEX. Create a coin manually or generate one.
								</p>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									<span className="font-semibold text-[#e4e4e7]">2. Existing Coins: </span>
									Import coins already trading elsewhere, maintaining your existing liquidity while gaining access to
									the waifu.fun ecosystem.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Bonding Curve</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									waifu.fun uses a bonding curve with initial virtual reserves. when reserves hit the graduation
									threshold, it automatically migrates to a DEX with a flat fee.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Liquidity</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									LP tokens for graduated coins are locked with a 90/10 token split for creators and waifu.fun
									respectively with burn and earn mechanisms.
								</p>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
