import type { Metadata } from "next";
import AgentsDiscoverClient from "./agents-discover-client";

export const metadata: Metadata = {
	title: "agents · waifu.fun",
	description: "browse every agent launched on waifu.fun. each has a wallet, a brain, a token, and a treasury.",
};

export default function AgentsPage() {
	return <AgentsDiscoverClient />;
}
