export default function Page() {
	return (
		<div className="flex flex-col flex-1">
			<div className="max-w-[800px] mx-auto flex flex-col gap-4">
				<h1 className="text-4xl font-bold text-white ">FAQ</h1>
				<div className="flex flex-col gap-y-3">
					<p className="text-[#8C8C8C]">
						<span className="text-white font-bold">Waifu.fun</span> is an all-in-one solution to launch tokens, manage
						communities, generate visual assets, and grow your project.
					</p>
				</div>
				<div className="space-y-8">
					{/* FAQ Section */}
					<section className="bg-none">
						<div className="space-y-6">
							<div className="flex flex-col gap-y-3">
								<h3 className="text-lg font-bold text-white">Coin Launch Options</h3>
								<p className="text-[#8C8C8C]">
									<span className="text-white font-bold">Waifu.fun</span> offers three launch modes:
								</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">1. Auto: </span>
									As the name suggests, everything from the description to the ticker and image is generated
									automatically based on your prompt. If you don’t have one, it even generates a punchy prompt for you
									to begin with which you can launch with a single click. Auto mode uses a bonding curve with 28 SOL
									initial virtual reserves. When a coin reaches 113 SOL in reserves, it automatically graduates to
									Meteora with a 6 SOL flat fee.
								</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">2. Manual: </span>
									Manual mode unlocks advanced configuration and sniper protection. Projects can choose a larger bonding
									curve size, delay the tradable start time, limit transaction amounts for the first 8 hours, and select
									Raydium as the pool after graduation in addition to Meteora.
								</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">3. Import: </span>
									Import lets you add existing tokens to the Waifu.fun ecosystem to access community and agent features.
									It does not create a new liquidity pool or bonding curve.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">Liquidity</h3>
								<p className="text-[#8C8C8C]">
									LP tokens for graduated coins are locked with a 90/10 token split for creators and Waifu.fun
									respectively with burn and earn mechanisms.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">Waifu.fun Points</h3>
								<p className="text-[#8C8C8C]">
									Each week on Sunday 00:00 UTC, 1,000,000 points are distributed based on the share of weekly points
									earned by each user. Since the total is fixed, using the platform when fewer people are trading can
									earn you a larger share.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">Community Management</h3>
								<p className="text-[#8C8C8C]">
									Managing a Telegram group is hard work. Instead, token communities can use the chat on their token
									pages. The three levels of chat rooms, requiring 1k, 100k, and 1m tokens respectively, allows
									communities to gather together while also providing privacy for the whale chat as they plan the
									project's growth.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">AI Asset Creation</h3>
								<p className="text-[#8C8C8C]">
									Token holders can generate photos and videos for their project directly on the platform. Holding more
									tokens unlocks more advanced AI models for better visual output. Assets can be shared straight in the
									chat so the community can decide what to use and where.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">AI Agents</h3>
								<p className="text-[#8C8C8C]">
									Through our integration with Fleek, creators can configure and host agents on Fleek’s platform, then
									connect them to their token. This feature is under active development.
								</p>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
