export default function Page() {
	return (
		<div className="flex flex-col flex-1 ">
			<div className="max-w-[800px] mx-auto mb-8">
				<h1 className="p-6 text-4xl font-bold text-white ">How it works</h1>

				<div className="space-y-8">
					{/* FAQ Section */}
					<section className="bg-none p-6 ">
						<div className="space-y-6">
							<div className="flex flex-col gap-y-3">
								<h3 className="text-lg font-bold text-white">Coin Launch Options</h3>
								<p className="text-[#8C8C8C]">Auto.fun offers two approaches:</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">1. New Coins: </span>
									Launch with our bonding curve mechanism that provides initial price stability, dynamic pricing,
									guaranteed liquidity, and automated graduation to Raydium. Create a coin manually or generate one.
								</p>
								<p className="text-[#8C8C8C]">
									<span className="text-[#8C8C8C] font-bold">2. Existing Coins: </span>
									Import coins already trading elsewhere, maintaining your existing liquidity while gaining access to
									the auto.fun ecosystem.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">Bonding Curve</h3>
								<p className="text-[#8C8C8C]">
									Auto.fun uses a bonding curve with 28 SOL initial virtual reserves. When a coin reaches 113 SOL in
									reserves, it automatically graduates to Raydium with a 6 SOL flat fee.
								</p>
							</div>
							<div>
								<h3 className="text-lg font-bold text-white mb-2">Liquidity</h3>
								<p className="text-[#8C8C8C]">
									LP tokens for graduated coins are locked with a 90/10 token split for creators and Auto.fun
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
