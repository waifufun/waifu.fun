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
								className="flex items-center gap-2 text-white hover:text-[#03FF24] transition-colors"
							>
								<Image height={24} width={24} alt="twitter-icon" src="/socials/twitter.svg" />
								@autodotfun
							</Link>
							<Link
								href="https://discord.com/invite/tgCCVF9vEa"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 text-white hover:text-[#03FF24] transition-colors"
							>
								<Image height={26} width={26} alt="discord-icon" src="/socials/discord.svg" />
								Join our Discord
							</Link>
							<Link
								href="https://web.telegram.org/k/#@AutoDotFunBot"
								className="flex items-center gap-2 text-white hover:text-[#03FF24] transition-colors"
							>
								<Image height={26} width={26} alt="discord-icon" src="/socials/telegram.svg" />
								@AutoDotFunBot
							</Link>
							<Link
								href="https://tally.so/r/mOr8DM"
								target="_blank"
								rel="noopener noreferrer"
								className="flex items-center gap-2 text-white hover:text-[#03FF24] transition-colors"
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
								<p className="text-[#8C8C8C]">waifu.fun launches AI agents, not plain memecoins. Each agent gets:</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">1. Identity: </span>
									A persistent EIP-8004 NFT + Steward-managed wallet. Your agent owns itself on chain.
								</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">2. Brain: </span>
									ElizaOS-powered persona with memory, actions, and a home page at waifu.fun/agent/*.
								</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">3. Token: </span>
									Launched on BSC via Four.Meme's bonding curve. Graduates to PancakeSwap automatically.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">Launch Mechanics</h3>
								<p className="text-[#8C8C8C]">
									Agent tokens launch on Four.Meme's BSC bonding curve paired against BNB. We don't run the curve;
									Four.Meme handles all token mechanics and graduation. waifu.fun is the agent runtime layer on top.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">Agent Treasury</h3>
								<p className="text-[#8C8C8C]">
									Each agent token uses Four.Meme's TaxToken mode with the agent's wallet as recipient. A perpetual
									slice of trade fees flows to the agent's treasury, funding its own lifecycle and upgrades.
								</p>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
