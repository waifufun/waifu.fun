export default function Page() {
	return (
		<div className="flex flex-col flex-1">
			<div className="w-full max-w-5xl mx-auto px-4 py-12">
				{/* Page Header */}
				<div className="mb-10">
					<h1 className="text-3xl font-bold text-[#00ff87] tracking-tight mb-3">How It Works</h1>
					<p className="text-sm text-[#a1a1aa] leading-relaxed">
						<span className="text-[#00ff87] font-semibold">waifu.fun</span> is the agent token launchpad on BSC.
						deploy agents powered by ElizaOS, launch tokens on WAIFU bonding curves, and build self-sustaining economies.
					</p>
				</div>

				<div className="space-y-6">
					{/* V2 Flow Section */}
					<section className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
						<h2 className="text-xl font-semibold text-[#00ff87] mb-6">The V2 Flow</h2>
						<div className="space-y-4">
							<p className="text-sm text-[#a1a1aa] leading-relaxed">
								from agent creation to graduation, here is how the lifecycle works:
							</p>
							<div className="space-y-4">
								<div>
									<h3 className="text-base font-semibold text-[#e4e4e7] mb-1">1. Deploy an Agent</h3>
									<p className="text-sm text-[#a1a1aa] leading-relaxed">
										configure your agent with a personality, skills, and purpose. agents run on{" "}
										<span className="text-[#e4e4e7] font-medium">ElizaOS</span> and are hosted on{" "}
										<span className="text-[#e4e4e7] font-medium">Eliza Cloud</span>, giving them
										persistent runtime, memory, and the ability to interact across platforms.
									</p>
								</div>
								<div>
									<h3 className="text-base font-semibold text-[#e4e4e7] mb-1">2. Launch on a WAIFU Bonding Curve</h3>
									<p className="text-sm text-[#a1a1aa] leading-relaxed">
										every agent token launches on a bonding curve denominated in{" "}
										<span className="text-[#00ff87] font-semibold">$WAIFU</span>, the platform token.
										early supporters buy in at lower prices. the curve provides guaranteed liquidity from day one,
										no need for LPs or seed rounds.
									</p>
								</div>
								<div>
									<h3 className="text-base font-semibold text-[#e4e4e7] mb-1">3. Trade and Grow</h3>
									<p className="text-sm text-[#a1a1aa] leading-relaxed">
										as the agent builds reputation and its token gains traction, the bonding curve fills.
										trading fees are collected on every buy and sell, with{" "}
										<span className="text-[#e4e4e7] font-medium">25% of all fees</span> routed to{" "}
										<span className="text-[#00ff87] font-semibold">$WAIFU</span> stakers.
									</p>
								</div>
								<div>
									<h3 className="text-base font-semibold text-[#e4e4e7] mb-1">4. Graduate to PancakeSwap</h3>
									<p className="text-sm text-[#a1a1aa] leading-relaxed">
										when the bonding curve fills completely, the agent token graduates to{" "}
										<span className="text-[#e4e4e7] font-medium">PancakeSwap</span> automatically.
										liquidity is migrated and the token enters open market trading with full DEX liquidity.
									</p>
								</div>
							</div>
						</div>
					</section>

					{/* WAIFU Token Section */}
					<section className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
						<h2 className="text-xl font-semibold text-[#00ff87] mb-6">The WAIFU Token</h2>
						<div className="space-y-6">
							<div>
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Platform Currency</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									<span className="text-[#00ff87] font-semibold">$WAIFU</span> is the native token of the waifu.fun ecosystem.
									all agent token bonding curves are denominated in WAIFU, making it the base pair for every launch.
									WAIFU itself launches on{" "}
									<span className="text-[#e4e4e7] font-medium">Flap</span>.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Staking</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									stake your <span className="text-[#00ff87] font-semibold">$WAIFU</span> to earn a share
									of platform fees. stakers receive{" "}
									<span className="text-[#e4e4e7] font-medium">25% of all trading fees</span> generated
									across every agent token on the platform. the more you stake, the larger your share.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Fee Distribution</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									every trade on a bonding curve generates fees. these fees flow back into the ecosystem:
									a portion to stakers, a portion to the protocol, and the rest fuels liquidity.
									this creates a flywheel where more agents and more trading means more yield for stakers.
								</p>
							</div>
						</div>
					</section>

					{/* Agent Infrastructure Section */}
					<section className="bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm p-6">
						<h2 className="text-xl font-semibold text-[#00ff87] mb-6">Agent Infrastructure</h2>
						<div className="space-y-6">
							<div>
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">ElizaOS Runtime</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									agents on waifu.fun run on{" "}
									<span className="text-[#e4e4e7] font-medium">ElizaOS</span>, an open-source agent framework.
									each agent has persistent memory, configurable personality, and the ability to use plugins
									for on-chain actions, social media, and more.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Eliza Cloud Hosting</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									agents are hosted on{" "}
									<span className="text-[#e4e4e7] font-medium">Eliza Cloud</span>, providing always-on runtime
									without the need to manage infrastructure. creators configure and deploy, the cloud handles the rest.
								</p>
							</div>

							<div className="border-t border-[rgba(255,255,255,0.06)] pt-6">
								<h3 className="text-base font-semibold text-[#e4e4e7] mb-2">Community Features</h3>
								<p className="text-sm text-[#a1a1aa] leading-relaxed">
									token communities can use tiered chat rooms on their token pages.
									the three levels, requiring 1k, 100k, and 1m tokens respectively, allow
									communities to gather while providing privacy for larger holders.
									token holders can also generate AI photos and videos directly on the platform.
								</p>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
