import Image from "next/image";
import Link from "next/link";

export default function SupportPage() {
	return (
		<div className="flex flex-col flex-1 min-h-[100vh]">
			<div className="max-w-[800px] mx-auto mb-8">
				<h1 className="text-4xl font-bold text-white mb-8">Support</h1>

				<div className="space-y-8">
					{/* Contact Section */}
					<section className="bg-black p-6 border border-[#262626]">
						<h2 className="text-2xl font-medium text-white mb-4">Contact Us</h2>
						<div className="space-y-4">
							<Link
								href="https://twitter.com/autodotfun"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 text-white hover:text-[#E8762D] transition-colors"
							>
								<Image height={24} width={24} alt="twitter-icon" src="/socials/twitter.svg" />
								@autodotfun
							</Link>
							<Link
								href="https://discord.com/invite/tgCCVF9vEa"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 text-white hover:text-[#E8762D] transition-colors"
							>
								<Image height={26} width={26} alt="discord-icon" src="/socials/discord.svg" />
								Join our Discord
							</Link>
							<Link
								href="https://web.telegram.org/k/#@AutoDotFunBot"
								className="flex items-center gap-2 text-white hover:text-[#E8762D] transition-colors"
							>
								<Image height={26} width={26} alt="discord-icon" src="/socials/telegram.svg" />
								@AutoDotFunBot
							</Link>
							<Link
								href="https://tally.so/r/mOr8DM"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 text-white hover:text-[#E8762D] transition-colors"
							>
								<Image height={26} width={26} alt="submit-icon" src="/socials/submit.svg" />
								Submit an issue
							</Link>
						</div>
					</section>

					{/* FAQ Section */}
					<section className="bg-black p-6 border border-[#262626]">
						<h2 className="text-2xl font-medium text-white mb-4">How it Works</h2>
						<div className="space-y-6">
							<div className="flex flex-col gap-y-3">
								<h3 className="text-lg font-bold text-white">Coin Launch Options</h3>
								<p className="text-[#8C8C8C]">Waifu.fun offers two approaches:</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">1. New Coins: </span>
									Launch with our bonding curve mechanism that provides initial price stability, dynamic pricing,
									guaranteed liquidity, and automated graduation to Raydium. Create a coin manually or generate one.
								</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">2. Existing Coins: </span>
									Import coins already trading elsewhere, maintaining your existing liquidity while gaining access to
									the waifu.fun ecosystem.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">Bonding Curve</h3>
								<p className="text-[#8C8C8C]">
									Waifu.fun uses a bonding curve with 28 SOL initial virtual reserves. When a coin reaches 113 SOL in
									reserves, it automatically graduates to Raydium with a 6 SOL flat fee.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">Liquidity</h3>
								<p className="text-[#8C8C8C]">
									LP tokens for graduated coins are locked with a 90/10 token split for creators and Waifu.fun
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
