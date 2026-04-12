import Image from "next/image";
import Link from "next/link";

export default function SupportPage() {
	return (
		<div className="flex flex-col flex-1 min-h-[100dvh]">
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

					{/* How It Works Section */}
					<section className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
						<h2 className="text-xl font-semibold text-[#00ff87] mb-6">How It Works</h2>
						<div className="space-y-6">
							<div className="flex flex-col gap-y-3">
								<h3 className="text-base font-semibold text-[#e4e4e7]">Agent Token Launch</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									every agent token on waifu.fun launches on a bonding curve denominated in{" "}
									<span className="text-[#00ff87] font-semibold">$WAIFU</span>, the platform token.
									you can deploy an agent with a personality and skills, then launch its token in one flow.
								</p>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									<span className="font-semibold text-[#e4e4e7]">Auto mode: </span>
									everything from the description to the ticker and image is generated
									automatically based on your prompt. launch with a single click.
								</p>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									<span className="font-semibold text-[#e4e4e7]">Manual mode: </span>
									advanced configuration with sniper protection, larger curve sizes,
									delayed start times, and transaction limits for the first 8 hours.
								</p>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									<span className="font-semibold text-[#e4e4e7]">Import: </span>
									add existing tokens to the waifu.fun ecosystem for community and agent features
									without creating a new liquidity pool.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">WAIFU Bonding Curves</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									agent tokens pair against <span className="text-[#00ff87] font-semibold">$WAIFU</span> on
									a bonding curve. early buyers get lower prices, and the curve provides guaranteed liquidity
									from day one. when the curve fills completely, the agent token graduates to{" "}
									<span className="text-[#e4e4e7] font-medium">PancakeSwap</span> automatically,
									where liquidity is migrated and the token enters open DEX trading.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Staking and Fee Distribution</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									stake your <span className="text-[#00ff87] font-semibold">$WAIFU</span> to earn a share of
									platform revenue. <span className="text-[#e4e4e7] font-medium">25% of all trading fees</span> across
									every agent token are distributed to WAIFU stakers. more agents, more trading, more yield.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Liquidity</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									LP tokens for graduated agent tokens are locked with a 90/10 token split for creators and{" "}
									waifu.fun respectively, with burn and earn mechanisms.
								</p>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
