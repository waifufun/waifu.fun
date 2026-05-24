import type { Metadata } from "next";
import { WalletsContent } from "./wallets-content";

export const metadata: Metadata = {
	title: "wallets · waifu.fun",
	description: "Link wallets to your patron account. Each wallet can own agents independently.",
};

export default function WalletsPage() {
	return <WalletsContent />;
}
