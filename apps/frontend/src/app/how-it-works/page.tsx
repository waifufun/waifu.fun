export default function Page() {
	return (
		<div className="flex flex-col flex-1">
			<div className="w-full max-w-5xl mx-auto px-4 py-12">
				{/* Page Header */}
				<div className="mb-10">
					<h1 className="text-3xl font-bold text-[#e4e4e7] tracking-tight mb-3">FAQ</h1>
					<p className="text-sm text-[#a1a1aa] leading-relaxed">
						<span className="text-[#00ff87] font-semibold">waifu.fun</span> is an all-in-one solution to launch tokens, manage
						communities, generate visual assets, and grow your project — powered by ElizaOS.
					</p>
				</div>

				<div className="space-y-6">
					{/* Launch Options Section */}
					<section className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
						<h2 className="text-xl font-semibold text-[#e4e4e7] mb-6">Coin Launch Options</h2>
						<div className="space-y-4">
							<p className="text-sm text-[#a1a1aa] leading-relaxed">
								<span className="text-[#00ff87] font-semibold">waifu.fun</span> offers three launch modes:
							</p>
							<div className="space-y-4">
								<div>
									<h3 className="text-base font-semibold text-[#e4e4e7] mb-1">1. Auto</h3>
									<p className="text-sm text-[#a1a1aa] leading-relaxed">
										As the name suggests, everything from the description to the ticker and image is generated
										automatically based on your prompt. If you don't have one, it even generates a punchy prompt for you
										to begin with which you can launch with a single click. Auto mode uses a bonding curve with 28 SOL
										initial virtual reserves. When a coin reaches 113 SOL in reserves, it automatically graduates to
										Meteora with a 6 SOL flat fee.
									</p>
								</div>
								<div>
									<h3 className="text-base font-semibold text-[#e4e4e7] mb-1">2. Manual</h3>
									<p className="text-sm text-[#a1a1aa] leading-relaxed">
										Manual mode unlocks advanced configuration and sniper protection. Projects can choose a larger bonding
										curve size, delay the tradable start time, limit transaction amounts for the first 8 hours, and select
										Raydium as the pool after graduation in addition to Meteora.
									</p>
								</div>
								<div>
									<h3 className="text-base font-semibold text-[#e4e4e7] mb-1">3. Import</h3>
									<p className="text-sm text-[#a1a1aa] leading-relaxed">
										Import lets you add existing tokens to the <span className="text-[#00ff87] font-semibold">waifu.fun</span> ecosystem to access community and agent features.
										It does not create a new liquidity pool or bonding curve.
									</p>
								</div>
							</div>
						</div>
					</section>

					{/* Liquidity & Points Section */}
					<section className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
						<div className="space-y-6">
							<div>
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Liquidity</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									LP tokens for graduated coins are locked with a 90/10 token split for creators and <span className="text-[#00ff87] font-semibold">waifu.fun</span>{" "}
									respectively with burn and earn mechanisms.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">waifu.fun Points</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									Each week on Sunday 00:00 UTC, 1,000,000 points are distributed based on the share of weekly points
									earned by each user. Since the total is fixed, using the platform when fewer people are trading can
									earn you a larger share.
								</p>
							</div>
						</div>
					</section>

					{/* Community & Features Section */}
					<section className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
						<h2 className="text-xl font-semibold text-[#e4e4e7] mb-6">Features</h2>
						<div className="space-y-6">
							<div>
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Community Management</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									Managing a Telegram group is hard work. Instead, token communities can use the chat on their token
									pages. The three levels of chat rooms, requiring 1k, 100k, and 1m tokens respectively, allows
									communities to gather together while also providing privacy for the whale chat as they plan the
									project's growth.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">AI Asset Creation</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									Token holders can generate photos and videos for their project directly on the platform. Holding more
									tokens unlocks more advanced AI models for better visual output. Assets can be shared straight in the
									chat so the community can decide what to use and where.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">AI Agents</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									Through our integration with Eliza Cloud, creators can configure and host agents on the platform, then
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
