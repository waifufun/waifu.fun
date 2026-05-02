import type { Metadata } from "next";
import { WalletsPanelLoader } from "./wallets-panel-loader";

export const metadata: Metadata = {
	title: "wallets — waifu.fun",
	description: "Link wallets to your patron account. Each wallet can own agents independently.",
};

export default function WalletsPage() {
	return (
		<div className="max-w-4xl mx-auto px-5 md:px-8 py-12">
			<div className="mb-8">
				<p className="text-[10px] font-mono uppercase tracking-[0.24em] text-[#71717a] mb-2">
					waifu.fun / patron / wallets
				</p>
				<h1 className="text-2xl md:text-3xl font-medium text-[#e4e4e7] tracking-tight">your wallets</h1>
				<p className="mt-2 text-sm text-[#a1a1aa] max-w-[68ch] leading-relaxed">
					link wallets to your patron account. each wallet can own agents independently. your primary wallet is used for
					new launches by default.
				</p>
			</div>
			<WalletsPanelLoader />
		</div>
	);
}
