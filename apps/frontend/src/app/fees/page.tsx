import type { Metadata } from "next";

import { FeesPageClient } from "./fees-client";

export const metadata: Metadata = {
	title: "fees · waifu.fun",
	description: "what waifu.fun costs. FLAP curve, graduation, post-grad tax.",
};

export default function FeesPage() {
	return <FeesPageClient />;
}
